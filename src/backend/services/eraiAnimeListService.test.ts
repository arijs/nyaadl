import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	eraiTitleKey,
	findEraiSlugByTitle,
	parseEraiAnimeListHtml,
	resolveEraiSeriesSlug,
	seriesNameFromTorrentTitle,
	type EraiAnimeListEntry,
} from './eraiAnimeListService'

// Same shape as https://www.erai-raws.info/anime-list/ (minified, unquoted hrefs with a doubled trailing slash).
const html = `<table class="table table-hover table-dark"><tr ><th> <a class="aa_ss_ops_new margin_left_5" href=https://www.erai-raws.info/news/your-support-is-our-lifeline/ title="Your Support is Our Lifeline">x</a>
<a class="aa_ss_ops_new margin_left_5" href=https://www.erai-raws.info/anime-list/island// title="Island"> Island</a>
<a class="aa_ss_ops_new margin_left_5" href=https://www.erai-raws.info/anime-list/sunohara-sou-no-kanrinin-san// title="Sunohara-sou no Kanrinin-san">Sunohara-sou no Kanrinin-san</a>
<a class="aa_ss_ops_new margin_left_5" href=https://www.erai-raws.info/anime-list/island// title="Island">duplicate</a></th></tr></table>`

const entries: EraiAnimeListEntry[] = [
	{ title: 'Island', slug: 'island' },
	{ title: 'Clevatess', slug: 'clevatess' },
	{ title: 'Clevatess II', slug: 'clevatess-ii' },
	{ title: 'Mushoku Tensei III: Isekai Ittara Honki Dasu', slug: 'mushoku-tensei-iii-isekai-ittara-honki-dasu' },
	{ title: 'Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e 3rd Season', slug: 'youkoso-jitsuryoku-shijou-shugi-no-kyoushitsu-e-3rd-season' },
	{ title: 'Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e 4th Season: 2-nensei-hen 1 Gakki', slug: 'youkoso-jitsuryoku-shijou-shugi-no-kyoushitsu-e-4th-season-2-nensei-hen-1-gakki' },
	{ title: 'Kimi to Boku no Saigo no Senjou Arui wa Sekai ga Hajimaru Seisen', slug: 'kimi-to-boku-no-saigo-no-senjou-arui-wa-sekai-ga-hajimaru-seisen' },
	{ title: 'Kimi to Boku no Saigo no Senjou Arui wa Sekai ga Hajimaru Seisen Season II', slug: 'kimi-to-boku-no-saigo-no-senjou-aruiwa-sekai-ga-hajimaru-seisen-season-ii' },
	{ title: 'Twin A: Part 1', slug: 'twin-a-part-1' },
	{ title: 'Twin A: Part 2', slug: 'twin-a-part-2' },
]

test('parseEraiAnimeListHtml keeps only series pages, once each', () => {
	assert.deepEqual(parseEraiAnimeListHtml(html), [
		{ title: 'Island', slug: 'island' },
		{ title: 'Sunohara-sou no Kanrinin-san', slug: 'sunohara-sou-no-kanrinin-san' },
	])
})

test('eraiTitleKey ignores punctuation and normalizes season numbers', () => {
	assert.equal(eraiTitleKey('Mushoku Tensei III: Isekai Ittara Honki Dasu'), eraiTitleKey('Mushoku Tensei III- Isekai Ittara Honki Dasu'))
	assert.equal(eraiTitleKey('Show S4'), 'show season 4')
	assert.equal(eraiTitleKey('Show 4th Season'), 'show season 4')
	assert.equal(eraiTitleKey('Show Season 4'), 'show season 4')
})

test('seriesNameFromTorrentTitle strips the group, episode, batch range and metadata', () => {
	assert.equal(seriesNameFromTorrentTitle('[Erai-raws] Island - 01 ~ 12 [720p][Multiple Subtitle]'), 'island')
	assert.equal(seriesNameFromTorrentTitle('[Erai-raws] Clevatess II - 01 [720p CR WEB-DL AVC AAC][MultiSub][A1B2C3D4]'), 'clevatess ii')
	assert.equal(seriesNameFromTorrentTitle('[Erai-raws] Sunohara-sou no Kanrinin-san [720p]'), 'sunohara-sou no kanrinin-san')
})

test('findEraiSlugByTitle matches exactly, then by the title before ":", and refuses ambiguous matches', () => {
	assert.equal(findEraiSlugByTitle(entries, 'clevatess ii'), 'clevatess-ii')
	assert.equal(findEraiSlugByTitle(entries, 'clevatess'), 'clevatess')
	assert.equal(findEraiSlugByTitle(entries, 'mushoku tensei iii- isekai ittara honki dasu'), 'mushoku-tensei-iii-isekai-ittara-honki-dasu')
	assert.equal(findEraiSlugByTitle(entries, 'youkoso jitsuryoku shijou shugi no kyoushitsu e s4'), 'youkoso-jitsuryoku-shijou-shugi-no-kyoushitsu-e-4th-season-2-nensei-hen-1-gakki')
	assert.equal(findEraiSlugByTitle(entries, 'kimi to boku no saigo no senjou arui wa sekai ga hajimaru seisen'), 'kimi-to-boku-no-saigo-no-senjou-arui-wa-sekai-ga-hajimaru-seisen')
	assert.equal(findEraiSlugByTitle(entries, 'twin a'), undefined)
	assert.equal(findEraiSlugByTitle(entries, 'not in the list'), undefined)
})

test('resolveEraiSeriesSlug prefers the Nyaa link and looks Erai-raws titles up in the list otherwise', async () => {
	let listCalls = 0
	const list = async () => {
		listCalls += 1
		return entries
	}
	assert.equal(await resolveEraiSeriesSlug({ information: 'https://www.erai-raws.info/anime-list/island/', title: '[Erai-raws] Whatever - 01 [720p]' }, list), 'island')
	assert.equal(listCalls, 0)
	assert.equal(await resolveEraiSeriesSlug({ information: 'https://www.erai-raws.info', title: '[Erai-raws] Island - 01 ~ 12 [720p][Multiple Subtitle]' }, list), 'island')
	assert.equal(await resolveEraiSeriesSlug({ information: 'No information.', title: '[Erai-raws] Clevatess II - 01 [720p CR WEB-DL AVC AAC][MultiSub][A1B2C3D4]' }, list), 'clevatess-ii')
	assert.equal(listCalls, 2)
	// Other groups have no page there: the list isn't even read.
	assert.equal(await resolveEraiSeriesSlug({ information: 'https://anilist.co/anime/195734', title: '[VARYG] Ichijyoma Mankitsu Gurashi [1080p]' }, list), undefined)
	assert.equal(listCalls, 2)
})
