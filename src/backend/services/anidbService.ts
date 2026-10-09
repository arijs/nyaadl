import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { load, type CheerioAPI } from 'cheerio'
import type { AnidbClientStatus, AnidbDetails } from '@shared/types'
import { dataRoot, readJsonFile, writeJsonFileAtomic } from '../storage/jsonStore'
import { readSeriesJson, readSeriesText, saveSeriesImage, writeSeriesJson, writeSeriesText } from '../storage/seriesStore'
import { getEraiSeries } from './eraiRawsService'

// AniDB HTTP API: https://wiki.anidb.net/HTTP_API_Definition (the website itself is behind a Cloudflare challenge).
// Needs a client registered by the user on anidb.net; strict limits (1 request / 2s, bans on abuse).
interface AnidbClient {
	client: string
	clientver: string
}

const clientPath = path.join(dataRoot, 'anidb-client.json')
const minIntervalMs = 2000
// AniDB bans clients that request the same anime more than once a day.
const sameAnimeIntervalMs = 24 * 60 * 60 * 1000
let nextRequestAt = 0

// AniDB "resource" type ids -> site links (the "Resources" row of the anime page). Unknown ids are skipped,
// except resources that carry a full <url>.
const resourceLinks: Record<string, { label: string; url: (ids: string[], fullUrl: string) => string }> = {
	1: { label: 'ANN', url: ([id]) => `https://www.animenewsnetwork.com/encyclopedia/anime.php?id=${id}` },
	2: { label: 'MAL', url: ([id]) => `https://myanimelist.net/anime/${id}` },
	4: { label: 'Official website', url: (_, fullUrl) => fullUrl },
	5: { label: 'Official website (en)', url: (_, fullUrl) => fullUrl },
	6: { label: 'Wikipedia (en)', url: ([id]) => `https://en.wikipedia.org/wiki/${id}` },
	7: { label: 'Wikipedia (ja)', url: ([id]) => `https://ja.wikipedia.org/wiki/${id}` },
	8: { label: 'Syoboi', url: ([id]) => `https://cal.syoboi.jp/tid/${id}/time` },
	9: { label: 'Allcinema', url: ([id]) => `https://www.allcinema.net/cinema/${id}` },
	10: { label: 'Anison', url: ([id]) => `http://anison.info/data/program/${id}.html` },
	23: { label: 'Twitter', url: ([id]) => `https://twitter.com/${id}` },
	28: { label: 'Crunchyroll', url: ([id]) => `https://www.crunchyroll.com/series/${id}/` },
	44: { label: 'TMDB', url: ([id, kind]) => `https://www.themoviedb.org/${kind ?? 'tv'}/${id}` },
}

export function anidbAnimeId(url: string | undefined): string | null {
	return /^https?:\/\/(?:www\.)?anidb\.net\/(?:anime\/|perl-bin\/animedb\.pl\?show=anime&aid=)(\d+)/.exec(url?.trim() ?? '')?.[1] ?? null
}

// AniDB descriptions link characters/creators as "http://anidb.net/ch123 [Name]": keep just the name.
const stripAnidbLinks = (text: string) => text.replace(/https?:\/\/anidb\.net\/\w+ \[([^\]]+)\]/g, '$1')

// AniDB seasons follow the start month: Jan-Mar Winter, Apr-Jun Spring, Jul-Sep Summer, Oct-Dec Fall.
export function anidbSeason(startDate: string | undefined): string | undefined {
	const match = /^(\d{4})-(\d{2})/.exec(startDate ?? '')
	if (!match) {
		return undefined
	}
	return `${['Winter', 'Spring', 'Summer', 'Fall'][Math.floor((Number(match[2]) - 1) / 3)]} ${match[1]}`
}

function parseResources($: CheerioAPI): NonNullable<AnidbDetails['resources']> {
	return $('anime > resources > resource').toArray().flatMap((resource) => {
		const $resource = $(resource)
		const known = resourceLinks[$resource.attr('type') ?? '']
		const fullUrl = $resource.find('url').first().text().trim()
		const ids = $resource.find('identifier').toArray().map((id) => $(id).text().trim())
		if (known && (ids[0] || fullUrl)) {
			return [{ label: known.label, url: known.url(ids, fullUrl) }]
		}
		return fullUrl ? [{ label: new URL(fullUrl).hostname.replace(/^www\./, ''), url: fullUrl }] : []
	})
}

