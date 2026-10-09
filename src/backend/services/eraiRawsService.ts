import path from 'node:path'
import { readdir, stat } from 'node:fs/promises'
import { load } from 'cheerio'
import type { EraiRawsStatus } from '@shared/types'
import { dataRoot, readJsonFile, writeJsonFileAtomic } from '../storage/jsonStore'
import { withRetry } from './retryService'

// The erai-raws.info series page (only visible when logged in), saved as data/erai-raws/<slug>.json.
export interface EraiRawsSeries {
	url: string
	slug: string
	fetchedAtUtc: string
	title: string
	synopsis?: string
	links: Array<{ label: string; url: string }>
	releases: Array<{
		type?: string
		title: string
		url?: string
		releasedAt?: string
		subtitles: string[]
		variants: Array<{ resolution: string; sizeText?: string; source?: string }>
	}>
}

export interface EraiRawsSession {
	cookie: string
	userAgent: string
}

export class EraiRawsAuthError extends Error {
	constructor() {
		super('erai-raws.info session is missing or expired')
	}
}

const sessionPath = path.join(dataRoot, 'erai-raws-session.json')
const seriesDir = path.join(dataRoot, 'erai-raws')
const homeUrl = 'https://www.erai-raws.info/'
const loggedOutMarker = 'to see the content of the website'
// ponytail: fixed TTL, the series page only grows once a week per episode
const refreshAfterMs = 24 * 60 * 60 * 1000

let session: EraiRawsSession | undefined
let sessionLoaded = false
let status: EraiRawsStatus = { configured: false, status: 'unknown' }

export function eraiSeriesSlug(url: string | undefined): string | null {
	return /^https?:\/\/(?:www\.)?erai-raws\.info\/anime-list\/([a-z0-9-]+)\/?$/i.exec(url?.trim() ?? '')?.[1]?.toLowerCase() ?? null
}

export const eraiSeriesFilePath = (slug: string) => path.join(seriesDir, `${slug}.json`)

export function readLoggedInUser(html: string): { loggedIn: boolean; user?: string } {
	return {
		loggedIn: !html.includes(loggedOutMarker),
		user: /You are logged in as\s*(?:<[^>]*>\s*)*([^<|\s]+)/i.exec(html)?.[1],
	}
}

export function parseEraiSeriesHtml(url: string, html: string, fetchedAtUtc = new Date().toISOString()): EraiRawsSeries {
	const $ = load(html)
	const title = $('article h1.entry-title').first().text().trim()
	if (!readLoggedInUser(html).loggedIn || !title) {
		throw new EraiRawsAuthError()
	}
	const clean = (text: string) => text.replace(/\s+/g, ' ').trim()
	return {
		url,
		slug: eraiSeriesSlug(url) ?? '',
		fetchedAtUtc,
		title,
		synopsis: clean($('.entry-content-story').first().text()) || undefined,
		// RSS/torrent/magnet buttons carry the user's personal feed token: keep plain links only.
		links: $('a.entry-sub-content-buttons').toArray()
			.map((a) => ({ label: clean($(a).text()), url: $(a).attr('href') ?? '' }))
			.filter((link) => /^https?:\/\//.test(link.url) && !/[?&]token=/.test(link.url) && !/^(?:FHD|HD|SD|ALL)$/.test(link.label)),
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

export async function fetchEraiSeries(url: string): Promise<EraiRawsSeries> {
	return parseEraiSeriesHtml(url, await fetchEraiHtml(url))
}

// Best effort, like archiveNyaaDetail: never blocks classification/download.
export async function archiveEraiSeries(url: string | undefined): Promise<void> {
	const slug = eraiSeriesSlug(url)
	if (!slug || !url || !(await loadSession())) {
		return
	}
	const filePath = eraiSeriesFilePath(slug)
	const modifiedAt = await stat(filePath).then((info) => info.mtimeMs, () => 0)
	if (Date.now() - modifiedAt < refreshAfterMs) {
		return
	}
	try {
		await writeJsonFileAtomic(filePath, await fetchEraiSeries(url))
	} catch (error) {
		console.warn(`Could not archive erai-raws series ${slug}: ${error instanceof Error ? error.message : String(error)}`)
	}
}

// Every erai-raws series URL referenced by an archived Nyaa detail (data/YYYY-MM/<id>.json).
export async function listArchivedEraiSeriesUrls(root = dataRoot): Promise<string[]> {
	const months = (await readdir(root).catch(() => [])).filter((name) => /^\d{4}-\d{2}$/.test(name))
	const urls = new Map<string, string>()
	for (const month of months) {
		for (const file of (await readdir(path.join(root, month))).filter((name) => name.endsWith('.json'))) {
			const detail = await readJsonFile<{ information?: string }>(path.join(root, month, file), {})
			const slug = eraiSeriesSlug(detail.information)
			if (slug && detail.information) {
				urls.set(slug, detail.information)
			}
		}
	}
	return [...urls.values()]
}

export async function backfillEraiSeries(): Promise<void> {
	for (const url of await listArchivedEraiSeriesUrls()) {
		await archiveEraiSeries(url)
	}
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
	const [probeUrl] = await listArchivedEraiSeriesUrls()
	try {
		await fetchEraiHtml(probeUrl ?? homeUrl)
	} catch (error) {
		console.warn(`Could not test erai-raws session: ${error instanceof Error ? error.message : String(error)}`)
	}
	if (status.status === 'ok') {
		void backfillEraiSeries()
	}
	return status
}
