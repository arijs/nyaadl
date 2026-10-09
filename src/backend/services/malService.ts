import { load } from 'cheerio'
import type { MalDetails, MalReview } from '@shared/types'
import { readSeriesJson, saveSeriesImage, writeSeriesJson } from '../storage/seriesStore'
import { getEraiSeries } from './eraiRawsService'
import { withRetry } from './retryService'

// Sidebar entries that are already their own fields (or noise) on MalDetails.
const skippedInfoLabels = new Set(['Score', 'Ranked', 'Popularity', 'Members', 'Favorites', 'Synonyms', 'Japanese', 'English'])

export function malAnimeId(url: string | undefined): string | null {
	return /^https?:\/\/(?:www\.)?myanimelist\.net\/anime\/(\d+)/.exec(url?.trim() ?? '')?.[1] ?? null
}

const clean = (text: string) => text.replace(/\s+/g, ' ').trim()

export function parseMalHtml(url: string, html: string, fetchedAtUtc = new Date().toISOString()): Omit<MalDetails, 'videos'> {
	const $ = load(html)
	const info = $('.leftside .spaceit_pad').toArray().flatMap((row) => {
		const $row = $(row).clone()
		const label = clean($row.find('span.dark_text').first().text()).replace(/:$/, '')
		// Genres repeat each name in a hidden itemprop span; footnotes add <sup> markers.
		$row.find('span.dark_text, [style*="display: none"], sup, script').remove()
		const value = clean($row.text())
		return label && value && !skippedInfoLabels.has(label) ? [{ label, value }] : []
	})
	return {
		url,
		fetchedAtUtc,
		title: clean($('h1.title-name').first().text()),
		englishTitle: clean($('p.title-english').first().text()) || undefined,
		imageUrl: $('meta[property="og:image"]').attr('content') || undefined,
		score: clean($('.score-label').first().text()) || undefined,
		rank: clean($('span.numbers.ranked strong').first().text()) || undefined,
		popularity: clean($('span.numbers.popularity strong').first().text()) || undefined,
		members: clean($('span.numbers.members strong').first().text()) || undefined,
		synopsis: $('[itemprop="description"]').first().text().trim() || undefined,
		info,
	}
}

export function parseMalVideosHtml(html: string): MalDetails['videos'] {
	const $ = load(html)
	const seen = new Set<string>()
	return $('a[href*="youtube-nocookie.com/embed/"], a[href*="youtube.com/embed/"]').toArray().flatMap((a) => {
		const youtubeId = /\/embed\/([\w-]{6,})/.exec($(a).attr('href') ?? '')?.[1]
		if (!youtubeId || seen.has(youtubeId)) {
			return []
		}
		seen.add(youtubeId)
		return [{ title: clean($(a).find('.title').first().text()) || 'Video', youtubeId }]
	})
}

// First page of /anime/<id>/_/reviews: the full text is already in the page ("Read more" only unhides it).
export function parseMalReviewsHtml(html: string): MalReview[] {
	const $ = load(html)
	return $('.review-element').toArray().flatMap((element) => {
		const $review = $(element)
		const $text = $review.find('.text').first().clone()
		$text.find('br').replaceWith('\n')
		const text = $text.text().replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()
		if (!text) {
			return []
		}
		const tags = $review.find('.tags .tag').toArray().map((tag) => clean($(tag).text()))
		const reactions = /"num":(\d+)/.exec($review.attr('data-reactions') ?? '')?.[1]
		return [{
			user: clean($review.find('.username a').first().text()),
			postedAt: clean($review.find('.update_at').first().text()) || undefined,
			verdict: tags.find((tag) => /recommended|mixed feelings/i.test(tag)),
			preliminary: tags.find((tag) => /^preliminary/i.test(tag)),
			score: Number(clean($review.find('.rating .num').first().text())) || undefined,
			reactions: reactions ? Number(reactions) : undefined,
			text,
			url: $review.find('.open a').first().attr('href'),
		}]
	})
}

async function fetchMalHtml(url: string): Promise<string> {
	const response = await withRetry(async () => fetch(url, {
		headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'accept-language': 'en-US,en;q=0.9' },
	}))
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
	}
	return response.text()
}

// Fetched only when the user opens the MAL tab; the MAL link comes from the erai-raws page.
export async function getMalDetails(slug: string, refresh = false): Promise<MalDetails | null> {
	if (!refresh) {
		const saved = await readSeriesJson<MalDetails>(slug, 'mal')
		if (saved) {
			return saved
		}
	}
	const { series } = await getEraiSeries(slug)
	const id = series.links.map((link) => malAnimeId(link.url)).find(Boolean)
	if (!id) {
		return null
	}
	const url = `https://myanimelist.net/anime/${id}`
	const details: MalDetails = {
		...parseMalHtml(url, await fetchMalHtml(url)),
		// "_" stands in for the title slug; MAL resolves it.
		videos: parseMalVideosHtml(await fetchMalHtml(`${url}/_/video`)),
		reviews: parseMalReviewsHtml(await fetchMalHtml(`${url}/_/reviews`)),
	}
	await writeSeriesJson(slug, 'mal', details)
	await saveSeriesImage(slug, 'mal', details.imageUrl)
	return details
}
