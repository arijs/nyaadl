import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anidbAnimeId, parseAnidbXml } from './anidbService'

// Shape of the AniDB HTTP API "anime" response (https://wiki.anidb.net/HTTP_API_Definition).
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<anime id="19158" restricted="false">
	<type>TV Series</type>
	<episodecount>13</episodecount>
	<startdate>2026-04-07</startdate>
	<enddate>2026-06-30</enddate>
	<titles>
		<title xml:lang="x-jat" type="main">Replica datte, Koi wo Suru.</title>
		<title xml:lang="en" type="official">Even a Replica Can Fall in Love</title>
	</titles>
	<description>http://anidb.net/ch1 [Nao] takes the place of http://anidb.net/ch2 [Sunao] at school.</description>
	<ratings>
		<permanent count="25">7.12</permanent>
		<temporary count="30">7.20</temporary>
	</ratings>
	<picture>301234.jpg</picture>
	<tags>
		<tag id="1" weight="200"><name>romance</name></tag>
		<tag id="2" weight="600"><name>school life</name></tag>
		<tag id="3" weight="0"><name>unweighted</name></tag>
	</tags>
	<episodes><episode id="1"><title xml:lang="en">Episode 1</title></episode></episodes>
</anime>`

test('parseAnidbXml extracts titles, ratings, top tags and the picture', () => {
	assert.deepEqual(parseAnidbXml('19158', xml, '2026-10-09T00:00:00.000Z'), {
		aid: '19158',
		url: 'https://anidb.net/anime/19158',
		fetchedAtUtc: '2026-10-09T00:00:00.000Z',
		titles: [
			{ type: 'main', lang: 'x-jat', title: 'Replica datte, Koi wo Suru.' },
			{ type: 'official', lang: 'en', title: 'Even a Replica Can Fall in Love' },
		],
		type: 'TV Series',
		episodeCount: 13,
		startDate: '2026-04-07',
		endDate: '2026-06-30',
		ratings: [
			{ kind: 'permanent', value: '7.12', count: 25 },
			{ kind: 'temporary', value: '7.20', count: 30 },
		],
		tags: [
			{ name: 'school life', weight: 600 },
			{ name: 'romance', weight: 200 },
		],
		description: 'Nao takes the place of Sunao at school.',
		imageUrl: 'https://cdn-eu.anidb.net/images/main/301234.jpg',
	})
})

test('parseAnidbXml turns API errors into messages', () => {
	assert.throws(() => parseAnidbXml('1', '<error code="302">client version missing or invalid</error>'), /client version missing or invalid/)
	assert.throws(() => parseAnidbXml('1', '<error>Banned</error>'), /Banned/)
})

test('anidbAnimeId reads the aid from both AniDB link styles', () => {
	assert.equal(anidbAnimeId('https://anidb.net/anime/19158'), '19158')
	assert.equal(anidbAnimeId('https://anidb.net/perl-bin/animedb.pl?show=anime&aid=19158'), '19158')
	assert.equal(anidbAnimeId('https://myanimelist.net/anime/61013'), null)
})
