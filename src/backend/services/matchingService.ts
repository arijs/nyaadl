import type { TorrentItem, WatchTarget } from '@shared/types'
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