export function parseAnidbXml(fallbackAid: string, xml: string, fetchedAtUtc = new Date().toISOString()): AnidbDetails {
	const $ = load(xml, { xml: true })
	const error = $('error').first().text().trim()
	if (error || $('anime').length === 0) {
		throw new Error(`AniDB: ${error || 'unexpected response'}`)
	}
	const aid = $('anime').attr('id') ?? fallbackAid
	const text = (selector: string) => $('anime').children(selector).first().text().trim() || undefined
	const picture = text('picture')
	const startDate = text('startdate')
	const isSpoiler = (tag: Parameters<typeof $>[0]) => $(tag).attr('localspoiler') === 'true' || $(tag).attr('globalspoiler') === 'true'
	return {
		aid,
		url: `https://anidb.net/anime/${aid}`,
		fetchedAtUtc,
		titles: $('anime > titles > title').toArray().map((title) => ({
			type: $(title).attr('type') ?? '',
			lang: $(title).attr('xml:lang') ?? '',
			title: $(title).text().trim(),
		})),
		type: text('type'),
		episodeCount: Number(text('episodecount')) || undefined,
		startDate,
		endDate: text('enddate'),
		season: anidbSeason(startDate),
		officialUrl: text('url'),
		ratings: $('anime > ratings').children().toArray().map((rating) => ({
			kind: rating.tagName,
			value: $(rating).text().trim(),
			count: Number($(rating).attr('count')) || undefined,
		})),
		// The website's "Tags" row shows the infobox tags (often weight 0); add the other weighted ones, never spoilers.
		tags: $('anime > tags > tag').toArray()
			.filter((tag) => !isSpoiler(tag) && ($(tag).attr('infobox') === 'true' || Number($(tag).attr('weight')) > 0))
			.map((tag) => ({
				name: $(tag).children('name').text().trim(),
				weight: Number($(tag).attr('weight')) || 0,
				description: $(tag).children('description').text().trim() || undefined,
				infobox: $(tag).attr('infobox') === 'true',
			}))
			.sort((a, b) => Number(b.infobox) - Number(a.infobox) || b.weight - a.weight)
			.map(({ infobox: _infobox, ...tag }) => tag),
		description: text('description') ? stripAnidbLinks(text('description') ?? '') : undefined,
		imageUrl: picture ? `https://cdn-eu.anidb.net/images/main/${picture}` : undefined,
		resources: parseResources($),
		creators: $('anime > creators > name').toArray().map((name) => ({ role: $(name).attr('type') ?? '', name: $(name).text().trim() })),
		characters: $('anime > characters > character').toArray()
			.filter((character) => /main|secondary/.test($(character).attr('type') ?? ''))
			.map((character) => ({
				name: $(character).children('name').text().trim(),
				role: ($(character).attr('type') ?? '').replace(/ in$/, ''),
				seiyuu: $(character).children('seiyuu').first().text().trim() || undefined,
			})),
		// Regular episodes (epno type 1) and specials (type 2); credits/trailers are noise here.
		episodes: $('anime > episodes > episode').toArray()
			.filter((episode) => ['1', '2'].includes($(episode).children('epno').attr('type') ?? ''))
			.map((episode) => {
				const $episode = $(episode)
				return {
					number: $episode.children('epno').text().trim(),
					title: $episode.children('title[xml\\:lang="en"]').first().text().trim() || $episode.children('title').first().text().trim() || undefined,
					airDate: $episode.children('airdate').text().trim() || undefined,
					lengthMinutes: Number($episode.children('length').text()) || undefined,
					rating: $episode.children('rating').text().trim() || undefined,
					summary: $episode.children('summary').text().trim() ? stripAnidbLinks($episode.children('summary').text().trim()) : undefined,
				}
			})
			.sort((a, b) => Number(/^\d/.test(b.number)) - Number(/^\d/.test(a.number)) || a.number.localeCompare(b.number, undefined, { numeric: true })),
		recommendations: $('anime > recommendations > recommendation').toArray().map((recommendation) => ({
			type: $(recommendation).attr('type') ?? '',
			text: $(recommendation).text().trim(),
		})),
		related: $('anime > relatedanime > anime').toArray().map((anime) => ({
			aid: $(anime).attr('id') ?? '',
			relation: $(anime).attr('type') ?? '',
			title: $(anime).text().trim(),
		})),
	}
}

