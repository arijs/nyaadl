import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildBlacklistKey, buildBlacklistPage, parseBlacklistEntry, sanitizeBlacklistTags } from './blacklistService.js'

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
test('variant blacklist keys round-trip: series, resolution and sorted tags', () => {
	const key = buildBlacklistKey('[toonshub] even the student council has its holes', '1080P', { videoCodec: 'h265', source: 'bili' })
	assert.equal(key, '[toonshub] even the student council has its holes::1080p::source=bili;videoCodec=h265')
	assert.deepEqual(parseBlacklistEntry(key), {
		key,
		seriesKey: '[toonshub] even the student council has its holes',
		resolution: '1080p',
		tags: { source: 'bili', videoCodec: 'h265' },
	})
	assert.deepEqual(parseBlacklistEntry('grand blue season 3::1080p'), { key: 'grand blue season 3::1080p', seriesKey: 'grand blue season 3', resolution: '1080p' })
	assert.equal(buildBlacklistKey('grand blue season 3', '1080p'), 'grand blue season 3::1080p')
})

test('sanitizeBlacklistTags keeps only known tags with plain values', () => {
	assert.deepEqual(sanitizeBlacklistTags({ source: 'bili', subtitles: 'English', group: 'x', videoCodec: 'h265;x=y', audioCodec: 2 }), { source: 'bili' })
	assert.deepEqual(sanitizeBlacklistTags(undefined), {})
})
