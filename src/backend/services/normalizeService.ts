import type { FolderTitleVariations } from '@shared/api'
import { parsedReleaseGroups, parseReleaseTitle, releaseIdentityTitle } from '@shared/releaseTitle'
import type { ParsedRelease } from '@shared/releaseTitle'

const reWhitespace = /\s+/g
const reReleasePrefix = /^\[Erai-raws\]\s*/i
// Folder names of the groups releaseTitle knows: "[ToonsHub] Title [1080p] [...] (...)" -> "[ToonsHub] Title".
const reParsedGroupFolder = new RegExp(`^(\\[(?:${parsedReleaseGroups.join('|')})\\]\\s*[^[(]+?)\\s*(?:[[(].*)?$`, 'i')
// Optional label sitting between the hyphen and the episode number, e.g. "- Special 03",
// "- OVA 02". Without this the label + number leaks into the series key and every special
// is treated as a distinct series.
const episodeLabelSource = '(?:specials?|sp|ova|oad|ona|nced|ncop|preview|recap|pv)\\s+'
// Optional finale/batch markers trailing the episode number, e.g. "- 12 END", "- 13 FINAL".
// These must be absorbed too, otherwise the finale episode splits off as its own series.
const episodeTrailerSource = '(?:\\s+(?:end|final|batch|ova|sp))*'
const reEpisodeSuffix = new RegExp(`\\s*-\\s*(?:${episodeLabelSource})?\\d{1,4}(?:v\\d+)?${episodeTrailerSource}(?:\\s*\\([^)]*\\))?$`, 'i')
const reEpisodeBeforeMetadata = new RegExp(`\\s*-\\s*(?:${episodeLabelSource})?\\d{1,4}(?:v\\d+)?${episodeTrailerSource}(?:\\s*\\([^)]*\\))?(?=\\s*\\[)`, 'i')
const reTrailingHash = /\s*\[[A-F0-9]{8}\]$/i
const reTrailingMetadataBlocks = /(?:\s*\[[^\]]+\])+$/i
const reHyphenSpacing = /([a-z0-9])\s*-\s*([a-z0-9])/gi
const reVideoExtension = /\.(?:mkv|mp4|avi|mov|m4v|webm|ts|m2ts)$/i
const reResolution = /\b([0-9]{3,4}p)\b/i
const reSeasonToken = /\b(?:s\d{1,2}|season\s*\d{1,2})\b/gi
const reInnerTitleHyphen = /(?<=[a-z0-9])-(?=[a-z0-9])/g

const reFolderEpisodeBeforeMetadata = new RegExp(`\\s*-\\s*(?:${episodeLabelSource})?\\d{1,4}(?:v\\d+)?${episodeTrailerSource}(?:\\s*\\([^)]*\\))?(?=(?:\\s*(?:\\[[^\\]]*\\]|\\([^)]*\\)))*\\s*$)`, 'i')

function parseGroupRelease(value: string): ParsedRelease | undefined {
	const parsed = parseReleaseTitle(value)
	return parsed && parsed.group !== 'Erai-raws' ? parsed : undefined
}

// "[Group] Title", plus " S02" from season 2 on.
function groupSeriesName(parsed: ParsedRelease, which: 'english' | 'romaji'): string | undefined {
	const title = releaseIdentityTitle(parsed, which)
	return title ? `[${parsed.group}] ${title}` : undefined
}

// One series per release group: titles (English title, romaji when there is none) and folder names
// of the groups releaseTitle knows become "[Group] Title"; the rest is left to the Erai-shaped rules.
function canonicalizeGroupRelease(value: string): string {
	const parsed = parseGroupRelease(value)
	const name = parsed && (groupSeriesName(parsed, 'english') ?? groupSeriesName(parsed, 'romaji'))
	return name ?? value.replace(reParsedGroupFolder, '$1')
}

export function normalizeText(value: string): string {
	return canonicalizeGroupRelease(value
		.trim()
		.replace(reVideoExtension, ''))
		.replace(reReleasePrefix, '')
		.replace(reEpisodeSuffix, '')
		.replace(reEpisodeBeforeMetadata, '')
		.replace(reTrailingHash, '')
		.replace(reTrailingMetadataBlocks, '')
		.replace(reHyphenSpacing, '$1-$2')
		.replace(reWhitespace, ' ')
		.toLowerCase()
}

