const reWhitespace = /\s+/g
const reReleasePrefix = /^\[Erai-raws\]\s*/i
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

export function normalizeText(value: string): string {
	return value
		.trim()
		.replace(reVideoExtension, '')
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

export function normalizeBlacklistKey(value: string): string {
	const trimmed = value.trim().toLowerCase()
	if (!trimmed) {
		return ''
	}

	const separatorIndex = trimmed.lastIndexOf('::')
	if (separatorIndex < 0) {
		return deriveSeriesBase(trimmed)
	}

	const seriesPart = trimmed.slice(0, separatorIndex)
	const resolutionPart = trimmed.slice(separatorIndex + 2)
	const normalizedSeries = deriveSeriesBase(seriesPart)
	const normalizedResolution = resolutionPart.trim().toLowerCase() || 'unknown'
	if (!normalizedSeries) {
		return ''
	}
	return buildNormalizedKey(normalizedSeries, normalizedResolution)
}

export function sanitizePathSegment(value: string): string {
	return value.replace(/[\\/:*?"<>|]+/g, '-').replace(reWhitespace, ' ').trim()
}

function expandPostProcessedCandidateVariants(candidate: string): string[] {
	const hyphenAsSpace = candidate.replace(reInnerTitleHyphen, ' ').replace(reWhitespace, ' ').trim()
	return [candidate, hyphenAsSpace]
}

export function deriveFolderNameFromTitle(rawTitle: string): { fullMeta: string, onlyRes: string } {
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
	const rawItems = [title, ...internalNames].filter((item): item is string => Boolean(item && item.trim()))
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