import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseReleaseTags, parseReleaseTitle, releaseIdentityTitle } from './releaseTitle.js'
import type { ParsedRelease } from './releaseTitle.js'

const seitokaiEn = 'Even the Student Council Has Its Holes'
const seitokaiRo = 'Seitokai ni mo Ana wa Aru!'
const angelEn = 'The Angel Next Door Spoils Me Rotten'
const angelRo = 'Otonari no Tenshi-sama ni Itsunomanika Dame Ningen ni Sareteita Ken'

// One real title per release group (or per layout of a group), as seen on Nyaa.
const cases: Array<[string, ParsedRelease]> = [
	['[ToonsHub] Even the Student Council Has Its Holes S01E03 REPACK 1080p UNCENSORED ADN WEB-DL AAC2.0 H.264 (Seitokai ni mo Ana wa Aru!, Multi-Subs)', {
		group: 'ToonsHub', englishTitle: seitokaiEn, romajiTitle: seitokaiRo, season: 1, episode: '03', version: undefined, episodeTitle: undefined, batch: false, resolution: '1080p', crc32: undefined,
		tags: { source: 'adn', sourceType: 'web-dl', videoCodec: 'h264', audioCodec: 'aac2.0', subtitles: 'multi', censorship: 'uncensored', repack: 'repack' },
	}],
	['[ToonsHub] The Angel Next Door Spoils Me Rotten S01 1080p CR WEB-DL DUAL AAC2.0 H.264 (Otonari no Tenshi-sama ni Itsunomanika Dame Ningen ni Sareteita Ken, Dual-Audio, Multi-Subs) [BATCH]', {
		group: 'ToonsHub', englishTitle: angelEn, romajiTitle: angelRo, season: 1, episode: undefined, version: undefined, episodeTitle: undefined, batch: true, resolution: '1080p', crc32: undefined,
		tags: { source: 'cr', sourceType: 'web-dl', videoCodec: 'h264', audioCodec: 'aac2.0', audioLanguages: 'dual', subtitles: 'multi' },
	}],
	['The Angel Next Door Spoils Me Rotten S02E07 The Angels Pleas 1080p CR WEB-DL MULTi AAC2.0 H.264-VARYG (Otonari no Tenshi-sama ni Itsunomanika Dame Ningen ni Sareteita Ken 2nd Season, Multi-Audio, Multi-Subs)', {
		group: 'VARYG', englishTitle: angelEn, romajiTitle: angelRo, season: 2, episode: '07', version: undefined, episodeTitle: 'The Angels Pleas', batch: false, resolution: '1080p', crc32: undefined,
		tags: { source: 'cr', sourceType: 'web-dl', videoCodec: 'h264', audioCodec: 'aac2.0', audioLanguages: 'multi', subtitles: 'multi' },
	}],
	['[denisplay] Seitokai ni mo Ana wa Aru! - 03 [720p] [AV1] (Even the Student Council Has Its Holes) (Uncensored) V2', {
		group: 'denisplay', englishTitle: seitokaiEn, romajiTitle: seitokaiRo, season: undefined, episode: '03', version: 'v2', episodeTitle: undefined, batch: false, resolution: '720p', crc32: undefined,
		tags: { videoCodec: 'av1', censorship: 'uncensored' },
	}],
	['[hisako] Seitokai ni mo Ana wa Aru! - 01 [1080p] WEB-DL (Even the Student Council Has Its Holes) (Uncensored)', {
		group: 'hisako', englishTitle: seitokaiEn, romajiTitle: seitokaiRo, season: undefined, episode: '01', version: undefined, episodeTitle: undefined, batch: false, resolution: '1080p', crc32: undefined,
		tags: { sourceType: 'web-dl', censorship: 'uncensored' },
	}],
	['[Judas] Seitokai ni mo Ana wa Aru! {Even the Student Council Has Its Holes) [Uncensored] - S01E04 [1080p][HEVC x265 10bit][Multi-Subs] (Weekly)', {
		group: 'Judas', englishTitle: seitokaiEn, romajiTitle: seitokaiRo, season: 1, episode: '04', version: undefined, episodeTitle: undefined, batch: false, resolution: '1080p', crc32: undefined,
		tags: { videoCodec: 'h265', bitDepth: '10bit', subtitles: 'multi', censorship: 'uncensored' },
	}],
	['[Doomdos] - Seitokai ni mo Ana wa Aru! - S01E04 [1080p BILIBILI INTERNATIONAL WEB-DL] [Even the Student Council Has Its Holes!]', {
		group: 'Doomdos', englishTitle: `${seitokaiEn}!`, romajiTitle: seitokaiRo, season: 1, episode: '04', version: undefined, episodeTitle: undefined, batch: false, resolution: '1080p', crc32: undefined,
		tags: { source: 'bili', sourceType: 'web-dl' },
	}],
	['[Yameii] The Angel Next Door Spoils Me Rotten - S02E08 [English Dub] [CR WEB-DL 1080p H264 AAC] [75BB90C4] (Otonari no Tenshi-sama ni Itsunomanika Dame Ningen ni Sareteita Ken 2 - Season 2 - S2)', {
		group: 'Yameii', englishTitle: angelEn, romajiTitle: angelRo, season: 2, episode: '08', version: undefined, episodeTitle: undefined, batch: false, resolution: '1080p', crc32: '75BB90C4',
		tags: { source: 'cr', sourceType: 'web-dl', videoCodec: 'h264', audioCodec: 'aac', audioLanguages: 'english-dub' },
	}],
	['[AnoZu] The Angel Next Door Spoils Me Rotten S02E08 1080p CR WEB-DL Dual-Audio DDP 2.0 H.264 - Otonari no Tenshi-sama ni Itsunomanika Dame Ningen ni Sareteita Ken 2', {
		group: 'AnoZu', englishTitle: angelEn, romajiTitle: angelRo, season: 2, episode: '08', version: undefined, episodeTitle: undefined, batch: false, resolution: '1080p', crc32: undefined,
		tags: { source: 'cr', sourceType: 'web-dl', videoCodec: 'h264', audioCodec: 'ddp2.0', audioLanguages: 'dual' },
	}],
	['[SubsPlease] Otonari no Tenshi-sama ni Itsunomanika Dame Ningen ni Sareteita Ken S2 - 12 (1080p) [1C882FDF].mkv', {
		group: 'SubsPlease', englishTitle: undefined, romajiTitle: angelRo, season: 2, episode: '12', version: undefined, episodeTitle: undefined, batch: false, resolution: '1080p', crc32: '1C882FDF',
		tags: {},
	}],
	['[SubsPlease] Otonari no Tenshi-sama ni Itsunomanika Dame Ningen ni Sareteita Ken (01-12) (1080p) [Batch]', {
		group: 'SubsPlease', englishTitle: undefined, romajiTitle: angelRo, season: undefined, episode: undefined, version: undefined, episodeTitle: undefined, batch: true, resolution: '1080p', crc32: undefined,
		tags: {},
	}],
	['[Erai-raws] Lord of Mysteries - 03 [1080p CR WEB-DL AVC AAC][MultiSub][ABCDEF12]', {
		group: 'Erai-raws', englishTitle: undefined, romajiTitle: undefined, season: undefined, episode: undefined, version: undefined, episodeTitle: undefined, batch: false, resolution: '1080p', crc32: 'ABCDEF12',
		tags: { source: 'cr', sourceType: 'web-dl', videoCodec: 'h264', audioCodec: 'aac', subtitles: 'multi' },
	}],
]