async function loadClient(): Promise<AnidbClient | undefined> {
	const stored = await readJsonFile<Partial<AnidbClient>>(clientPath, {})
	return stored.client && stored.clientver ? { client: stored.client, clientver: stored.clientver } : undefined
}

export async function getAnidbClientStatus(): Promise<AnidbClientStatus> {
	const client = await loadClient()
	return { configured: Boolean(client), client: client?.client, clientver: client?.clientver }
}

export async function saveAnidbClient(input: { client?: string; clientver?: string }): Promise<AnidbClientStatus> {
	const client = input.client?.trim().toLowerCase() ?? ''
	const clientver = input.clientver?.trim() ?? ''
	if (!/^[a-z0-9]+$/.test(client) || !/^\d+$/.test(clientver)) {
		throw new Error('AniDB client must be letters/digits and clientver a number')
	}
	await writeJsonFileAtomic(clientPath, { client, clientver })
	return getAnidbClientStatus()
}

async function fetchAnidbXml(aid: string, client: AnidbClient): Promise<string> {
	// ponytail: global 2s gate (AniDB limit: 1 req/2s), in-process only.
	const waitMs = nextRequestAt - Date.now()
	nextRequestAt = Math.max(Date.now(), nextRequestAt) + minIntervalMs
	if (waitMs > 0) {
		await new Promise((resolve) => setTimeout(resolve, waitMs))
	}
	const params = new URLSearchParams({ request: 'anime', client: client.client, clientver: client.clientver, protover: '1', aid })
	const response = await fetch(`http://api.anidb.net:9001/httpapi?${params}`)
	if (!response.ok) {
		throw new Error(`AniDB API: ${response.status} ${response.statusText}`)
	}
	// Responses are always gzip; fetch only inflates them when the server sends Content-Encoding.
	const body = Buffer.from(await response.arrayBuffer())
	return (body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body) : body).toString('utf8')
}

export type AnidbCacheAction = 'reparse' | 'saved' | 'blocked' | 'fetch'

// What to do with the saved anidb.json/anidb.xml: the API is only hit when nothing usable is saved
// or on a Refresh more than 24h after the last request.
export function anidbCacheAction(saved: { fetchedAtUtc: string } | undefined, hasXml: boolean, refresh: boolean, now = Date.now()): AnidbCacheAction {
	const fetchedRecently = saved !== undefined && now - Date.parse(saved.fetchedAtUtc) < sameAnimeIntervalMs
	if (saved && hasXml && (!refresh || fetchedRecently)) {
		return 'reparse'
	}
	if (saved && !refresh) {
		return 'saved'
	}
	return fetchedRecently ? 'blocked' : 'fetch'
}

// Fetched only when the user opens the AniDB tab; the AniDB link comes from the erai-raws page.
// The raw XML is kept as anidb.xml: re-parsing it (parser changes, Refresh within 24h) costs no API request.
export async function getAnidbDetails(slug: string, refresh = false): Promise<AnidbDetails | null> {
	const saved = await readSeriesJson<AnidbDetails>(slug, 'anidb')
	const savedXml = await readSeriesText(slug, 'anidb.xml')
	const action = anidbCacheAction(saved, savedXml !== undefined, refresh)
	if (action === 'reparse' && saved && savedXml) {
		const details = parseAnidbXml(saved.aid, savedXml, saved.fetchedAtUtc)
		await writeSeriesJson(slug, 'anidb', details)
		return details
	}
	if (action === 'saved' && saved) {
		return saved
	}
	if (action === 'blocked' && saved) {
		throw new Error(`AniDB was already asked about this anime in the last 24h (it bans repeats): refresh after ${new Date(Date.parse(saved.fetchedAtUtc) + sameAnimeIntervalMs).toLocaleString()}`)
	}
	const { series } = await getEraiSeries(slug)
	const aid = series.links.map((link) => anidbAnimeId(link.url)).find(Boolean)
	if (!aid) {
		return null
	}
	const client = await loadClient()
	if (!client) {
		throw new Error('AniDB client not configured: register one on anidb.net and save it in Execution state')
	}
	const xml = await fetchAnidbXml(aid, client)
	const details = parseAnidbXml(aid, xml)
	await writeSeriesText(slug, 'anidb.xml', xml)
	await writeSeriesJson(slug, 'anidb', details)
	await saveSeriesImage(slug, 'anidb', details.imageUrl)
	return details
}
