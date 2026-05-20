const reWhitespace = /\s+/g
const reReleasePrefix = /^\[Erai-raws\]\s*/i
const reEpisodeSuffix = /\s*-\s*\d{1,4}(?:v\d+)?(?:\s*\([^)]*\))?$/i
const reEpisodeBeforeMetadata = /\s*-\s*\d{1,4}(?:v\d+)?(?:\s*\([^)]*\))?(?=\s*\[)/i
const reTrailingHash = /\s*\[[A-F0-9]{8}\]$/i
const reTrailingMetadataBlocks = /(?:\s*\[[^\]]+\])+$/i
const reHyphenSpacing = /([a-z0-9])\s*-\s*([a-z0-9])/gi
const reVideoExtension = /\.(?:mkv|mp4|avi|mov|m4v|webm|ts|m2ts)$/i
const reResolution = /\b([0-9]{3,4}p)\b/i
const reSeasonToken = /\b(?:s\d{1,2}|season\s*\d{1,2})\b/gi
const reInnerTitleHyphen = /(?<=[a-z0-9])-(?=[a-z0-9])/g

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