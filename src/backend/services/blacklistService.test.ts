import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildBlacklistPage } from './blacklistService.js'

test('buildBlacklistPage filters, counts, and paginates blacklist entries in the backend', () => {
	const page = buildBlacklistPage([
		'alpha::1080p',
		'beta::720p',
		'gamma::1080p',
	], {
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
	assert.equal(page.items[0]?.seriesKey, 'alpha')
	assert.equal(page.items[0]?.resolution, '1080p')
})