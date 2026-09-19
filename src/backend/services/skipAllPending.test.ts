import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PendingItem } from '@shared/types'
import { buildSkippedDecisions } from './stateService.js'

function pending(torrentId: string): PendingItem {
	return {
		torrentId,
		status: 'pending',
		reason: 'no matching watch target',
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

test('buildSkippedDecisions turns every pending item into a skipped decision and empties the queue', () => {
	const queue = [pending('1'), pending('2'), pending('3')]
	const skipped = buildSkippedDecisions(queue.splice(0), '2026-09-17T00:00:00.000Z')
	assert.equal(queue.length, 0)
	assert.deepEqual(skipped.map((d) => d.torrentId), ['1', '2', '3'])
	for (const decision of skipped) {
		assert.equal(decision.status, 'skipped')
		assert.equal(decision.reason, 'skipped by user')
		assert.equal(decision.createdAtUtc, '2026-09-17T00:00:00.000Z')
		assert.equal(decision.item.title, `Title ${decision.torrentId}`)
	}
})

test('buildSkippedDecisions with an empty queue produces no decisions', () => {
	assert.deepEqual(buildSkippedDecisions([]), [])
})
