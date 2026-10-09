import path from 'node:path'
import { readdir, stat } from 'node:fs/promises'
import { load, type Cheerio, type CheerioAPI } from 'cheerio'
import type { Element } from 'domhandler'
import type { NyaaTorrentDetail } from '@shared/types'
import { dataRoot, readJsonFile, writeJsonFileAtomic } from '../storage/jsonStore'
import { decisionMonthKey } from '../storage/decisionStore'
import { withRetry } from './retryService'

export type { NyaaTorrentDetail }

export const nyaaViewUrl = (torrentId: string) => `https://nyaa.si/view/${torrentId}`

function timestampToIso(value: string | undefined): string | undefined {
	return value ? new Date(Number(value) * 1000).toISOString() : undefined
}

function toNumber(text: string): number | undefined {
	const value = Number(text.trim())
	return text.trim() && Number.isFinite(value) ? value : undefined
}

function parseFileList($: CheerioAPI, $list: Cheerio<Element>, prefix: string): NyaaTorrentDetail['files'] {
	return $list.children('li').toArray().flatMap((li) => {
		const $li = $(li)
		const $folder = $li.children('a.folder')
		if ($folder.length > 0) {
			return parseFileList($, $li.children('ul'), `${prefix}${$folder.text().trim()}/`)
		}
		const sizeText = /^\((.*)\)$/.exec($li.children('.file-size').text().trim())?.[1]
		const name = $li.clone().children('.file-size').remove().end().text().trim()
		return [{ path: `${prefix}${name}`, sizeText }]
	})
}

export function parseNyaaDetailHtml(torrentId: string, html: string, fetchedAtUtc = new Date().toISOString()): NyaaTorrentDetail {
	const $ = load(html)
	const $panel = $('.panel-body').first()
	// Rows are "label div + value div" pairs: <div class="col-md-1">Seeders:</div><div class="col-md-5">342</div>
	const fields = new Map<string, Cheerio<Element>>()
	$panel.find('.row > .col-md-1').each((_, label) => {
		fields.set($(label).text().trim().replace(/:$/, ''), $(label).next())
	})
	const text = (label: string) => fields.get(label)?.text().trim() || undefined
	const $category = fields.get('Category')?.find('a')
	const $submitter = fields.get('Submitter')?.find('a').first()
	return {
		torrentId,
		url: nyaaViewUrl(torrentId),
		fetchedAtUtc,
		title: $('.panel-title').first().text().trim(),
		category: $category?.toArray().map((a) => $(a).text().trim()).join(' - ') || undefined,
		categoryIds: $category?.toArray().map((a) => /c=(\d+_\d+)/.exec($(a).attr('href') ?? '')?.[1] ?? '').filter(Boolean) ?? [],
		publishedAtUtc: timestampToIso(fields.get('Date')?.attr('data-timestamp')),
		submitter: $submitter?.text().trim() || text('Submitter'),
		submitterRank: $submitter?.attr('title'),
		information: fields.get('Information')?.find('a').attr('href') ?? text('Information'),
		sizeText: text('File size'),
		seeders: toNumber(text('Seeders') ?? ''),
		leechers: toNumber(text('Leechers') ?? ''),
		completed: toNumber(text('Completed') ?? ''),
		infoHash: text('Info hash'),
		magnet: $('a[href^="magnet:"]').first().attr('href'),
		descriptionMarkdown: $('#torrent-description').text().trim() || undefined,
		files: parseFileList($, $('.torrent-file-list > ul'), ''),
		comments: $('.comment-panel').toArray().map((panel) => ({
			user: $(panel).find('.col-md-2 a').first().text().trim(),
			postedAtUtc: timestampToIso($(panel).find('[data-timestamp]').attr('data-timestamp')),
			text: $(panel).find('.comment-content').text().trim(),
		})),
	}
}

export function nyaaDetailFilePath(torrentId: string, processedAtUtc: string, root = dataRoot): string {
	return path.join(root, decisionMonthKey(processedAtUtc), `${torrentId}.json`)
}

async function listMonthDirs(root: string): Promise<string[]> {
	return (await readdir(root).catch(() => [])).filter((name) => /^\d{4}-\d{2}$/.test(name))
}

// The month folder isn't derivable from a torrentId alone: look in every month.
export async function findNyaaDetailFile(torrentId: string, root = dataRoot): Promise<string | undefined> {
	for (const month of await listMonthDirs(root)) {
		const filePath = path.join(root, month, `${torrentId}.json`)
		if (await stat(filePath).then(() => true, () => false)) {
			return filePath
		}
	}
	return undefined
}

// ponytail: rescans the month folders on every call (one readdir per month); keep an in-memory Set if it gets slow.
export async function listCachedNyaaDetailIds(root = dataRoot): Promise<string[]> {
	const ids: string[] = []
	for (const month of await listMonthDirs(root)) {
		ids.push(...(await readdir(path.join(root, month))).flatMap((name) => /^(\d+)\.json$/.exec(name)?.[1] ?? []))
	}
	return ids
}

export async function fetchNyaaDetail(torrentId: string): Promise<NyaaTorrentDetail> {
	const response = await withRetry(async () => fetch(nyaaViewUrl(torrentId), {
		headers: {
			'user-agent': 'Mozilla/5.0 (compatible; NYAADL/1.0; +https://github.com)',
			'accept-language': 'en-US,en;q=0.9',
		},
	}))
	if (!response.ok) {
		throw new Error(`Failed to fetch Nyaa view ${torrentId}: ${response.status} ${response.statusText}`)
	}
	return parseNyaaDetailHtml(torrentId, await response.text())
}

export interface GetNyaaDetailOptions {
	refresh?: boolean
	// When the file doesn't exist yet: the month folder to create it in (first classification of the torrent).
	processedAtUtc?: string
	root?: string
	fetchDetail?: (torrentId: string) => Promise<NyaaTorrentDetail>
}

// On demand (details modal): read the saved file, or fetch it from Nyaa once.
export async function getNyaaDetail(torrentId: string, options: GetNyaaDetailOptions = {}): Promise<NyaaTorrentDetail> {
	const root = options.root ?? dataRoot
	const existing = await findNyaaDetailFile(torrentId, root)
	if (existing && !options.refresh) {
		const saved = await readJsonFile<NyaaTorrentDetail | undefined>(existing, undefined)
		if (saved) {
			return saved
		}
	}
	const detail = await (options.fetchDetail ?? fetchNyaaDetail)(torrentId)
	await writeJsonFileAtomic(existing ?? nyaaDetailFilePath(torrentId, options.processedAtUtc ?? new Date().toISOString(), root), detail)
	return detail
}
