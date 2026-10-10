import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { BootstrapAutoDecisionSummary, BootstrapDiscoveryResult } from '@shared/types'
import { applyManualDecision } from './bootstrapDiscoveryService'

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
