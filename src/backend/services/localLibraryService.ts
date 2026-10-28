import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { WatchTarget } from '@shared/types'
import { buildMatchCandidates, extractResolution, normalizeText } from './normalizeService'

const videoExtensions = new Set(['.mkv', '.mp4', '.avi', '.m4v', '.mov', '.wmv'])
// "Title - 03" or "Title S01E03" (the season is dropped, so both styles of the same episode match).
const reEpisode = /\s-\s(\d{1,4}(?:v\d+)?)\b|\bS\d{1,2}E(\d{1,4}(?:v\d+)?)\b/i
const reEpisodeTag = /\s-\s\d{1,4}(?:v\d+)?\s*(\([^)]+\))/i
const reFileHash = /\[([a-f0-9]{8})\](?=\.[^.]+$|$)/i
const reMultiSubTag = /\[\s*multisub\s*\]/i
const providerMatchers: Array<{ pattern: RegExp; value: string }> = [
	{ pattern: /\bhidive\b/i, value: 'hidive' },
	{ pattern: /\badn\b/i, value: 'adn' },
	{ pattern: /\bcr\b|\bcrunchyroll\b/i, value: 'cr' },
	{ pattern: /\bnf\b|\bnetflix\b/i, value: 'nf' },
	{ pattern: /\bamzn\b|\bamazon\b/i, value: 'amzn' },
	{ pattern: /\bdsnp\b|\bdisney\+?\b/i, value: 'dsnp' },
	{ pattern: /\babema\b/i, value: 'abema' },
	{ pattern: /\bbglobal\b/i, value: 'bglobal' },
	{ pattern: /\baniplus\b/i, value: 'aniplus' },
	{ pattern: /\bbahamut\b|\bbaha\b/i, value: 'bahamut' },
	{ pattern: /\bunext\b|\bu-next\b/i, value: 'unext' },
]

export interface ReleaseFingerprint {
	episode?: string
	source?: string
	episodeTag?: string
	fileHash?: string
	isMultisub: boolean
}

export interface TorrentVideoFile {
	name: string
	length?: number
	fingerprint: ReleaseFingerprint
}

export interface ExistingLocalMatch {
	status: 'exact' | 'conflict'
	reason: string
	localPath: string
	localName: string
	localSize: number
	episode?: string
	source?: string
	episodeTag?: string
	fileHash?: string
	torrentFileName?: string
	torrentFileSize?: number
}

function normalizeToken(value: string | undefined): string | undefined {
	const normalized = value?.trim().replace(/\s+/g, ' ').toLowerCase()
	return normalized || undefined
}

function extractSource(value: string): string | undefined {
	const bracketContents = Array.from(value.matchAll(/\[([^\]]+)\]/g), (match) => match[1] ?? '')
	for (const segment of bracketContents) {
		for (const provider of providerMatchers) {
			if (provider.pattern.test(segment)) {
				return provider.value
			}
		}
	}

	for (const provider of providerMatchers) {
		if (provider.pattern.test(value)) {
			return provider.value
		}
	}

	return undefined
}

export function extractReleaseFingerprint(value: string): ReleaseFingerprint {
	const episodeMatch = reEpisode.exec(value)
	const episode = episodeMatch?.[1] ?? episodeMatch?.[2]
	const source = normalizeToken(extractSource(value))
	const episodeTag = normalizeToken(reEpisodeTag.exec(value)?.[1])
	const fileHash = normalizeToken(reFileHash.exec(value)?.[1])
	const isMultisub = reMultiSubTag.test(value)
	return { episode, source, episodeTag, fileHash, isMultisub }
}

function hasSameOptionalToken(left: string | undefined, right: string | undefined): boolean {
	if (left && right) {
		return left === right
	}
	return Boolean(left) === Boolean(right)
}

function hasSameBooleanToken(left: boolean | undefined, right: boolean | undefined): boolean {
	if (typeof left === 'boolean' && typeof right === 'boolean') {
		return left === right
	}
	return Boolean(left) === Boolean(right)
}

function isVideoFile(fileName: string): boolean {
	return videoExtensions.has(path.extname(fileName).toLowerCase())
}

const maxSubfolderDepth = 2
const maxLocalVideoFiles = 200

// Video files under the target folder and up to two subfolder levels down (a batch lands in the
// torrent's root folder), shallowest first, stopping at 200 files.
async function listLocalVideoPaths(folderPath: string): Promise<string[]> {
	const videoPaths: string[] = []
	let folders = [folderPath]
	for (let depth = 0; depth <= maxSubfolderDepth && folders.length > 0; depth++) {
		const subfolders: string[] = []
		for (const folder of folders) {
			for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
				const entryPath = path.join(folder, entry.name)
				if (entry.isDirectory()) {
					subfolders.push(entryPath)
				} else if (entry.isFile() && isVideoFile(entry.name)) {
					videoPaths.push(entryPath)
					if (videoPaths.length >= maxLocalVideoFiles) {
						return videoPaths
					}
				}
			}
		}
		folders = subfolders
	}
	return videoPaths
}

