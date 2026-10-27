import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DecisionRecord, PendingItem } from '@shared/types'
import { resetTorrentToPending } from './stateService.js'

function decision(torrentId: string, status: DecisionRecord['status']): DecisionRecord {
	return {
		torrentId,
		status,
		reason: status,
		createdAtUtc: '2026-10-01T00:00:00.000Z',
		item: {
			torrentId,
			title: `Title ${torrentId}`,
			viewUrl: `https://nyaa.si/view/${torrentId}`,
			downloadUrl: `https://nyaa.si/download/${torrentId}.torrent`,
			page: 1,
			seriesBaseRaw: 'Some Series',
			resolution: '1080p',
			matchCandidates: [],
		},
	}
}

test('resetTorrentToPending drops every decision of the torrent and queues it again as pending', () => {
	const decisions = [decision('1', 'pending'), decision('2', 'blocked'), decision('1', 'approved')]
	const pending: PendingItem[] = []
	const result = resetTorrentToPending(decisions, pending, '1', '2026-10-27T00:00:00.000Z')

	assert.deepEqual(result?.removed.map((record) => record.status), ['pending', 'approved'])
	assert.deepEqual(decisions.map((record) => [record.torrentId, record.status]), [['2', 'blocked'], ['1', 'pending']])
	assert.equal(decisions[1]!.createdAtUtc, '2026-10-27T00:00:00.000Z')
	assert.deepEqual(pending.map((item) => [item.torrentId, item.status]), [['1', 'pending']])
})

test('resetTorrentToPending replaces an existing queue entry instead of duplicating it', () => {
	const decisions = [decision('1', 'pending')]
	const pending: PendingItem[] = [{ torrentId: '1', status: 'pending', reason: 'old', item: decision('1', 'pending').item }]
	resetTorrentToPending(decisions, pending, '1')
	assert.equal(pending.length, 1)
	assert.equal(decisions.length, 1)
})

test('resetTorrentToPending returns undefined for a torrent without history', () => {
	const decisions = [decision('1', 'skipped')]
	assert.equal(resetTorrentToPending(decisions, [], '9'), undefined)
	assert.equal(decisions.length, 1)
})
