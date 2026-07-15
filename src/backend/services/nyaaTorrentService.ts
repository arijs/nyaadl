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
	// Only scan the local library when a watch target could auto-download; a blacklist hit
	// short-circuits before this (R2), so a blocked series never triggers a disk scan.
	const existingMatch = !blacklistHit && matchedTarget ? await findExistingLocalMatch(matchedTarget, item.title, torrentVideoFiles) : undefined

	const { status, reason } = classifyTorrentDecision(blacklistHit, matchedTarget, existingMatch?.status, existingMatch?.reason)
	const base = { ...item, seriesBaseRaw: matchResult.seriesBaseRaw, resolution: matchResult.resolution, matchCandidates, seriesKey: matchResult.seriesKey, internalNames }
	// matchedTarget is only meaningful (and only recorded) when it actually drove the decision.
	return status === 'blocked' || !matchedTarget ? { ...base, status, reason } : { ...base, status, reason, matchedTarget }
}

// ponytail: blacklist has precedence over watch-target match (R2). A series+resolution block
// must win even when the series is otherwise watched, so a retroactively blacklisted resolution
// (e.g. 1080p) is never auto-downloaded via its watch folder. Pure so the ordering is testable.
export function classifyTorrentDecision(
	blacklistHit: boolean,
	matchedTarget: WatchTarget | undefined,
	existingLocalStatus: 'exact' | 'conflict' | undefined,
	existingLocalReason: string | undefined,
): { status: DecisionStatus; reason: string } {
	if (blacklistHit) {
		return { status: 'blocked', reason: 'series+resolution blacklisted' }
	}
	if (matchedTarget) {
		if (existingLocalStatus === 'exact') {
			return { status: 'already_downloaded', reason: existingLocalReason ?? 'already downloaded' }
		}
		if (existingLocalStatus === 'conflict') {
			return { status: 'pending', reason: existingLocalReason ?? 'conflict' }
		}
		return { status: 'auto_downloaded', reason: `matched ${matchedTarget.normalizedKey}` }
	}
	return { status: 'pending', reason: 'requires approval' }
}

export async function savePageSnapshot(page: number, html: string, items: TorrentItem[], customQuery?: string): Promise<void> {
	const datePrefix = new Date().toISOString().slice(0, 10)
	const archiveRoot = path.join(dataRoot, '..', 'torrents', buildNyaaSnapshotFolderName(datePrefix, page, customQuery))
	await ensureDirectory(archiveRoot)
	await writeFile(path.join(archiveRoot, 'snapshot.html'), html, 'utf8')
	await writeFile(path.join(archiveRoot, 'snapshot.json'), `${JSON.stringify(items, null, 2)}\n`, 'utf8')
}
