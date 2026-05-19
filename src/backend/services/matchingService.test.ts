import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildTorrentMatchResult, isTorrentBlacklisted } from './matchingService.js'

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