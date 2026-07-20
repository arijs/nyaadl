import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { WatchRootStatus } from '@shared/types'
import { buildWatchTargetsIssue } from './watchlistService.js'

function status(overrides: Partial<WatchRootStatus> & Pick<WatchRootStatus, 'path'>): WatchRootStatus {
	return {
		path: overrides.path,
		exists: overrides.exists ?? true,
		isDirectory: overrides.isDirectory ?? true,
		watchTargetsCount: overrides.watchTargetsCount ?? 0,
		issue: overrides.issue,
	}
}

test('buildWatchTargetsIssue reports no_roots_configured when nothing is configured', () => {
	const issue = buildWatchTargetsIssue([], [])
	assert.equal(issue.kind, 'no_roots_configured')
	assert.equal(issue.configuredRoots, 0)
	assert.deepEqual(issue.offlineRoots, [])
})

test('buildWatchTargetsIssue reports roots_offline and lists inaccessible roots (offline drive)', () => {
	const roots = ['Q:\\2026.2 Primavera', 'Q:\\2026.1 Inverno']
	const statuses = [
		status({ path: 'Q:\\2026.2 Primavera', exists: false, isDirectory: false }),
		status({ path: 'Q:\\2026.1 Inverno', exists: true, isDirectory: false }),
	]
	const issue = buildWatchTargetsIssue(roots, statuses)
	assert.equal(issue.kind, 'roots_offline')
	assert.equal(issue.configuredRoots, 2)
	assert.deepEqual(issue.offlineRoots, ['Q:\\2026.2 Primavera', 'Q:\\2026.1 Inverno'])
})

test('buildWatchTargetsIssue reports no_series_found when roots are accessible but empty', () => {
	const roots = ['Q:\\2026.2 Primavera']
	const statuses = [status({ path: 'Q:\\2026.2 Primavera', exists: true, isDirectory: true })]
	const issue = buildWatchTargetsIssue(roots, statuses)
	assert.equal(issue.kind, 'no_series_found')
	assert.equal(issue.configuredRoots, 1)
	assert.deepEqual(issue.offlineRoots, [])
})
