import { load, type Cheerio, type CheerioAPI } from 'cheerio'
import type { Element } from 'domhandler'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { dataRoot, ensureDirectory } from '../storage/jsonStore'
import type { DecisionRecord, DecisionStatus, PendingItem, TorrentItem, WatchTarget } from '@shared/types'
import { buildTorrentVideoFiles, findExistingLocalMatch } from './localLibraryService'
import { buildMatchCandidates, buildNormalizedKey, extractResolution, sanitizePathSegment } from './normalizeService'
import { parseTorrentMetainfo } from './torrentMetainfoService'
import { buildTorrentMatchResult, matchTorrentToWatchTargets } from './matchingService'
import { withRetry } from './retryService'

const nyaaBaseUrl = 'https://nyaa.si'
const nyaaQueryUrl = (page: number) => `https://nyaa.si/?f=0&c=1_2&q=Erai-raws+-HEVC&p=${page}`

function extractTorrentId(downloadUrl: string): string {
	const match = /\/download\/(\d+)\.torrent$/i.exec(downloadUrl)
	return match?.[1] ?? ''
}

function getViewLink($row: Cheerio<Element>): string {
	return $row.find('a[href^="/view/"]').not('.comments').first().attr('href') ?? ''
}

function getTorrentLink($row: Cheerio<Element>): string {
	return $row.find('a[href^="/download/"][href$=".torrent"]').first().attr('href') ?? ''
}

function extractRowText($: CheerioAPI, row: Cheerio<Element>): string[] {
	return row.children('td').toArray().map((element) => $(element).text().trim())
}

function parseRow($: CheerioAPI, $row: Cheerio<Element>, page: number): TorrentItem | null {
	const viewUrl = getViewLink($row)
	const downloadUrl = getTorrentLink($row)
	if (!viewUrl || !downloadUrl) {
		return null
	}
	const torrentId = extractTorrentId(downloadUrl)
	const title = sanitizePathSegment($row.find('a[href^="/view/"]').not('.comments').first().attr('title') ?? $row.find('a[href^="/view/"]').not('.comments').first().text())
	const texts = extractRowText($, $row)
	const publishedAt = $row.find('td[data-timestamp]').first().attr('data-timestamp')
	const publishedAtUtc = publishedAt ? new Date(Number(publishedAt) * 1000).toISOString() : undefined
	const sizeText = texts.find((text) => /[0-9]+(?:\.[0-9]+)?\s*(?:KiB|MiB|GiB|TiB)/i.test(text))
	const numericCells = texts.filter((text) => /^\d+$/.test(text))
	const seeders = numericCells.length > 0 ? Number(numericCells[0]) : undefined
	const leechers = numericCells.length > 1 ? Number(numericCells[1]) : undefined
	const downloads = numericCells.length > 2 ? Number(numericCells[2]) : undefined
	const resolution = extractResolution(title)
	const seriesBaseRaw = title
	return {
		torrentId,
		title,
		viewUrl,
		downloadUrl,
		page,
		publishedAtUtc,
		sizeText,
		seeders,
		leechers,
		downloads,
		seriesBaseRaw,
		resolution,
		matchCandidates: buildMatchCandidates(title, []),
	}
}

export async function fetchNyaaPage(page: number): Promise<string> {
	const response = await withRetry(async () => fetch(nyaaQueryUrl(page), {
		headers: {
			'user-agent': 'Mozilla/5.0 (compatible; NYAADL/1.0; +https://github.com)',
			'accept-language': 'en-US,en;q=0.9',
		},
	}))
	if (!response.ok) {
		throw new Error(`Failed to fetch Nyaa page ${page}: ${response.status} ${response.statusText}`)
	}
	return response.text()
}

export async function fetchTorrentBuffer(downloadUrl: string): Promise<Buffer> {
	const response = await withRetry(async () => fetch(downloadUrl, {
		headers: {
			'user-agent': 'Mozilla/5.0 (compatible; NYAADL/1.0; +https://github.com)',
			'accept': 'application/x-bittorrent,*/*',
		},
	}))
	if (!response.ok) {
		throw new Error(`Failed to fetch torrent ${downloadUrl}: ${response.status} ${response.statusText}`)
	}
	return Buffer.from(await response.arrayBuffer())
}