export function extractResolution(value: string): string {
	const match = reResolution.exec(value)
	return match?.[1]?.toLowerCase() ?? 'unknown'
}

export function stripResolution(value: string): string {
	return value.replace(reResolution, '').replace(reWhitespace, ' ').trim()
}

export function deriveSeriesBase(value: string): string {
	return stripResolution(normalizeText(value))
}

export function buildCanonicalSeriesKey(seriesName: string, aliases: Record<string, string>): string {
	const normalized = normalizeText(seriesName)
	return aliases[normalized] ?? normalized
}

export function buildNormalizedKey(seriesKey: string, resolution: string): string {
	return `${seriesKey}::${resolution.toLowerCase()}`
}

// Keys are built normalized when they are created. Re-deriving them on every load would rewrite them
// whenever the normalization rules change (and mangle the tags segment of variant keys).
export function normalizeBlacklistKey(value: string): string {
	return value.trim().toLowerCase()
}

export function sanitizePathSegment(value: string): string {
	return value.replace(/[\\/:*?"<>|]+/g, '-').replace(reWhitespace, ' ').trim()
}

function expandPostProcessedCandidateVariants(candidate: string): string[] {
	const hyphenAsSpace = candidate.replace(reInnerTitleHyphen, ' ').replace(reWhitespace, ' ').trim()
	return [candidate, hyphenAsSpace]
}

function groupFolderName(parsed: ParsedRelease, which: 'english' | 'romaji'): FolderTitleVariations | undefined {
	const name = groupSeriesName(parsed, which)
	if (!name) {
		return undefined
	}
	const resolution = parsed.resolution ?? 'unknown'
	const meta = [resolution, ...Object.values(parsed.tags).map((tag) => tag.toUpperCase())].join(' ')
	return { fullMeta: `${name} [${meta}]`, onlyRes: `${name} [${resolution}]` }
}

// Folder names from the romaji and from the English title, for the groups releaseTitle knows.
export function deriveFolderNamesByTitle(rawTitle: string): { romaji?: FolderTitleVariations; english?: FolderTitleVariations } {
	const parsed = parseGroupRelease(rawTitle)
	return parsed ? { romaji: groupFolderName(parsed, 'romaji'), english: groupFolderName(parsed, 'english') } : {}
}

export function deriveFolderNameFromTitle(rawTitle: string): FolderTitleVariations {
	const byTitle = deriveFolderNamesByTitle(rawTitle)
	const groupFolder = byTitle.english ?? byTitle.romaji
	if (groupFolder) {
		return groupFolder
	}
	const fullMeta = rawTitle
		.trim()
		.replace(reVideoExtension, '')
		.replace(reFolderEpisodeBeforeMetadata, '')
		.replace(reTrailingHash, '')
		.replace(reWhitespace, ' ')
		.trim()
	const metaStr = fullMeta.match(reTrailingMetadataBlocks)
	const resStr = metaStr ? extractResolution(metaStr[0]) : undefined
	const onlyRes = resStr
		? fullMeta
			.replace(reTrailingMetadataBlocks, '')
			.trim()
			.concat(' [', resStr, ']')
		: fullMeta
	return { fullMeta, onlyRes }
}

export function buildMatchCandidates(title: string, internalNames: string[]): string[] {
	// Both titles of a parsed release, so a folder named after either one matches.
	const parsed = parseGroupRelease(title)
	const titleNames = parsed ? [groupSeriesName(parsed, 'english'), groupSeriesName(parsed, 'romaji')] : []
	const rawItems = [title, ...titleNames, ...internalNames].filter((item): item is string => Boolean(item && item.trim()))
	const normalizedItems = rawItems
		.map((item) => normalizeText(item))
		.filter((item) => Boolean(item) && item !== 'unknown')

	const expanded = normalizedItems.flatMap((normalized) => {
		const seriesBase = deriveSeriesBase(normalized)
		const firstPart = normalized.split('-').map((part) => part.trim()).find(Boolean) ?? ''
		const seasonless = normalized.replace(reSeasonToken, '').replace(reWhitespace, ' ').trim()
		return [normalized, seriesBase, firstPart, seasonless].flatMap(expandPostProcessedCandidateVariants)
	})

	return Array.from(new Set(expanded.filter((candidate) => Boolean(candidate) && candidate !== 'unknown')))
}