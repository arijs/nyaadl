import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deriveSeriesBase, deriveFolderNameFromTitle, deriveFolderNamesByTitle, normalizeBlacklistKey } from './normalizeService.js'

test('deriveSeriesBase collapses labelled special episodes onto the base series key', () => {
	const titles = [
		'[Erai-raws] Lord of Mysteries - Special 03 (CA) [480p CR WEB-DL AVC AAC][MultiSub][77D5AF7A]',
		'[Erai-raws] Lord of Mysteries - Special 01 [1080p][MultiSub][AABBCCDD]',
		'[Erai-raws] Lord of Mysteries - OVA 02 (CA) [720p][MultiSub][ABCDEF12]',
		'[Erai-raws] Lord of Mysteries - 03 [1080p][MultiSub][ABCDEF12]',
		'[Erai-raws] Lord of Mysteries - 03v2 [1080p][ABCDEF12]',
	]
	for (const title of titles) {
		assert.equal(deriveSeriesBase(title), 'lord of mysteries', `failed for: ${title}`)
	}
})

test('deriveSeriesBase absorbs trailing finale and batch markers', () => {
	assert.equal(deriveSeriesBase('[Erai-raws] Kaiju No.8 - 12 END [1080p][ABCDEF12]'), 'kaiju no.8')
	assert.equal(deriveSeriesBase('[Erai-raws] Kaiju No.8 - 11 [1080p][ABCDEF12]'), 'kaiju no.8')
	assert.equal(deriveSeriesBase('[Erai-raws] Some Show - 13 FINAL [720p][ABCDEF12]'), 'some show')
	assert.equal(deriveSeriesBase('[Erai-raws] Some Show - 12 BATCH [1080p][ABCDEF12]'), 'some show')
})

test('deriveSeriesBase keeps real title words and high episode numbers intact', () => {
	// The episode number is stripped, not the title.
	assert.equal(deriveSeriesBase('[Erai-raws] One Piece - 1080 [1080p][AABBCCDD]'), 'one piece')
	// Multi-segment titles keep their inner words; only the trailing episode is removed.
	assert.equal(deriveSeriesBase('[Erai-raws] Dr. Stone - New World - 11 [1080p][12AB34CD]'), 'dr. stone-new world')
})

test('deriveFolderNameFromTitle lands specials in the same folder as regular episodes', () => {
	const special = deriveFolderNameFromTitle('[Erai-raws] Lord of Mysteries - Special 03 (CA) [480p CR WEB-DL AVC AAC][MultiSub][77D5AF7A]')
	const regular = deriveFolderNameFromTitle('[Erai-raws] Lord of Mysteries - 03 [1080p][MultiSub][ABCDEF12]')
	assert.equal(special.onlyRes, '[Erai-raws] Lord of Mysteries [480p]')
	assert.equal(regular.onlyRes, '[Erai-raws] Lord of Mysteries [1080p]')
})

test('deriveFolderNameFromTitle strips trailing finale markers from the folder name', () => {
	const folder = deriveFolderNameFromTitle('[Erai-raws] Kaiju No.8 - 12 END [1080p][ABCDEF12]')
	assert.equal(folder.onlyRes, '[Erai-raws] Kaiju No.8 [1080p]')
})

const toonsHubTitle = '[ToonsHub] Even the Student Council Has Its Holes S01E03 REPACK 1080p UNCENSORED ADN WEB-DL AAC2.0 H.264 (Seitokai ni mo Ana wa Aru!, Multi-Subs)'

