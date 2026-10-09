import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { load } from 'cheerio'
import type { AnidbClientStatus, AnidbDetails } from '@shared/types'
import { dataRoot, readJsonFile, writeJsonFileAtomic } from '../storage/jsonStore'
import { readSeriesJson, saveSeriesImage, writeSeriesJson } from '../storage/seriesStore'
import { getEraiSeries } from './eraiRawsService'

// AniDB HTTP API: https://wiki.anidb.net/HTTP_API_Definition (the website itself answers 403 to scripts).
// Needs a client registered by the user on anidb.net; strict limits (1 request / 2s, bans on abuse).
interface AnidbClient {
	client: string
	clientver: string
}

const clientPath = path.join(dataRoot, 'anidb-client.json')
const minIntervalMs = 2000
let nextRequestAt = 0

export function anidbAnimeId(url: string | undefined): string | null {
	return /^https?:\/\/(?:www\.)?anidb\.net\/(?:anime\/|perl-bin\/animedb\.pl\?show=anime&aid=)(\d+)/.exec(url?.trim() ?? '')?.[1] ?? null
}

// AniDB descriptions link characters/creators as "http://anidb.net/ch123 [Name]": keep just the name.
const stripAnidbLinks = (text: string) => text.replace(/https?:\/\/anidb\.net\/\w+ \[([^\]]+)\]/g, '$1')

export function parseAnidbXml(aid: string, xml: string, fetchedAtUtc = new Date().toISOString()): AnidbDetails {
	const $ = load(xml, { xml: true })
	const error = $('error').first().text().trim()
	if (error || $('anime').length === 0) {
		throw new Error(`AniDB: ${error || 'unexpected response'}`)
	}
	const text = (selector: string) => $('anime').children(selector).first().text().trim() || undefined
	const picture = text('picture')
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
		startDate: text('startdate'),
		endDate: text('enddate'),
		ratings: $('anime > ratings').children().toArray().map((rating) => ({
			kind: rating.tagName,
			value: $(rating).text().trim(),
			count: Number($(rating).attr('count')) || undefined,
		})),
		// ponytail: top 15 by weight; the full tag tree (hundreds, with spoilers) isn't useful in the modal.
		tags: $('anime > tags > tag').toArray()
			.map((tag) => ({ name: $(tag).children('name').text().trim(), weight: Number($(tag).attr('weight')) || 0 }))
			.filter((tag) => tag.name && tag.weight > 0)
			.sort((a, b) => b.weight - a.weight)
			.slice(0, 15),
		description: text('description') ? stripAnidbLinks(text('description') ?? '') : undefined,
		imageUrl: picture ? `https://cdn-eu.anidb.net/images/main/${picture}` : undefined,
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
	// ponytail: global 2s gate (AniDB limit: 1 req/2s); add a per-day cache check if we ever get banned.
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

// Fetched only when the user opens the AniDB tab; the AniDB link comes from the erai-raws page.
export async function getAnidbDetails(slug: string, refresh = false): Promise<AnidbDetails | null> {
	if (!refresh) {
		const saved = await readSeriesJson<AnidbDetails>(slug, 'anidb')
		if (saved) {
			return saved
		}
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
	const details = parseAnidbXml(aid, await fetchAnidbXml(aid, client))
	await writeSeriesJson(slug, 'anidb', details)
	await saveSeriesImage(slug, 'anidb', details.imageUrl)
	return details
}
