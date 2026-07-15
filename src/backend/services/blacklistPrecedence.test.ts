import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { WatchTarget } from '@shared/types'
import { classifyTorrentDecision } from './nyaaTorrentService.js'
import { buildTorrentMatchResult, isTorrentBlacklisted } from './matchingService.js'

const watchTarget: WatchTarget = {
	folderName: 'Grand Blue Season 3 [1080p]',
	folderPath: 'Q:/anime/Grand Blue Season 3 [1080p]',
	seriesKey: 'grand blue season 3',
	resolution: '1080p',
	normalizedKey: 'grand blue season 3::1080p',
	matchCandidates: ['grand blue season 3'],
}

// Regression for torrent 2132102: a blacklisted series+resolution must be blocked even when a
// matching watch target exists, otherwise future 1080p episodes keep auto-downloading (R2).
test('blacklist hit wins over a matching watch target', () => {
	const decision = classifyTorrentDecision(true, watchTarget, undefined, undefined)
	assert.equal(decision.status, 'blocked')
})

test('without blacklist hit a matching watch target still auto-downloads', () => {
	const decision = classifyTorrentDecision(false, watchTarget, undefined, undefined)
	assert.equal(decision.status, 'auto_downloaded')
})

test('local exact/conflict matches are preserved when not blacklisted', () => {
	assert.equal(classifyTorrentDecision(false, watchTarget, 'exact', 'file exists').status, 'already_downloaded')
	assert.equal(classifyTorrentDecision(false, watchTarget, 'conflict', 'size differs').status, 'pending')
})

test('no watch target and no blacklist stays pending', () => {
	assert.equal(classifyTorrentDecision(false, undefined, undefined, undefined).status, 'pending')
})

// The blacklist key from the incident blocks 1080p but leaves 480p/720p untouched.
test('Grand Blue 1080p block is scoped to 1080p', () => {
	const blacklist = ['grand blue season 3::1080p']
	const torrent1080 = buildTorrentMatchResult({
		title: '[Erai-raws] Grand Blue Season 3 - 03 [1080p CR WEB-DL AVC AAC][MultiSub]',
		videoNames: ['[Erai-raws] Grand Blue Season 3 - 03 [1080p CR WEB-DL AVC AAC][MultiSub][8007EEDE].mkv'],
	}, {})
	const torrent720 = buildTorrentMatchResult({
		title: '[Erai-raws] Grand Blue Season 3 - 03 [720p CR WEB-DL AVC AAC][MultiSub]',
		videoNames: ['[Erai-raws] Grand Blue Season 3 - 03 [720p CR WEB-DL AVC AAC][MultiSub][8007EEDE].mkv'],
	}, {})
	assert.equal(isTorrentBlacklisted(torrent1080, blacklist), true)
	assert.equal(isTorrentBlacklisted(torrent720, blacklist), false)
})
