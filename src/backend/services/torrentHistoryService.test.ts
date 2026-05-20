import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DecisionRecord, TorrentItem } from '@shared/types'
import { buildTorrentHistoryPage } from './torrentHistoryService.js'

type DecisionFixture = Pick<DecisionRecord, 'torrentId' | 'status' | 'reason' | 'createdAtUtc'> & { item?: Partial<TorrentItem> }

function decision(overrides: DecisionFixture): DecisionRecord {
	const item = overrides.item ?? {} as Partial<TorrentItem>
	return {
		torrentId: overrides.torrentId,
		status: overrides.status,
		reason: overrides.reason,
		createdAtUtc: overrides.createdAtUtc,
		item: {
			torrentId: overrides.torrentId,
			title: item.title ?? overrides.torrentId,
			viewUrl: item.viewUrl ?? 'https://example.invalid/view',
			downloadUrl: item.downloadUrl ?? 'https://example.invalid/download',
			page: item.page ?? 1,
			seriesBaseRaw: item.seriesBaseRaw ?? 'Series',
			resolution: item.resolution ?? '1080p',
			matchCandidates: item.matchCandidates ?? [],
			publishedAtUtc: item.publishedAtUtc,
			sizeText: item.sizeText,
			seeders: item.seeders,
			leechers: item.leechers,
			downloads: item.downloads,
		},
	}
}

test('buildTorrentHistoryPage filters, counts, and paginates in the backend', () => {
	const page = buildTorrentHistoryPage([
		decision({ torrentId: 'a', status: 'auto_downloaded', reason: 'auto', createdAtUtc: '2026-05-19T00:00:00.000Z', item: { title: 'Alpha', page: 1, seriesBaseRaw: 'Series A', resolution: '1080p' } }),
		decision({ torrentId: 'b', status: 'blocked', reason: 'blocked', createdAtUtc: '2026-05-18T00:00:00.000Z', item: { title: 'Beta', page: 2, seriesBaseRaw: 'Series B', resolution: '720p' } }),
		decision({ torrentId: 'c', status: 'pending', reason: 'pending', createdAtUtc: '2026-05-18T00:00:00.000Z', item: { title: 'Gamma', page: 3, seriesBaseRaw: 'Series A', resolution: '1080p' } }),
	], {
		page: 1,
		pageSize: 1,
		fromDate: '2026-05-18',
		toDate: '2026-05-19',
		titleQuery: 'a',
		excludeTitleQuery: 'beta',
		resolutionFilter: '1080p',
	})

	assert.equal(page.totalItems, 2)
	assert.equal(page.totalPages, 2)
	assert.deepEqual(page.counts, {
		all: 2,
		auto_downloaded: 1,
		already_downloaded: 0,
		blocked: 0,
		pending: 1,
		approved: 0,
		skipped: 0,
	})
	assert.deepEqual(page.resolutionOptions, ['all', '1080p', '720p'])
	assert.equal(page.items.length, 1)
	assert.equal(page.items[0]?.torrentId, 'a')
})