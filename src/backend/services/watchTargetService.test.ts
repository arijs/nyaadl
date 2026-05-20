import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { WatchTarget } from '@shared/types'
import { buildWatchTargetPage } from './watchTargetService.js'

function target(overrides: Partial<WatchTarget> & Pick<WatchTarget, 'folderName' | 'folderPath' | 'seriesKey' | 'resolution' | 'normalizedKey'>): WatchTarget {
	return {
		folderName: overrides.folderName,
		folderPath: overrides.folderPath,
		seriesKey: overrides.seriesKey,
		resolution: overrides.resolution,
		normalizedKey: overrides.normalizedKey,
		matchCandidates: overrides.matchCandidates ?? [],
	}
}

test('buildWatchTargetPage filters, counts, and paginates watch targets in the backend', () => {
	const page = buildWatchTargetPage([
		target({ folderName: 'Alpha', folderPath: 'Q:/Alpha', seriesKey: 'alpha', resolution: '1080p', normalizedKey: 'alpha::1080p' }),
		target({ folderName: 'Beta', folderPath: 'Q:/Beta', seriesKey: 'beta', resolution: '720p', normalizedKey: 'beta::720p' }),
		target({ folderName: 'Gamma', folderPath: 'Q:/Gamma', seriesKey: 'gamma', resolution: '1080p', normalizedKey: 'gamma::1080p' }),
	], ['Q:/'], {
		page: 1,
		pageSize: 1,
		query: 'a',
		resolutionFilter: '1080p',
	})

	assert.equal(page.totalItems, 2)
	assert.equal(page.totalPages, 2)
	assert.deepEqual(page.resolutionCounts, {
		'1080p': 2,
		'720p': 1,
	})
	assert.deepEqual(page.resolutionOptions, ['all', '1080p', '720p'])
	assert.equal(page.items.length, 1)
	assert.equal(page.items[0]?.target.folderName, 'Alpha')
	assert.equal(page.items[0]?.rootName, 'Q:/')
})