export async function scrapeNyaaPage(page: number): Promise<{ html: string; items: TorrentItem[] }> {
	const html = await fetchNyaaPage(page)
	const $ = load(html)
	const items = $('table.torrent-list tbody tr')
		.toArray()
		.map((row) => parseRow($, $(row), page))
		.filter((item: TorrentItem | null): item is TorrentItem => Boolean(item && item.torrentId))

	return { html, items }
}

export interface ClassifiedTorrent extends TorrentItem {
	status: DecisionStatus
	reason: string
	seriesKey: string
	downloadedFilename?: string
	matchedTarget?: WatchTarget
	internalNames: string[]
}

export async function inspectAndClassifyTorrent(item: TorrentItem, aliases: Record<string, string>, watchTargets: WatchTarget[], blacklist: string[]): Promise<ClassifiedTorrent> {
	const torrentBuffer = await fetchTorrentBuffer(`${nyaaBaseUrl}${item.downloadUrl}`)
	const metainfo = await parseTorrentMetainfo(torrentBuffer)
	const internalNames = metainfo.videoNames.length > 0 ? metainfo.videoNames : [metainfo.name]
	const torrentVideoFiles = buildTorrentVideoFiles(internalNames, metainfo.files)
	const matchResult = buildTorrentMatchResult({ title: item.title, videoNames: internalNames }, aliases)
	const matchCandidates = buildMatchCandidates(item.title, internalNames)
	const blacklistHit = blacklist.includes(matchResult.normalizedKey)
	const matchedTarget = matchTorrentToWatchTargets({ ...matchResult, matchCandidates }, watchTargets)

	if (matchedTarget) {
		const existingMatch = await findExistingLocalMatch(matchedTarget, item.title, torrentVideoFiles)
		if (existingMatch?.status === 'exact') {
			return {
				...item,
				seriesBaseRaw: matchResult.seriesBaseRaw,
				resolution: matchResult.resolution,
				matchCandidates,
				status: 'already_downloaded',
				reason: existingMatch.reason,
				seriesKey: matchResult.seriesKey,
				matchedTarget,
				internalNames,
			}
		}
		if (existingMatch?.status === 'conflict') {
			return {
				...item,
				seriesBaseRaw: matchResult.seriesBaseRaw,
				resolution: matchResult.resolution,
				matchCandidates,
				status: 'pending',
				reason: existingMatch.reason,
				seriesKey: matchResult.seriesKey,
				matchedTarget,
				internalNames,
			}
		}
		return { ...item, seriesBaseRaw: matchResult.seriesBaseRaw, resolution: matchResult.resolution, matchCandidates, status: 'auto_downloaded', reason: `matched ${matchedTarget.normalizedKey}`, seriesKey: matchResult.seriesKey, matchedTarget, internalNames }
	}
	if (blacklistHit) {
		return { ...item, seriesBaseRaw: matchResult.seriesBaseRaw, resolution: matchResult.resolution, matchCandidates, status: 'blocked', reason: `series+resolution blacklisted`, seriesKey: matchResult.seriesKey, internalNames }
	}
	return { ...item, seriesBaseRaw: matchResult.seriesBaseRaw, resolution: matchResult.resolution, matchCandidates, status: 'pending', reason: 'requires approval', seriesKey: matchResult.seriesKey, internalNames }
}

export async function savePageSnapshot(page: number, html: string, items: TorrentItem[]): Promise<void> {
	const datePrefix = new Date().toISOString().slice(0, 10)
	const archiveRoot = path.join(dataRoot, '..', 'torrents', `page-${datePrefix}-${page}`)
	await ensureDirectory(archiveRoot)
	await writeFile(path.join(archiveRoot, 'snapshot.html'), html, 'utf8')
	await writeFile(path.join(archiveRoot, 'snapshot.json'), `${JSON.stringify(items, null, 2)}\n`, 'utf8')
}