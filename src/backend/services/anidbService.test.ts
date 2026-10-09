import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anidbAnimeId, anidbCacheAction, anidbSeason, parseAnidbXml } from './anidbService'

// Shape of the AniDB HTTP API "anime" response (https://wiki.anidb.net/HTTP_API_Definition).
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<anime id="19382" restricted="false">
	<type>TV Series</type>
	<episodecount>12</episodecount>
	<startdate>2026-04-14</startdate>
	<enddate>2026-06-30</enddate>
	<titles>
		<title xml:lang="x-jat" type="main">Aishiteru Game o Owarasetai</title>
		<title xml:lang="en" type="official">I Want to End This Love Game</title>
	</titles>
	<relatedanime><anime id="20001" type="Sequel">Aishiteru Game o Owarasetai 2</anime></relatedanime>
	<recommendations total="1"><recommendation type="Recommended" uid="1">Cute vanilla romance.</recommendation></recommendations>
	<url>https://www.aishiteru-game.com/</url>
	<creators>
		<name id="41009" type="Animation Work">Felix Film</name>
		<name id="1" type="Direction">Tani Azuma</name>
	</creators>
	<description>Since childhood, http://anidb.net/ch1 [Asagi Yukiya] and http://anidb.net/ch2 [Sakura Miku] play a game.</description>
	<ratings>
		<permanent count="173">4.31</permanent>
		<temporary count="174">5.96</temporary>
	</ratings>
	<picture>324725.jpg</picture>
	<resources>
		<resource type="2"><externalentity><identifier>61839</identifier></externalentity></resource>
		<resource type="4"><externalentity><url>https://www.aishiteru-game.com/</url></externalentity></resource>
		<resource type="44"><externalentity><identifier>293697</identifier><identifier>tv</identifier></externalentity></resource>
		<resource type="999"><externalentity><identifier>unknown</identifier></externalentity></resource>
	</resources>
	<tags>
		<tag id="922" infobox="true" weight="0" localspoiler="false" globalspoiler="false"><name>shounen</name><description>Male audience 10-18.</description></tag>
		<tag id="2858" infobox="true" weight="500" localspoiler="false" globalspoiler="false"><name>romance</name></tag>
		<tag id="3" weight="100" localspoiler="false" globalspoiler="false"><name>multiple couples</name></tag>
		<tag id="4" weight="600" localspoiler="true" globalspoiler="false"><name>ending twist</name></tag>
		<tag id="5" weight="0" localspoiler="false" globalspoiler="false"><name>themes</name></tag>
	</tags>
	<characters>
		<character id="1" type="main character in"><name>Sakura Miku</name><seiyuu id="9">Itou Miku</seiyuu></character>
		<character id="2" type="appears in"><name>Extra</name></character>
	</characters>
	<episodes>
		<episode id="12"><epno type="1">10</epno><length>25</length><airdate>2026-06-16</airdate><title xml:lang="ja">x</title><title xml:lang="en">Episode Ten</title></episode>
		<episode id="2"><epno type="1">2</epno><length>25</length><airdate>2026-04-21</airdate><rating votes="3">8.42</rating><title xml:lang="en">My Childhood Friend Cooks</title><summary>Miku cooks.</summary></episode>
		<episode id="90"><epno type="2">S1</epno><length>5</length><title xml:lang="en">Special</title></episode>
		<episode id="91"><epno type="3">C1</epno><title xml:lang="en">Opening</title></episode>
	</episodes>
