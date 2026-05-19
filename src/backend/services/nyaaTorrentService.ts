import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { dataRoot, ensureDirectory } from '../storage/jsonStore'
import type { DecisionStatus, TorrentItem, WatchTarget } from '@shared/types'
import { buildTorrentVideoFiles, findExistingLocalMatch } from './localLibraryService'
import { buildMatchCandidates } from './normalizeService'
import { buildNyaaSnapshotFolderName } from './nyaaQueryService'
import { parseTorrentMetainfo } from './torrentMetainfoService'
import { buildTorrentMatchResult, isTorrentBlacklisted, matchTorrentToWatchTargets } from './matchingService'
import { withRetry } from './retryService'

const nyaaBaseUrl = 'https://nyaa.si'

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
	const blacklistHit = isTorrentBlacklisted({ ...matchResult, matchCandidates }, blacklist)
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
		return { ...item, seriesBaseRaw: matchResult.seriesBaseRaw, resolution: matchResult.resolution, matchCandidates, status: 'blocked', reason: 'series+resolution blacklisted', seriesKey: matchResult.seriesKey, internalNames }
	}
	return { ...item, seriesBaseRaw: matchResult.seriesBaseRaw, resolution: matchResult.resolution, matchCandidates, status: 'pending', reason: 'requires approval', seriesKey: matchResult.seriesKey, internalNames }
}

export async function savePageSnapshot(page: number, html: string, items: TorrentItem[], customQuery?: string): Promise<void> {
	const datePrefix = new Date().toISOString().slice(0, 10)
	const archiveRoot = path.join(dataRoot, '..', 'torrents', buildNyaaSnapshotFolderName(datePrefix, page, customQuery))
	await ensureDirectory(archiveRoot)
	await writeFile(path.join(archiveRoot, 'snapshot.html'), html, 'utf8')
	await writeFile(path.join(archiveRoot, 'snapshot.json'), `${JSON.stringify(items, null, 2)}\n`, 'utf8')
}
