import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { QbittorrentTorrentSummary, WatchTargetFile } from '@shared/api'
import type { DecisionRecord, WatchTarget } from '@shared/types'
import { getDecisionInternalNames } from './decisionWorkflowService'
import type { IndexedTorrent } from './qbittorrentIndexService'
import { buildFingerprintComboKey, extractReleaseFingerprint, listMatchingVideoFiles } from './localLibraryService'

// Only video extensions: torrent titles have no extension but may contain dots ("Dr. Stone - 01").
const stripExtension = (name: string) => name.replace(/\.(mkv|mp4|avi|m4v|mov|wmv)$/i, '')

// Looks up the torrent a local file came from: by the torrent's internal file names, by its title
// (Erai-raws titles are the file name without extension), or by the [CRC32] hash both carry.
// Later decisions win, so a torrent's latest status is the one reported.
export function buildLocalFileTorrentIndex(decisions: DecisionRecord[]): (fileName: string) => DecisionRecord | undefined {
	const byName = new Map<string, DecisionRecord>()
	const byHash = new Map<string, DecisionRecord>()
	for (const decision of decisions) {
		for (const name of [...getDecisionInternalNames(decision), decision.item.title]) {
			byName.set(stripExtension(name).toLowerCase(), decision)
		}
		const fileHash = extractReleaseFingerprint(decision.item.title).fileHash
		if (fileHash) {
			byHash.set(fileHash, decision)
		}
	}
	return (fileName) => {
		const byFileName = byName.get(stripExtension(fileName).toLowerCase())
		if (byFileName) {
			return byFileName
		}
		const fileHash = extractReleaseFingerprint(fileName).fileHash
		return fileHash ? byHash.get(fileHash) : undefined
	}
}

function episodeOrder(file: WatchTargetFile): number {
	const parsed = Number.parseInt(file.episode ?? '', 10)
	return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}

export interface QbittorrentLookup {
	findByPath: (filePath: string) => IndexedTorrent | undefined
	checkNewTorrents: () => Promise<unknown>
	fetchLive: (hashes: string[]) => Promise<Map<string, QbittorrentTorrentSummary>>
}

// Fills in the qBittorrent torrent for files the decision history doesn't know: located through the local
// index (checking qBittorrent for new torrents first when a file isn't in it), with live data when qBittorrent
// answers and the index data alone when it doesn't. Returns the qBittorrent error, if any.
export async function attachQbittorrentTorrents(files: WatchTargetFile[], folderPath: string, lookup: QbittorrentLookup): Promise<string | undefined> {
	let error: string | undefined
	const fail = (reason: unknown) => {
		error ??= reason instanceof Error ? reason.message : String(reason)
	}
	const pending = files.filter((file) => !file.torrent)
	const findTorrent = (file: WatchTargetFile) => lookup.findByPath(path.join(folderPath, file.name))
	if (pending.some((file) => !findTorrent(file))) {
		await lookup.checkNewTorrents().catch(fail)
	}
	const indexed = pending.flatMap((file) => {
		const torrent = findTorrent(file)
		return torrent ? [{ file, torrent }] : []
	})
	if (indexed.length === 0) {
		return error
	}
	const live = await lookup.fetchLive([...new Set(indexed.map(({ torrent }) => torrent.hash))]).catch((reason: unknown) => {
		fail(reason)
		return undefined
	})
	for (const { file, torrent } of indexed) {
		// With live data, a hash qBittorrent didn't return is a removed torrent: no qBittorrent info for the file.
		file.qbittorrent = live
			? live.get(torrent.hash)
			: { hash: torrent.hash, name: torrent.name, live: false, sizeBytes: torrent.size, addedOn: torrent.addedOn, nyaaTorrentId: torrent.nyaaTorrentId }
	}
	return error
}

export async function listWatchTargetFiles(target: WatchTarget, decisions: DecisionRecord[], comboKey?: string): Promise<WatchTargetFile[]> {
	const findTorrent = buildLocalFileTorrentIndex(decisions)
	const names = (await listMatchingVideoFiles(target)).filter((name) => !comboKey || buildFingerprintComboKey(extractReleaseFingerprint(name)) === comboKey)
	const files = await Promise.all(names.map(async (name): Promise<WatchTargetFile> => {
		const fingerprint = extractReleaseFingerprint(name)
		const decision = findTorrent(name)
		const fileStat = await stat(path.join(target.folderPath, name)).catch(() => undefined)
		return {
			name,
			comboKey: buildFingerprintComboKey(fingerprint),
			episode: fingerprint.episode,
			sizeBytes: fileStat?.size,
			torrent: decision ? { torrentId: decision.torrentId, status: decision.status, item: decision.item } : undefined,
		}
	}))
	return files.sort((left, right) => episodeOrder(left) - episodeOrder(right) || left.name.localeCompare(right.name))
}
