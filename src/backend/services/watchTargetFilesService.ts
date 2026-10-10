import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { WatchTargetFile } from '@shared/api'
import type { DecisionRecord, WatchTarget } from '@shared/types'
import { getDecisionInternalNames } from './decisionWorkflowService'
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