// Video files in the target folder that belong to the target's series and resolution.
export async function listMatchingVideoFiles(target: WatchTarget): Promise<string[]> {
	const folderEntries = await readdir(target.folderPath, { withFileTypes: true }).catch(() => [])
	const targetCandidates = new Set(target.matchCandidates.map((candidate) => normalizeText(candidate)))
	return folderEntries
		.filter((entry) => entry.isFile() && isVideoFile(entry.name))
		.map((entry) => entry.name)
		.filter((name) => {
			const resolution = extractResolution(name)
			if (resolution !== 'unknown' && target.resolution !== resolution) {
				return false
			}
			return buildMatchCandidates(name, [name]).some((candidate) => targetCandidates.has(candidate))
		})
}

export async function countMatchingLocalFiles(target: WatchTarget): Promise<number> {
	return (await listMatchingVideoFiles(target)).length
}

// Groups files released the same way (source / episode tag / multisub), e.g. "adn|none|true".
export function buildFingerprintComboKey(fingerprint: ReleaseFingerprint): string {
	return `${fingerprint.source ?? 'none'}|${fingerprint.episodeTag ?? 'none'}|${fingerprint.isMultisub}`
}

export interface FingerprintComboBreakdown {
	key: string
	source?: string
	episodeTag?: string
	isMultisub: boolean
	count: number
	minEpisode?: string
	maxEpisode?: string
	missingEpisodes?: string[]
}

function extractEpisodeNumber(value: string): number | undefined {
	const match = /^(\d{1,4})/.exec(value)
	if (!match) {
		return undefined
	}
	const parsed = Number.parseInt(match[1]!, 10)
	return Number.isNaN(parsed) ? undefined : parsed
}

export async function analyzeFingerprintCombos(target: WatchTarget): Promise<FingerprintComboBreakdown[]> {
	const comboMap = new Map<string, { episodes: Set<string>; fingerprint: ReleaseFingerprint }>()

	for (const name of await listMatchingVideoFiles(target)) {
		const fingerprint = extractReleaseFingerprint(name)
		const comboKey = buildFingerprintComboKey(fingerprint)
		const episodes = comboMap.get(comboKey)?.episodes ?? new Set<string>()

		if (fingerprint.episode) {
			episodes.add(fingerprint.episode)
		}

		comboMap.set(comboKey, { episodes, fingerprint })
	}

	return Array.from(comboMap, ([key, item]) => {
		const numericEpisodes = Array.from(new Set(
			Array.from(item.episodes)
				.map((episode) => extractEpisodeNumber(episode))
				.filter((episode): episode is number => typeof episode === 'number'),
		)).sort((left, right) => left - right)

		const minEpisode = numericEpisodes.length > 0 ? numericEpisodes[0]?.toString() : undefined
		const maxEpisode = numericEpisodes.length > 0 ? numericEpisodes[numericEpisodes.length - 1]?.toString() : undefined
		const missingEpisodes = numericEpisodes.length > 0
			? Array.from({ length: (numericEpisodes[numericEpisodes.length - 1]! - numericEpisodes[0]!) + 1 }, (_, index) => numericEpisodes[0]! + index)
				.filter((episodeNumber) => !numericEpisodes.includes(episodeNumber))
				.map((episodeNumber) => episodeNumber.toString())
			: []

		return {
			key,
			source: item.fingerprint.source,
			episodeTag: item.fingerprint.episodeTag,
			isMultisub: item.fingerprint.isMultisub,
			count: item.episodes.size,
			minEpisode,
			maxEpisode,
			missingEpisodes: missingEpisodes.length > 0 ? missingEpisodes : undefined,
		}
	})
}

export function buildTorrentVideoFiles(videoNames: string[], files: Array<{ path: string[]; length?: number }>): TorrentVideoFile[] {
	const lengthsByName = new Map<string, number | undefined>()
	for (const file of files) {
		const baseName = path.basename(file.path.join(path.sep))
		if (baseName) {
			lengthsByName.set(baseName, file.length)
		}
	}

	return videoNames
		.filter((name) => isVideoFile(name))
		.map((name) => ({
			name,
			length: lengthsByName.get(name),
			fingerprint: extractReleaseFingerprint(name),
		}))
}

