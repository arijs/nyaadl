import { load, type Cheerio, type CheerioAPI } from 'cheerio'
import type { Element } from 'domhandler'
import type { TorrentItem } from '@shared/types'
import { buildMatchCandidates, extractResolution, sanitizePathSegment } from './normalizeService'
import { withRetry } from './retryService'

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

export async function scrapeNyaaPage(page: number): Promise<{ html: string; items: TorrentItem[] }> {
	const html = await fetchNyaaPage(page)
	const $ = load(html)
	const items = $('table.torrent-list tbody tr')
		.toArray()
		.map((row) => parseRow($, $(row), page))
		.filter((item: TorrentItem | null): item is TorrentItem => Boolean(item && item.torrentId))

	return { html, items }
}
