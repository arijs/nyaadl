import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { malAnimeId, parseMalHtml, parseMalReviewsHtml, parseMalVideosHtml } from './malService'

const __dirname = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(join(__dirname, 'fixtures/mal-anime-sample.html'), 'utf8')

test('parseMalHtml extracts titles, stats, synopsis and the info sidebar', () => {
	assert.deepEqual(parseMalHtml('https://myanimelist.net/anime/61013', html, '2026-10-09T00:00:00.000Z'), {
		url: 'https://myanimelist.net/anime/61013',
		fetchedAtUtc: '2026-10-09T00:00:00.000Z',
		title: 'Replica datte, Koi wo Suru.',
		englishTitle: 'Even a Replica Can Fall in Love',
		imageUrl: 'https://cdn.myanimelist.net/images/anime/1148/155671.jpg',
		score: '7.07',
		rank: '#4568',
		popularity: '#4563',
		members: '33,057',
		synopsis: 'On days when Sunao is sick, she is called to take her place.\n\n[Written by MAL Rewrite]',
		// Synonyms/Ranked are skipped; hidden genre spans don't duplicate names.
		info: [
			{ label: 'Type', value: 'TV' },
			{ label: 'Episodes', value: '13' },
			{ label: 'Aired', value: 'Apr 7, 2026 to Jun 30, 2026' },
			{ label: 'Genres', value: 'Drama, Romance' },
		],
	})
})

test('parseMalVideosHtml lists each YouTube trailer once', () => {
	const videos = `${html}
		<a class="iframe video-list" href="https://www.youtube-nocookie.com/embed/SFTkstB7ICs?enablejsapi=1"><span class="title">PV 2</span></a>
		<a class="iframe video-list" href="https://www.youtube-nocookie.com/embed/WsT7OO91jXo?enablejsapi=1"><span class="title">PV 2 (English sub ver.)</span></a>`
	assert.deepEqual(parseMalVideosHtml(videos), [
		{ title: 'PV 2 (English sub ver.)', youtubeId: 'WsT7OO91jXo' },
		{ title: 'PV 2', youtubeId: 'SFTkstB7ICs' },
	])
})

test('parseMalReviewsHtml keeps the full text, verdict, score and preliminary flag', () => {
	assert.deepEqual(parseMalReviewsHtml(readFileSync(join(__dirname, 'fixtures/mal-reviews-sample.html'), 'utf8')), [
		{
			user: 'reviewer_one',
			postedAt: 'May 3, 2026',
			verdict: 'Not Recommended',
			preliminary: 'Preliminary (3/12 eps)',
			score: 4,
			reactions: 62,
			text: '~ The animation can look a bit choppy,\n\nbut the leads carry it. The rest of the review stays hidden until "Read more".',
			url: 'https://myanimelist.net/reviews.php?id=603699',
		},
		{
			user: 'reviewer_two',
			postedAt: 'Jul 1, 2026',
			verdict: 'Mixed Feelings',
			preliminary: undefined,
			score: 6,
			reactions: 0,
			text: 'Nice try.',
			url: undefined,
		},
	])
})

test('malAnimeId reads the id from MAL anime links only', () => {
	assert.equal(malAnimeId('https://myanimelist.net/anime/61013'), '61013')
	assert.equal(malAnimeId('https://myanimelist.net/anime/61013/Replica_datte_Koi_wo_Suru'), '61013')
	assert.equal(malAnimeId('https://myanimelist.net/manga/61013'), null)
	assert.equal(malAnimeId('https://anidb.net/anime/19158'), null)
})
