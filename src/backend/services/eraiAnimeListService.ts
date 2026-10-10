import path from 'node:path'
import { load } from 'cheerio'
import { dataRoot, readJsonFile, writeJsonFileAtomic } from '../storage/jsonStore'
import { eraiSeriesSlug, fetchEraiHtml } from './eraiRawsService'
import { normalizeText, stripResolution } from './normalizeService'

// erai-raws' Anime List page lists every series on one page (the letters are anchors), ~2.5k entries / ~700 KB.
// Used to find a series page when a torrent's Nyaa "Information" link doesn't point to one: older releases
// link to the site's home page, and some recent ones have no link at all.
export const eraiAnimeListUrl = 'https://www.erai-raws.info/anime-list/'

export interface EraiAnimeListEntry {
	title: string
	slug: string
}

export function parseEraiAnimeListHtml(html: string): EraiAnimeListEntry[] {
	const $ = load(html)
	const entries = new Map<string, EraiAnimeListEntry>()
	for (const anchor of $('a.aa_ss_ops_new').toArray()) {
		const slug = /\/anime-list\/([a-z0-9][a-z0-9_-]*)\/*$/i.exec($(anchor).attr('href') ?? '')?.[1]?.toLowerCase()
		const title = ($(anchor).attr('title') ?? $(anchor).text()).trim()
		if (slug && title && !entries.has(slug)) {
			entries.set(slug, { title, slug })
		}
	}
	return [...entries.values()]
}

const ordinalSeason = /\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/g
const shortSeason = /\bs(\d{1,2})\b/g
const seasonNumber = /\bseason\s+(\d{1,2})\b/g

// Comparable form of a series title: lowercase, punctuation as spaces (folder names turn ":" into "-"),
// and "S4" / "4th Season" / "Season 4" all as "season 4".
export function eraiTitleKey(value: string): string {
	return value
		.toLowerCase()
		.replace(/[’']/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(ordinalSeason, 'season $1')
		.replace(shortSeason, 'season $1')
		.replace(seasonNumber, 'season $1')
		.replace(/\s+/g, ' ')
		.trim()
}

// "[Erai-raws] Island - 01 ~ 12 [720p][Multiple Subtitle]" -> "island"
export function seriesNameFromTorrentTitle(title: string): string {
	return stripResolution(normalizeText(title.replace(/\s+-\s+\d{1,4}\s*~\s*\d{1,4}.*$/, ''))).trim()
}

// The entry whose title matches the series name; failing that, the one whose title before ":" matches
// ("…4th Season: 2-nensei-hen 1 Gakki" for "… S4"). Only an unambiguous match counts.
export function findEraiSlugByTitle(entries: EraiAnimeListEntry[], seriesName: string): string | undefined {
	const key = eraiTitleKey(seriesName)
	if (!key) {
		return undefined
	}
	for (const titleOf of [(entry: EraiAnimeListEntry) => entry.title, (entry: EraiAnimeListEntry) => entry.title.split(':')[0] ?? '']) {
		const matches = entries.filter((entry) => eraiTitleKey(titleOf(entry)) === key)
		if (matches.length === 1) {
			return matches[0]!.slug
		}
		if (matches.length > 1) {
			return undefined
		}
	}
	return undefined
}

// --- Cached copy under data/, refreshed at most once a day (only when a slug has to be looked up). ---

const listPath = path.join(dataRoot, 'erai-anime-list.json')
const maxAgeMs = 24 * 60 * 60 * 1000

interface EraiAnimeListFile {
	fetchedAtUtc: string
	entries: EraiAnimeListEntry[]
}

let inFlight: Promise<EraiAnimeListEntry[]> | undefined

export function getEraiAnimeList(now = Date.now()): Promise<EraiAnimeListEntry[]> {
	inFlight ??= (async () => {
		const saved = await readJsonFile<EraiAnimeListFile | undefined>(listPath, undefined)
		if (saved && now - Date.parse(saved.fetchedAtUtc) < maxAgeMs) {
			return saved.entries
		}
		const entries = parseEraiAnimeListHtml(await fetchEraiHtml(eraiAnimeListUrl))
		await writeJsonFileAtomic<EraiAnimeListFile>(listPath, { fetchedAtUtc: new Date(now).toISOString(), entries })
		return entries
	})().finally(() => {
		inFlight = undefined
	})
	return inFlight
}

// The erai-raws series slug of a torrent: from its Nyaa "Information" link, else by title in the Anime List.
export async function resolveEraiSeriesSlug(detail: { information?: string; title: string }, list: () => Promise<EraiAnimeListEntry[]> = getEraiAnimeList): Promise<string | undefined> {
	const fromLink = eraiSeriesSlug(detail.information)
	if (fromLink) {
		return fromLink
	}
	// Only Erai-raws releases have a page there.
	if (!/^\[Erai-raws\]/i.test(detail.title)) {
		return undefined
	}
	return findEraiSlugByTitle(await list(), seriesNameFromTorrentTitle(detail.title))
}
