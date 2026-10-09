import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { DecisionRecord, PendingItem, TorrentItem } from '@shared/types'
import { backfillTorrentItems } from './decisionBackfillService'

function item(torrentId: string, fields: Partial<TorrentItem> = {}): TorrentItem {
	return {
		torrentId,
		title: `Title ${torrentId}`,
		viewUrl: `/view/${torrentId}`,
		downloadUrl: `/download/${torrentId}.torrent`,
		page: 1,
		seriesBaseRaw: 'series',
		resolution: '1080p',
		matchCandidates: [],
		...fields,
	}
}

function decision(torrentId: string, status: DecisionRecord['status'], fields: Partial<TorrentItem> = {}): DecisionRecord {
	return { torrentId, status, reason: 'r', createdAtUtc: '2026-06-01T00:00:00.000Z', item: item(torrentId, fields) }
}

const fresh = item('1', { category: 'Anime - English-translated', sizeText: '1.3 GiB', publishedAtUtc: '2026-05-31T00:00:00.000Z', seeders: 999 })

test('fills only missing listing fields on every decision of the torrent', () => {
	const decisions = [decision('1', 'pending', { seeders: 5 }), decision('2', 'blocked'), decision('1', 'approved', { sizeText: '1.2 GiB' })]
	const result = backfillTorrentItems([fresh], decisions, [])

	assert.deepEqual(result.decisions, [decisions[0], decisions[2]])
	assert.equal(decisions[0]!.item.category, 'Anime - English-translated')
	assert.equal(decisions[0]!.item.publishedAtUtc, '2026-05-31T00:00:00.000Z')
	assert.equal(decisions[0]!.item.seeders, 5, 'seeders is a snapshot of the decision and is never overwritten')
	assert.equal(decisions[2]!.item.sizeText, '1.2 GiB', 'an existing value is kept')
	assert.equal(decisions[1]!.item.category, undefined)
	assert.equal(result.pendingChanged, false)
})

test('a record that already has every field is not reported as changed', () => {
	const decisions = [decision('1', 'pending', { category: 'x', sizeText: 'y', publishedAtUtc: 'z' })]
	assert.deepEqual(backfillTorrentItems([fresh], decisions, []).decisions, [])
})

test('pending items are backfilled and flagged', () => {
	const pending: PendingItem[] = [{ torrentId: '1', status: 'pending', reason: 'r', item: item('1') }]
	assert.equal(backfillTorrentItems([fresh], [], pending).pendingChanged, true)
	assert.equal(pending[0]!.item.category, 'Anime - English-translated')
	assert.equal(backfillTorrentItems([fresh], [], pending).pendingChanged, false)
})