export async function findExistingLocalMatch(target: WatchTarget, title: string, torrentVideoFiles: TorrentVideoFile[]): Promise<ExistingLocalMatch | undefined> {
	const titleFingerprint = extractReleaseFingerprint(title)
	const candidateFingerprints = torrentVideoFiles
		.map((file) => file.fingerprint)
		.filter((fingerprint) => fingerprint.episode || fingerprint.source)
		.concat(titleFingerprint.episode || titleFingerprint.source ? [titleFingerprint] : [])
	let conflictMatch: ExistingLocalMatch | undefined

	for (const localPath of await listLocalVideoPaths(target.folderPath)) {
		const localName = path.basename(localPath)
		const localStat = await stat(localPath).catch(() => undefined)
		if (!localStat?.isFile()) {
			continue
		}

		const localFingerprint = extractReleaseFingerprint(localName)
		const sameEpisodeAndSource = candidateFingerprints.find((fingerprint) => {
			if (!fingerprint.episode || !localFingerprint.episode || fingerprint.episode !== localFingerprint.episode) {
				return false
			}
			if (fingerprint.source && localFingerprint.source) {
				if (fingerprint.source !== localFingerprint.source) {
					return false
				}
			} else if (Boolean(fingerprint.source) !== Boolean(localFingerprint.source)) {
				return false
			}
			if (!hasSameOptionalToken(fingerprint.episodeTag, localFingerprint.episodeTag)) {
				return false
			}
			if (!hasSameOptionalToken(fingerprint.fileHash, localFingerprint.fileHash)) {
				return false
			}
			if (!hasSameBooleanToken(fingerprint.isMultisub, localFingerprint.isMultisub)) {
				return false
			}
			return true
		})

		if (!sameEpisodeAndSource) {
			continue
		}

		const exactFile = torrentVideoFiles.find((file) => file.name === localName)
		if (exactFile && exactFile.length === localStat.size) {
			return {
				status: 'exact',
				reason: `existing file matches ${localName}`,
				localPath,
				localName,
				localSize: localStat.size,
				episode: localFingerprint.episode,
				source: localFingerprint.source,
				episodeTag: localFingerprint.episodeTag,
				fileHash: localFingerprint.fileHash,
				torrentFileName: exactFile.name,
				torrentFileSize: exactFile.length,
			}
		}

		const expectedFile = torrentVideoFiles.find((file) => file.fingerprint.episode === localFingerprint.episode && file.fingerprint.source === localFingerprint.source)
		conflictMatch ??= {
			status: 'conflict',
			reason: `existing file conflict for episode ${localFingerprint.episode ?? 'unknown'}${localFingerprint.source ? ` / ${localFingerprint.source}` : ''}`,
			localPath,
			localName,
			localSize: localStat.size,
			episode: localFingerprint.episode,
			source: localFingerprint.source,
			episodeTag: localFingerprint.episodeTag,
			fileHash: localFingerprint.fileHash,
			torrentFileName: expectedFile?.name,
			torrentFileSize: expectedFile?.length,
		}
	}

	return conflictMatch
}

// The torrent's own video files, by name. All of them present means the torrent is already downloaded.
export async function findExistingLocalMatchByNames(target: WatchTarget, names: string[]): Promise<ExistingLocalMatch | undefined> {
	const videoNames = names.filter((name) => isVideoFile(name))
	if (videoNames.length === 0) {
		return undefined
	}

	const localPathsByName = new Map((await listLocalVideoPaths(target.folderPath)).map((localPath) => [path.basename(localPath), localPath]))
	const localPaths = videoNames.map((name) => localPathsByName.get(name))
	const fileStats = await Promise.all(localPaths.map((localPath) => localPath ? stat(localPath).catch(() => undefined) : undefined))
	if (!fileStats.every((fileStat) => fileStat?.isFile())) {
		return undefined
	}

	const localName = videoNames[0]!
	return {
		status: 'exact',
		reason: `existing local files found for ${videoNames.length === 1 ? localName : `${videoNames.length} torrent files`}`,
		localPath: localPaths[0]!,
		localName,
		localSize: fileStats[0]!.size,
	}
}

export async function findExistingLocalMatchByTitle(target: WatchTarget, title: string): Promise<ExistingLocalMatch | undefined> {
	const titleFingerprint = extractReleaseFingerprint(title)
	if (!titleFingerprint.episode) {
		return undefined
	}

	for (const localPath of await listLocalVideoPaths(target.folderPath)) {
		const localName = path.basename(localPath)
		const localStat = await stat(localPath).catch(() => undefined)
		if (!localStat?.isFile()) {
			continue
		}

		const localFingerprint = extractReleaseFingerprint(localName)
		if (!localFingerprint.episode || localFingerprint.episode !== titleFingerprint.episode) {
			continue
		}
		if (titleFingerprint.source && localFingerprint.source && titleFingerprint.source !== localFingerprint.source) {
			continue
		}
		if (Boolean(titleFingerprint.source) !== Boolean(localFingerprint.source)) {
			continue
		}
		if (!hasSameOptionalToken(titleFingerprint.episodeTag, localFingerprint.episodeTag)) {
			continue
		}
		if (!hasSameOptionalToken(titleFingerprint.fileHash, localFingerprint.fileHash)) {
			continue
		}
		if (!hasSameBooleanToken(titleFingerprint.isMultisub, localFingerprint.isMultisub)) {
			continue
		}

		return {
			status: 'exact',
			reason: `existing local episode/source found for ${localName}`,
			localPath,
			localName,
			localSize: localStat.size,
			episode: localFingerprint.episode,
			source: localFingerprint.source,
			episodeTag: localFingerprint.episodeTag,
			fileHash: localFingerprint.fileHash,
		}
	}

	return undefined
}