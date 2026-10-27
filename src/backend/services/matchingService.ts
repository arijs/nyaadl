import { parseReleaseTitle } from '@shared/releaseTitle'
import type { ReleaseTagKey, ReleaseTags } from '@shared/releaseTitle'
import type { TorrentItem, WatchTarget } from '@shared/types'
import { parseBlacklistEntry } from './blacklistService'
import { buildCanonicalSeriesKey, buildMatchCandidates, buildNormalizedKey, deriveSeriesBase, extractResolution, normalizeText } from './normalizeService'

export interface TorrentSourceSnapshot {
	title: string
	videoNames: string[]
}

export interface TorrentMatchResult {
	seriesBaseRaw: string
	seriesKey: string
	resolution: string
	normalizedKey: string
	matchCandidates: string[]
	tags: ReleaseTags
	matchedTarget?: WatchTarget
}

export function buildTorrentMatchResult(snapshot: TorrentSourceSnapshot, aliases: Record<string, string>): TorrentMatchResult {
	const seriesBaseRaw = deriveSeriesBase(snapshot.title)
	const seriesKey = buildCanonicalSeriesKey(seriesBaseRaw, aliases)
	const resolution = extractResolution(snapshot.title)
	const normalizedKey = buildNormalizedKey(seriesKey, resolution)
	const matchCandidates = buildMatchCandidates(snapshot.title, snapshot.videoNames)

	return {
		seriesBaseRaw,
		seriesKey,
		resolution,
		normalizedKey,
		matchCandidates,
		tags: parseReleaseTitle(snapshot.title)?.tags ?? {},
	}
}

export function matchTorrentToWatchTargets(item: TorrentMatchResult, watchTargets: WatchTarget[]): WatchTarget | undefined {
	const exact = watchTargets.find((target) => target.normalizedKey === item.normalizedKey)
	if (exact) {
		return exact
	}

	const fallbackMatches = watchTargets.filter((target) => {
		if (item.resolution !== 'unknown' && target.resolution !== item.resolution) {
			return false
		}
		return target.matchCandidates.some((candidate) => item.matchCandidates.includes(normalizeText(candidate)))
	})

	if (fallbackMatches.length === 1) {
		return fallbackMatches[0]
	}

	return undefined
}

// Blocked when the series (key or any match candidate) and the resolution match an entry, and the
// title carries every tag of that entry (an entry without tags blocks the whole series+resolution).
export function isTorrentBlacklisted(item: TorrentMatchResult, blacklist: string[]): boolean {
	const seriesKeys = new Set([item.normalizedKey, ...item.matchCandidates.map((candidate) => buildNormalizedKey(candidate, item.resolution))])
	return blacklist.some((key) => {
		const entry = parseBlacklistEntry(key)
		return seriesKeys.has(buildNormalizedKey(entry.seriesKey, entry.resolution))
			&& Object.entries(entry.tags ?? {}).every(([tag, value]) => item.tags[tag as ReleaseTagKey] === value)
	})
}

export function toTorrentItem(base: {
	torrentId: string
	title: string
	viewUrl: string
	downloadUrl: string
	page: number
	seriesBaseRaw: string
	resolution: string
	matchCandidates: string[]
}, extra?: Partial<TorrentItem>): TorrentItem {
	return {
		...base,
		publishedAtUtc: extra?.publishedAtUtc,
		sizeText: extra?.sizeText,
		seeders: extra?.seeders,
		leechers: extra?.leechers,
		downloads: extra?.downloads,
	}
}