for (const [title, expected] of cases) {
	test(`parseReleaseTitle: ${title}`, () => {
		assert.deepEqual(parseReleaseTitle(title), expected)
	})
}

test('parseReleaseTitle leaves unknown layouts to the generic normalization', () => {
	assert.equal(parseReleaseTitle('[HorribleSubs] Ongaku Shoujo - 12 [1080p].mkv'), undefined)
	assert.equal(parseReleaseTitle('[ToonsHub] Even the Student Council Has Its Holes [1080p]'), undefined)
})

test('a colon written as a hyphen does not split the romaji title', () => {
	const first = parseReleaseTitle('[ToonsHub] Magical Girl Raising Project Restart S01E02 1080p AMZN WEB-DL DDP2.0 H.264 (Mahou Shoujo Ikusei Keikaku restart, Multi-Subs)')
	const third = parseReleaseTitle('[ToonsHub] Magical Girl Raising Project Restart S01E03 1080p AMZN WEB-DL DDP2.0 H.264 (Mahou Shoujo Ikusei Keikaku- restart, Multi-Subs)')
	assert.equal(third?.romajiTitle, first?.romajiTitle)
	assert.equal(parseReleaseTitle('[ToonsHub] Magical Girl Raising Project Restart S01E01 1080p UNEXT WEB-DL AAC2.0 H.264 (Mahou Shoujo Ikusei Keikaku restart, Multi-Subs)')?.tags.source, 'unext')
})

test('releaseIdentityTitle appends the season from S02 on', () => {
	const angel = parseReleaseTitle(cases[2]![0])!
	assert.equal(releaseIdentityTitle(angel, 'english'), `${angelEn} S02`)
	assert.equal(releaseIdentityTitle(angel, 'romaji'), `${angelRo} S02`)
	assert.equal(releaseIdentityTitle(parseReleaseTitle(cases[0]![0])!, 'english'), seitokaiEn)
	assert.equal(releaseIdentityTitle(parseReleaseTitle(cases[9]![0])!, 'english'), undefined)
})

test('parseReleaseTags tells dual/multi audio apart from multi subtitles', () => {
	assert.deepEqual(parseReleaseTags('1080p CR WEB-DL DUAL AAC2.0 H.264 Dual-Audio, Multi-Subs'), { source: 'cr', sourceType: 'web-dl', videoCodec: 'h264', audioCodec: 'aac2.0', audioLanguages: 'dual', subtitles: 'multi' })
	assert.deepEqual(parseReleaseTags('Multi-Subs English-Sub'), { subtitles: 'multi' })
	assert.deepEqual(parseReleaseTags('ESub OV'), { source: 'ov', subtitles: 'english' })
})
