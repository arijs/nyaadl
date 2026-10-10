import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { BootstrapAutoDecisionSummary, QbittorrentFailureItem, TorrentItem } from '@shared/types'
import { listUndecidedItem } from './bootstrapDiscoveryService'
import { pendingState, qbittorrentFailuresState } from './runtimeStateService'

function item(torrentId: string): TorrentItem {
	return {
		torrentId,
		title: `Title ${torrentId}`,
		viewUrl: `/view/${torrentId}`,
		downloadUrl: `/download/${torrentId}.torrent`,
		page: 1,
		seriesBaseRaw: 'magical explorer',
		resolution: '480p',
		matchCandidates: ['magical explorer'],
	}
}

function failure(torrentId: string): QbittorrentFailureItem {
	return {
		torrentId,
		createdAtUtc: '2026-10-10T17:41:32.472Z',
		source: 'bootstrap',
		decisionStatus: 'auto_downloaded',
		decisionReason: 'matched magical explorer::480p by title',
		item: item(torrentId),
		targetFolderPath: 'Q:\\target',
		torrentFilePath: 'D:\\torrent',
		torrentFilename: 'x.torrent',
		errorKind: 'timeout',
		errorMessage: 'Timed out while contacting qBittorrent.',
	}
}

// Regression: a torrent whose qBittorrent submit timed out has no decision, and the next scrape
// skipped it without listing it anywhere ("listed 74 of 75 page items").
test('listUndecidedItem lists a qBittorrent failure without a decision in qbFailed', (t) => {
	qbittorrentFailuresState.push(failure('2172211'))
	t.after(() => qbittorrentFailuresState.splice(0))
	const manual: BootstrapAutoDecisionSummary[] = []
	const qbFailed: BootstrapAutoDecisionSummary[] = []
	assert.equal(listUndecidedItem('2172211', 4, manual, qbFailed), true)
	assert.equal(manual.length, 0)
	assert.equal(qbFailed.length, 1)
	assert.equal(qbFailed[0]?.itemIndex, 4)
	assert.equal(qbFailed[0]?.status, 'auto_downloaded')
	assert.match(qbFailed[0]?.reason ?? '', /qBittorrent submit failed: Timed out/)
})

test('listUndecidedItem lists an item still in the pending queue as manual pending', (t) => {
	pendingState.push({ torrentId: '10', status: 'pending', reason: 'no watch target', item: item('10') })
	t.after(() => pendingState.splice(0))
	const manual: BootstrapAutoDecisionSummary[] = []
	const qbFailed: BootstrapAutoDecisionSummary[] = []
	assert.equal(listUndecidedItem('10', 0, manual, qbFailed), true)
	assert.equal(manual[0]?.status, 'pending')
	assert.equal(qbFailed.length, 0)
})

test('listUndecidedItem reports false for an unknown torrent', () => {
	assert.equal(listUndecidedItem('nope', 0, [], []), false)
})
