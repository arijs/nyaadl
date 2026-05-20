import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { WatchTarget } from '@shared/types'
import { buildMatchCandidates, extractResolution, normalizeText } from './normalizeService'

const videoExtensions = new Set(['.mkv', '.mp4', '.avi', '.m4v', '.mov', '.wmv'])
const reEpisode = /\s-\s(\d{1,4}(?:v\d+)?)\b/i
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
	const episode = reEpisode.exec(value)?.[1]
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

export async function countMatchingLocalFiles(target: WatchTarget): Promise<number> {
	const folderEntries = await readdir(target.folderPath, { withFileTypes: true }).catch(() => [])
	if (folderEntries.length === 0) {
		return 0
	}

	const targetCandidates = new Set(target.matchCandidates.map((candidate) => normalizeText(candidate)))
	let matchingCount = 0

	for (const entry of folderEntries) {
		if (!entry.isFile() || !isVideoFile(entry.name)) {
			continue
		}

		const resolution = extractResolution(entry.name)
		if (resolution !== 'unknown' && target.resolution !== resolution) {
			continue
		}

		const fileCandidates = buildMatchCandidates(entry.name, [entry.name])
		if (fileCandidates.some((candidate) => targetCandidates.has(candidate))) {
			matchingCount += 1
		}
	}

	return matchingCount
}

export interface FingerprintComboBreakdown {
	source?: string
	episodeTag?: string
	isMultisub: boolean
	count: number
	minEpisode?: string
	maxEpisode?: string
}

export async function analyzeFingerprintCombos(target: WatchTarget): Promise<FingerprintComboBreakdown[]> {
	const folderEntries = await readdir(target.folderPath, { withFileTypes: true }).catch(() => [])
	if (folderEntries.length === 0) {
		return []
	}

	const targetCandidates = new Set(target.matchCandidates.map((candidate) => normalizeText(candidate)))
	const comboMap = new Map<string, { episodes: Set<string>; fingerprint: ReleaseFingerprint }>()

	for (const entry of folderEntries) {
		if (!entry.isFile() || !isVideoFile(entry.name)) {
			continue
		}

		const resolution = extractResolution(entry.name)
		if (resolution !== 'unknown' && target.resolution !== resolution) {
			continue
		}

		const fileCandidates = buildMatchCandidates(entry.name, [entry.name])
		if (!fileCandidates.some((candidate) => targetCandidates.has(candidate))) {
			continue
		}

		const fingerprint = extractReleaseFingerprint(entry.name)
		const comboKey = `${fingerprint.source ?? 'none'}|${fingerprint.episodeTag ?? 'none'}|${fingerprint.isMultisub}`
		const episodes = comboMap.get(comboKey)?.episodes ?? new Set<string>()

		if (fingerprint.episode) {
			episodes.add(fingerprint.episode)
		}

		comboMap.set(comboKey, { episodes, fingerprint })
	}

	return Array.from(comboMap.values()).map((item) => {
		const sorted = Array.from(item.episodes)
			.map((ep) => parseInt(ep, 10))
			.filter((n) => !isNaN(n))
			.sort((a, b) => a - b)

		return {
			source: item.fingerprint.source,
			episodeTag: item.fingerprint.episodeTag,
			isMultisub: item.fingerprint.isMultisub,
			count: item.episodes.size,
			minEpisode: sorted.length > 0 ? sorted[0]?.toString() : undefined,
			maxEpisode: sorted.length > 0 ? sorted[sorted.length - 1]?.toString() : undefined,
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

	const folderEntries = await readdir(target.folderPath, { withFileTypes: true }).catch(() => [])
	for (const entry of folderEntries) {
		if (!entry.isFile() || !isVideoFile(entry.name)) {
			continue
		}

		const localPath = path.join(target.folderPath, entry.name)
		const localStat = await stat(localPath).catch(() => undefined)
		if (!localStat?.isFile()) {
			continue
		}

		const localFingerprint = extractReleaseFingerprint(entry.name)
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

		const exactFile = torrentVideoFiles.find((file) => file.name === entry.name)
		if (exactFile && exactFile.length === localStat.size) {
			return {
				status: 'exact',
				reason: `existing file matches ${entry.name}`,
				localPath,
				localName: entry.name,
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
			localName: entry.name,
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

export async function findExistingLocalMatchByTitle(target: WatchTarget, title: string): Promise<ExistingLocalMatch | undefined> {
	const titleFingerprint = extractReleaseFingerprint(title)
	if (!titleFingerprint.episode) {
		return undefined
	}

	const folderEntries = await readdir(target.folderPath, { withFileTypes: true }).catch(() => [])
	for (const entry of folderEntries) {
		if (!entry.isFile() || !isVideoFile(entry.name)) {
			continue
		}

		const localPath = path.join(target.folderPath, entry.name)
		const localStat = await stat(localPath).catch(() => undefined)
		if (!localStat?.isFile()) {
			continue
		}

		const localFingerprint = extractReleaseFingerprint(entry.name)
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
			reason: `existing local episode/source found for ${entry.name}`,
			localPath,
			localName: entry.name,
			localSize: localStat.size,
			episode: localFingerprint.episode,
			source: localFingerprint.source,
			episodeTag: localFingerprint.episodeTag,
			fileHash: localFingerprint.fileHash,
		}
	}

	return undefined
}