</anime>`

test('parseAnidbXml extracts the anime page info from the API response', () => {
	const details = parseAnidbXml('0', xml, '2026-10-09T00:00:00.000Z')
	assert.equal(details.aid, '19382')
	assert.equal(details.season, 'Spring 2026')
	assert.equal(details.officialUrl, 'https://www.aishiteru-game.com/')
	assert.equal(details.description, 'Since childhood, Asagi Yukiya and Sakura Miku play a game.')
	assert.equal(details.imageUrl, 'https://cdn-eu.anidb.net/images/main/324725.jpg')
	assert.deepEqual(details.ratings, [
		{ kind: 'permanent', value: '4.31', count: 173 },
		{ kind: 'temporary', value: '5.96', count: 174 },
	])
	// Infobox tags first (even weight 0, like the website), then weighted ones; no spoilers, no weightless categories.
	assert.deepEqual(details.tags, [
		{ name: 'romance', weight: 500, description: undefined },
		{ name: 'shounen', weight: 0, description: 'Male audience 10-18.' },
		{ name: 'multiple couples', weight: 100, description: undefined },
	])
	assert.deepEqual(details.resources, [
		{ label: 'MAL', url: 'https://myanimelist.net/anime/61839' },
		{ label: 'Official website', url: 'https://www.aishiteru-game.com/' },
		{ label: 'TMDB', url: 'https://www.themoviedb.org/tv/293697' },
	])
	assert.deepEqual(details.creators, [{ role: 'Animation Work', name: 'Felix Film' }, { role: 'Direction', name: 'Tani Azuma' }])
	assert.deepEqual(details.characters, [{ name: 'Sakura Miku', role: 'main character', seiyuu: 'Itou Miku' }])
	// Regular episodes in numeric order, then specials; credits dropped.
	assert.deepEqual(details.episodes?.map((episode) => [episode.number, episode.title]), [['2', 'My Childhood Friend Cooks'], ['10', 'Episode Ten'], ['S1', 'Special']])
	assert.deepEqual(details.episodes?.[0], { number: '2', title: 'My Childhood Friend Cooks', airDate: '2026-04-21', lengthMinutes: 25, rating: '8.42', summary: 'Miku cooks.' })
	assert.deepEqual(details.recommendations, [{ type: 'Recommended', text: 'Cute vanilla romance.' }])
	assert.deepEqual(details.related, [{ aid: '20001', relation: 'Sequel', title: 'Aishiteru Game o Owarasetai 2' }])
})

test('parseAnidbXml turns API errors into messages', () => {
	assert.throws(() => parseAnidbXml('1', '<error code="302">client version missing or invalid</error>'), /client version missing or invalid/)
	assert.throws(() => parseAnidbXml('1', '<error>Banned</error>'), /Banned/)
})

test('anidbCacheAction never asks AniDB twice for the same anime within 24h', () => {
	const now = Date.parse('2026-10-10T12:00:00.000Z')
	const recent = { fetchedAtUtc: '2026-10-10T08:00:00.000Z' }
	const old = { fetchedAtUtc: '2026-10-08T08:00:00.000Z' }
	assert.equal(anidbCacheAction(undefined, false, false, now), 'fetch')
	assert.equal(anidbCacheAction(recent, true, false, now), 'reparse')
	// Refresh within 24h: re-parse the saved XML, or refuse when there's none (file saved before anidb.xml existed).
	assert.equal(anidbCacheAction(recent, true, true, now), 'reparse')
	assert.equal(anidbCacheAction(recent, false, true, now), 'blocked')
	assert.equal(anidbCacheAction(recent, false, false, now), 'saved')
	// Refresh after 24h really asks the API again.
	assert.equal(anidbCacheAction(old, true, true, now), 'fetch')
	assert.equal(anidbCacheAction(old, false, true, now), 'fetch')
})

test('anidbSeason follows the start month', () => {
	assert.equal(anidbSeason('2026-01-05'), 'Winter 2026')
	assert.equal(anidbSeason('2026-04-14'), 'Spring 2026')
	assert.equal(anidbSeason('2026-09-30'), 'Summer 2026')
	assert.equal(anidbSeason('2026-10-01'), 'Fall 2026')
	assert.equal(anidbSeason(undefined), undefined)
})

test('anidbAnimeId reads the aid from both AniDB link styles', () => {
	assert.equal(anidbAnimeId('https://anidb.net/anime/19158'), '19158')
	assert.equal(anidbAnimeId('https://anidb.net/perl-bin/animedb.pl?show=anime&aid=19158'), '19158')
	assert.equal(anidbAnimeId('https://myanimelist.net/anime/61013'), null)
})
