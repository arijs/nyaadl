import path from 'node:path'
import { stat } from 'node:fs/promises'
import { load, type Cheerio, type CheerioAPI } from 'cheerio'
import type { Element } from 'domhandler'
import { dataRoot, readJsonFile, writeJsonFileAtomic } from '../storage/jsonStore'
import { decisionMonthKey } from '../storage/decisionStore'
import { archiveEraiSeries } from './eraiRawsService'
import { withRetry } from './retryService'

// Everything the Nyaa /view/<id> page exposes, saved as data/YYYY-MM/<torrentId>.json
// (YYYY-MM = month the torrent was processed by NYAADL).
export interface NyaaTorrentDetail {
	torrentId: string
	url: string
	fetchedAtUtc: string
	title: string
	category?: string
	categoryIds: string[]
	publishedAtUtc?: string
	submitter?: string
	submitterRank?: string
	information?: string
	sizeText?: string
	seeders?: number
	leechers?: number
	completed?: number
	infoHash?: string
	magnet?: string
	descriptionMarkdown?: string
	files: Array<{ path: string; sizeText?: string }>
	comments: Array<{ user: string; postedAtUtc?: string; text: string }>
}

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

export function nyaaDetailFilePath(torrentId: string, processedAtUtc: string): string {
	return path.join(dataRoot, decisionMonthKey(processedAtUtc), `${torrentId}.json`)
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

// Best effort: a failed detail fetch must never block classification/download.
export async function archiveNyaaDetail(torrentId: string, processedAtUtc = new Date().toISOString()): Promise<void> {
	const filePath = nyaaDetailFilePath(torrentId, processedAtUtc)
	let information: string | undefined
	if (await stat(filePath).then(() => true, () => false)) {
		information = (await readJsonFile<Partial<NyaaTorrentDetail>>(filePath, {})).information
	} else {
		try {
			const detail = await fetchNyaaDetail(torrentId)
			await writeJsonFileAtomic(filePath, detail)
			information = detail.information
		} catch (error) {
			console.warn(`Could not archive Nyaa details for ${torrentId}: ${error instanceof Error ? error.message : String(error)}`)
		}
	}
	await archiveEraiSeries(information)
}