test('parsed release groups get one series per group: "[group] english title", plus the season from S02 on', () => {
	assert.equal(deriveSeriesBase(toonsHubTitle), '[toonshub] even the student council has its holes')
	assert.equal(deriveSeriesBase('[ToonsHub] The Angel Next Door Spoils Me Rotten S02E08 1080p CR WEB-DL DUAL AAC2.0 H.264 (Otonari no Tenshi-sama ni Itsunomanika Dame Ningen ni Sareteita Ken, Dual-Audio, Multi-Subs)'), '[toonshub] the angel next door spoils me rotten s02')
	assert.equal(deriveSeriesBase('[Judas] Seitokai ni mo Ana wa Aru! {Even the Student Council Has Its Holes) [Uncensored] - S01E04 [1080p][HEVC x265 10bit][Multi-Subs] (Weekly)'), '[judas] even the student council has its holes')
	assert.equal(deriveSeriesBase('Even the Student Council Has Its Holes S01E04 Koki and the Light Music Club 1080p ADN WEB-DL AAC2.0 H.264-VARYG (Seitokai ni mo Ana wa Aru!, Multi-Subs, Uncensored)'), '[varyg] even the student council has its holes')
	assert.equal(deriveSeriesBase('[SubsPlease] Otonari no Tenshi-sama ni Itsunomanika Dame Ningen ni Sareteita Ken S2 - 12 (1080p) [1C882FDF].mkv'), '[subsplease] otonari no tenshi-sama ni itsunomanika dame ningen ni sareteita ken s02')
	// Normalized values are normalized again downstream (aliases, stored keys): the result must not change.
	assert.equal(deriveSeriesBase('[toonshub] even the student council has its holes'), '[toonshub] even the student council has its holes')
	assert.equal(deriveSeriesBase('[judas] seitokai ni mo ana wa aru! {even the student council has its holes) [uncensored] - s01e01 [][hevc x265 10bit][multi-subs] (weekly)'), '[judas] even the student council has its holes')
})

test('folders of parsed release groups reduce to "[group] title"; other folders keep the old rules', () => {
	assert.equal(deriveSeriesBase('[ToonsHub] Even the Student Council Has Its Holes [1080p]'), '[toonshub] even the student council has its holes')
	assert.equal(deriveSeriesBase('[ToonsHub] Ibitte Konai Gibo to Gishi [1080p]'), '[toonshub] ibitte konai gibo to gishi')
	assert.equal(deriveSeriesBase('[ToonsHub] Ao no Orchestra S02 [1080p AMZN WEB-DL JPN DDP2.0 H.264 MSubs]'), '[toonshub] ao no orchestra s02')
	assert.equal(deriveSeriesBase('[denisplay] Seitokai ni mo Ana wa Aru! [480p] [AV1] (Even the Student Council Has Its Holes) (Uncensored)'), '[denisplay] seitokai ni mo ana wa aru!')
	assert.equal(deriveSeriesBase('[Varyg] Kakushite Makina-san [1080p]'), '[varyg] kakushite makina-san')
	assert.equal(deriveSeriesBase('[Erai-raws] Lord of Mysteries [1080p]'), 'lord of mysteries')
})

test('deriveFolderNamesByTitle offers a folder name per title; deriveFolderNameFromTitle prefers the English one', () => {
	const title = '[ToonsHub] My Stepmother and Stepsisters Arent Wicked S01E12 1080p AMZN WEB-DL DDP2.0 H.264 (Ibitte Konai Gibo to Gishi, Multi-Subs)'
	const byTitle = deriveFolderNamesByTitle(title)
	assert.equal(byTitle.romaji?.onlyRes, '[ToonsHub] Ibitte Konai Gibo to Gishi [1080p]')
	assert.equal(byTitle.english?.onlyRes, '[ToonsHub] My Stepmother and Stepsisters Arent Wicked [1080p]')
	assert.equal(byTitle.english?.fullMeta, '[ToonsHub] My Stepmother and Stepsisters Arent Wicked [1080p AMZN WEB-DL H264 DDP2.0 MULTI]')
	assert.equal(deriveFolderNameFromTitle(toonsHubTitle).onlyRes, '[ToonsHub] Even the Student Council Has Its Holes [1080p]')
	assert.deepEqual(deriveFolderNamesByTitle('[Erai-raws] Lord of Mysteries - 03 [1080p][MultiSub][ABCDEF12]'), {})
})

test('normalizeBlacklistKey only trims and lowercases, so variant and bracketed keys survive load/save', () => {
	assert.equal(normalizeBlacklistKey(' [ToonsHub] Even the Student Council Has Its Holes::1080p::source=bili '), '[toonshub] even the student council has its holes::1080p::source=bili')
	assert.equal(normalizeBlacklistKey('[judas] seitokai - s01e01 [][hevc]::1080p'), '[judas] seitokai - s01e01 [][hevc]::1080p')
})
