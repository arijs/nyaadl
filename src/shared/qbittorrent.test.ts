import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isQbittorrentAddSuccess } from './qbittorrent.js'

test('isQbittorrentAddSuccess accepts legacy plain-text and 5.2+ JSON responses', () => {
	assert.equal(isQbittorrentAddSuccess('Ok.'), true)
	assert.equal(isQbittorrentAddSuccess(' Ok.\n'), true)
	assert.equal(isQbittorrentAddSuccess('Fails.'), false)
	assert.equal(isQbittorrentAddSuccess(''), false)
	assert.equal(isQbittorrentAddSuccess(undefined), false)
	assert.equal(isQbittorrentAddSuccess('{not json'), false)
	assert.equal(isQbittorrentAddSuccess('{"added_torrent_ids":["963b28bc4af7326f5d72f0033c98a3bdccbe2ed9"],"failure_count":0,"pending_count":0,"success_count":1}'), true)
	assert.equal(isQbittorrentAddSuccess('{"added_torrent_ids":[],"failure_count":0,"pending_count":1,"success_count":0}'), true)
	assert.equal(isQbittorrentAddSuccess('{"added_torrent_ids":[],"failure_count":1,"pending_count":0,"success_count":0}'), false)
})
