import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildTorrentMatchResult, isTorrentBlacklisted, matchTorrentToWatchTargets } from './matchingService.js'
import { buildWatchTarget } from './watchlistService.js'

test('isTorrentBlacklisted matches fallback candidate keys at the same resolution', () => {
	const matchResult = buildTorrentMatchResult({
		title: '[Erai-raws] Meitantei Precure - 01 ~ 10 [1080p CR WEB-DL AVC AAC][MultiSub]',
		videoNames: [
			'[Erai-raws] Meitantei Precure - 01 [1080p CR WEB-DL AVC AAC][MultiSub][43C3D91A].mkv',
		],
	}, {})

	assert.equal(isTorrentBlacklisted(matchResult, ['meitantei precure::1080p']), true)
})

test('isTorrentBlacklisted keeps resolution-specific blacklist entries scoped', () => {
	const matchResult = buildTorrentMatchResult({
		title: '[Erai-raws] Meitantei Precure - 01 ~ 10 [720p CR WEB-DL AVC AAC][MultiSub]',
		videoNames: [
			'[Erai-raws] Meitantei Precure - 01 [720p CR WEB-DL AVC AAC][MultiSub][43C3D91A].mkv',
		],
	}, {})

	assert.equal(isTorrentBlacklisted(matchResult, ['meitantei precure::1080p']), false)
})
const folders = [
	'[ToonsHub] Even the Student Council Has Its Holes [1080p]',
	'[ToonsHub] Ibitte Konai Gibo to Gishi [1080p]',
	'[denisplay] Seitokai ni mo Ana wa Aru! [480p] [AV1] (Even the Student Council Has Its Holes) (Uncensored)',
	'[denisplay] Seitokai ni mo Ana wa Aru! [720p] [AV1] (Even the Student Council Has Its Holes) (Uncensored)',
	'[Varyg] Kakushite Makina-san [1080p]',
	'[Erai-raws] Lord of Mysteries [1080p]',
]
const targets = folders.map((folderName) => buildWatchTarget(`Q:/${folderName}`, folderName, {}))

function targetOf(title: string): string | undefined {
	return matchTorrentToWatchTargets(buildTorrentMatchResult({ title, videoNames: [] }, {}), targets)?.folderName
}

test('a parsed release matches the folder of its group named after either title', () => {
	assert.equal(targetOf('[ToonsHub] Even the Student Council Has Its Holes S01E05 1080p BILI WEB-DL AAC2.0 H.265 (Seitokai ni mo Ana wa Aru!, Multi-Subs)'), folders[0])
	assert.equal(targetOf('[ToonsHub] My Stepmother and Stepsisters Arent Wicked S01E12 1080p AMZN WEB-DL DDP2.0 H.264 (Ibitte Konai Gibo to Gishi, Multi-Subs)'), folders[1])
	assert.equal(targetOf('[denisplay] Seitokai ni mo Ana wa Aru! - 05 [480p] [AV1] (Even the Student Council Has Its Holes) (Uncensored)'), folders[2])
	assert.equal(targetOf('[denisplay] Seitokai ni mo Ana wa Aru! - 05 [720p] [AV1] (Even the Student Council Has Its Holes) (Uncensored) V2'), folders[3])
})

test('a parsed release does not match the folder of another group or resolution', () => {
	assert.equal(targetOf('[Judas] Seitokai ni mo Ana wa Aru! {Even the Student Council Has Its Holes) [Uncensored] - S01E05 [1080p][HEVC x265 10bit][Multi-Subs] (Weekly)'), undefined)
	assert.equal(targetOf('Even the Student Council Has Its Holes S01E05 Some Title 1080p ADN WEB-DL AAC2.0 H.264-VARYG (Seitokai ni mo Ana wa Aru!, Multi-Subs)'), undefined)
	assert.equal(targetOf('[denisplay] Seitokai ni mo Ana wa Aru! - 05 [1080p] [AV1] (Even the Student Council Has Its Holes) (Uncensored)'), undefined)
	assert.equal(targetOf('[Erai-raws] Lord of Mysteries - 04 [1080p CR WEB-DL AVC AAC][MultiSub]'), folders[5])
})

test('a variant blacklist entry blocks only the releases carrying all of its tags', () => {
	const bili = buildTorrentMatchResult({ title: '[ToonsHub] Even the Student Council Has Its Holes S01E05 1080p BILI WEB-DL AAC2.0 H.265 (Seitokai ni mo Ana wa Aru!, Multi-Subs)', videoNames: [] }, {})
	const adn = buildTorrentMatchResult({ title: '[ToonsHub] Even the Student Council Has Its Holes S01E05 1080p UNCENSORED ADN WEB-DL AAC2.0 H.264 (Seitokai ni mo Ana wa Aru!, Multi-Subs)', videoNames: [] }, {})
	const series = '[toonshub] even the student council has its holes::1080p'
	assert.equal(isTorrentBlacklisted(bili, [`${series}::source=bili`]), true)
	assert.equal(isTorrentBlacklisted(adn, [`${series}::source=bili`]), false)
	assert.equal(isTorrentBlacklisted(bili, [`${series}::source=bili;videoCodec=h264`]), false)
	assert.equal(isTorrentBlacklisted(adn, [series]), true)
	assert.equal(isTorrentBlacklisted(adn, ['[varyg] even the student council has its holes::1080p']), false)
})
