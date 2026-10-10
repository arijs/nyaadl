import path from 'node:path'
import { readdir } from 'node:fs/promises'
import { load } from 'cheerio'
import type { EraiRawsReleasesFile, EraiRawsSeriesDetails, EraiRawsStatus } from '@shared/types'
import { dataRoot, readJsonFile, writeJsonFileAtomic } from '../storage/jsonStore'
import { readSeriesJson, saveSeriesImage, seriesRoot, writeSeriesJson } from '../storage/seriesStore'
import { withRetry } from './retryService'

export interface EraiRawsSession {
	cookie: string
	userAgent: string
}

export class EraiRawsAuthError extends Error {
	constructor() {
		super('erai-raws.info session is missing or expired: paste a fresh cookie in Execution state')
	}
}

const sessionPath = path.join(dataRoot, 'erai-raws-session.json')
const homeUrl = 'https://www.erai-raws.info/'
const loggedOutMarker = 'to see the content of the website'

let session: EraiRawsSession | undefined
let sessionLoaded = false
let status: EraiRawsStatus = { configured: false, status: 'unknown' }

export function eraiSeriesSlug(url: string | undefined): string | null {
	return /^https?:\/\/(?:www\.)?erai-raws\.info\/anime-list\/([a-z0-9][a-z0-9_-]*)\/?$/i.exec(url?.trim() ?? '')?.[1]?.toLowerCase() ?? null
}

export const eraiSeriesUrl = (slug: string) => `https://www.erai-raws.info/anime-list/${slug}/`

export function readLoggedInUser(html: string): { loggedIn: boolean; user?: string } {
	return {
		loggedIn: !html.includes(loggedOutMarker),
		user: /You are logged in as\s*(?:<[^>]*>\s*)*([^<|\s]+)/i.exec(html)?.[1],
	}
}

export function parseEraiSeriesHtml(url: string, html: string, fetchedAtUtc = new Date().toISOString()): EraiRawsSeriesDetails {
	const $ = load(html)
	const title = $('article h1.entry-title').first().text().trim()
	if (!readLoggedInUser(html).loggedIn || !title) {
		throw new EraiRawsAuthError()
	}
	const clean = (text: string) => text.replace(/\s+/g, ' ').trim()
	return {
		series: {
			url,
			slug: eraiSeriesSlug(url) ?? '',
			fetchedAtUtc,
			title,
			synopsis: clean($('.entry-content-story').first().text()) || undefined,
			imageUrl: $('.entry-content-poster img').first().attr('src') || undefined,
			// RSS/torrent/magnet buttons carry the user's personal feed token, and the other erai-raws
			// buttons are account pages (My Anime List, My Settings): keep NZB/SUB + external sites only.
			links: $('a.entry-sub-content-buttons').toArray()
				.map((a) => ({ label: clean($(a).text()), url: $(a).attr('href') ?? '' }))
				.filter((link) => /^https?:\/\//.test(link.url)
					&& !/[?&]token=/.test(link.url)
					&& !/erai-raws\.info\/(?!nzbs\/|subs\/)/.test(link.url)),
		},
		releases: $('#menu0 tbody').toArray().flatMap((tbody) => {
			const $tbody = $(tbody)
			const $title = $tbody.find('a.aa_ss_ops_new').first()
			if ($title.length === 0) {
				return []
			}
			return [{
				type: clean($tbody.find('a.tooltip2').first().text()) || undefined,
				title: clean($title.text()),
				url: $title.attr('href'),
				releasedAt: clean($tbody.find('font.clock_font').toArray().map((font) => $(font).text()).join(' ').replace('|', '')) || undefined,
				subtitles: $tbody.find('span.flag-icon').toArray()
					.map((span) => /flag-icon-([a-z]{2})\b/.exec($(span).attr('class') ?? '')?.[1] ?? '')
					.filter(Boolean),
				variants: $tbody.find('th > span:not([class])').toArray().flatMap((span) => {
					const [resolution, size, source] = clean($(span).text()).split('|').map((part) => part.trim())
					return resolution ? [{ resolution, sizeText: size?.replace(/^Size:\s*/i, '') || undefined, source: source || undefined }] : []
				}),
			}]
		}),
	}
}

async function loadSession(): Promise<EraiRawsSession | undefined> {
	if (!sessionLoaded) {
		const stored = await readJsonFile<Partial<EraiRawsSession>>(sessionPath, {})
		session = stored.cookie ? { cookie: stored.cookie, userAgent: stored.userAgent ?? '' } : undefined
		sessionLoaded = true
		status = { ...status, configured: Boolean(session) }
	}
	return session
}

async function fetchEraiHtml(url: string): Promise<string> {
	const current = await loadSession()
	if (!current) {
		throw new EraiRawsAuthError()
	}
	const response = await withRetry(async () => fetch(url, {
		headers: {
			cookie: current.cookie,
			// DDoS-Guard ties its cookies to the browser that earned them.
			'user-agent': current.userAgent || 'Mozilla/5.0',
			'accept-language': 'en-US,en;q=0.9',
		},
	}))
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
	}
	const html = await response.text()
	const login = readLoggedInUser(html)
	status = login.loggedIn
		? { configured: true, status: 'ok', loggedInAs: login.user ?? status.loggedInAs }
		: { configured: true, status: 'expired' }
	return html
}

// Cached in data/series/<slug>/ until `refresh` is asked for: fetched only when the user opens the Erai tab
// (or the MAL/AniDB tab, which need its links).
export async function getEraiSeries(slug: string, refresh = false): Promise<EraiRawsSeriesDetails> {
	if (!refresh) {
		const series = await readSeriesJson<EraiRawsSeriesDetails['series']>(slug, 'erai')
		const releases = await readSeriesJson<EraiRawsReleasesFile>(slug, 'erai-releases')
		if (series && releases) {
			return { series, releases: releases.releases }
		}
	}
	const url = eraiSeriesUrl(slug)
	const details = parseEraiSeriesHtml(url, await fetchEraiHtml(url))
	await writeSeriesJson(slug, 'erai', details.series)
	await writeSeriesJson<EraiRawsReleasesFile>(slug, 'erai-releases', { fetchedAtUtc: details.series.fetchedAtUtc, releases: details.releases })
	await saveSeriesImage(slug, 'erai', details.series.imageUrl)
	return details
}

export async function getEraiRawsStatus(): Promise<EraiRawsStatus> {
	await loadSession()
	return status
}

export async function saveEraiRawsSession(input: EraiRawsSession): Promise<EraiRawsStatus> {
	session = { cookie: input.cookie.trim().replace(/^cookie:\s*/i, ''), userAgent: input.userAgent.trim() }
	sessionLoaded = true
	status = { configured: true, status: 'unknown' }
	await writeJsonFileAtomic(sessionPath, session)
	// A series page shows the "logged in as" name; the home page doesn't.
	const [knownSlug] = await readdir(seriesRoot).catch(() => [])
	try {
		await fetchEraiHtml(knownSlug ? eraiSeriesUrl(knownSlug) : homeUrl)
	} catch (error) {
		console.warn(`Could not test erai-raws session: ${error instanceof Error ? error.message : String(error)}`)
	}
	return status
}
