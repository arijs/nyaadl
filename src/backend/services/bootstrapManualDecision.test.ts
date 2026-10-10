import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { BootstrapAutoDecisionSummary, BootstrapDiscoveryResult, DecisionRecord, TorrentItem } from '@shared/types'
import { applyManualDecision, applyQbittorrentRecovery } from './bootstrapDiscoveryService'

function entry(torrentId: string, itemIndex: number): BootstrapAutoDecisionSummary {
	return { torrentId, title: `Title ${torrentId}`, status: 'pending', reason: 'needs review', page: 1, itemIndex }
}

function result(manual: BootstrapAutoDecisionSummary[]): BootstrapDiscoveryResult {
	return { startedAtUtc: '', finishedAtUtc: '', pagesScanned: 1, inspectedCount: manual.length, found: false, reason: '', manual }
}

test('applyManualDecision moves the resolved pending entry to the chosen status', () => {
	const scrape = result([entry('1', 0), entry('2', 1), entry('3', 2)])
	assert.equal(applyManualDecision(scrape, ['2'], 'approved'), true)
	assert.equal(applyManualDecision(scrape, ['1', '3'], 'skipped'), true)
	assert.deepEqual(scrape.manual?.map((e) => e.status), ['skipped', 'approved', 'skipped'])
})

test('applyManualDecision reports no change for items outside the last scrape', () => {
	const scrape = result([entry('1', 0)])
	assert.equal(applyManualDecision(scrape, ['99'], 'blocked'), false)
	assert.equal(applyManualDecision(undefined, ['1'], 'blocked'), false)
	assert.equal(applyManualDecision(result([]), ['1'], 'blocked'), false)
	assert.equal(scrape.manual?.[0]?.status, 'pending')
})

function decision(torrentId: string, status: DecisionRecord['status']): DecisionRecord {
	const item = { torrentId, title: `Title ${torrentId}`, page: 1 } as TorrentItem
	return { torrentId, status, reason: 'matched magical explorer::480p by title', createdAtUtc: '', item }
}

// Regression: after a successful retry, the torrent stayed under "qB failed" instead of "Auto approved".
test('applyQbittorrentRecovery moves a retried qB failure to auto approved, in page order', () => {
	const scrape = result([])
	scrape.qbFailed = [{ ...entry('2172211', 4), status: 'auto_downloaded' }]
	scrape.autoApproved = [{ ...entry('1', 2), status: 'auto_downloaded' }, { ...entry('2', 9), status: 'auto_downloaded' }]
	assert.equal(applyQbittorrentRecovery(scrape, decision('2172211', 'auto_downloaded'), 'Already in qBittorrent.'), true)
	assert.deepEqual(scrape.qbFailed, [])
	assert.deepEqual(scrape.autoApproved.map((e) => e.itemIndex), [2, 4, 9])
	assert.equal(scrape.autoApproved[1]?.qbResponseText, 'Already in qBittorrent.')
})

test('applyQbittorrentRecovery sends a manually approved qB failure to manual approved', () => {
	const scrape = result([])
	scrape.qbFailed = [{ ...entry('7', 1), status: 'approved' }]
	assert.equal(applyQbittorrentRecovery(scrape, decision('7', 'approved')), true)
	assert.deepEqual(scrape.manual?.map((e) => [e.torrentId, e.status]), [['7', 'approved']])
})

test('applyQbittorrentRecovery marks a pending manual entry approved when its qB submit is recovered', () => {
	const scrape = result([entry('8', 0)])
	assert.equal(applyQbittorrentRecovery(scrape, decision('8', 'approved')), true)
	assert.equal(scrape.manual?.[0]?.status, 'approved')
	assert.equal(applyQbittorrentRecovery(scrape, decision('99', 'approved')), false)
})
