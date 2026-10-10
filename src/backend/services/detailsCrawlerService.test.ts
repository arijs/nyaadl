import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { WatchTargetFile } from '@shared/api'
import type { WatchTarget } from '@shared/types'
import {
	crawlIntervalMs,
	crawlTarget,
	createCrawlerStatus,
	orderCrawlTargets,
	pickFolderTorrentId,
	runCrawlLoop,
	seasonOrder,
	type CrawlDeps,
	type CrawlTargetResult,
} from './detailsCrawlerService'
import { EraiRawsAuthError } from './eraiRawsService'

function target(root: string, folderName: string): WatchTarget {
	return { folderName, folderPath: `${root}\\${folderName}`, seriesKey: folderName, resolution: '480p', normalizedKey: folderName, matchCandidates: [folderName] }
}

test('seasonOrder puts newer "YYYY.N" season roots first and other folders last', () => {
	assert.ok(seasonOrder('Q:\\2026.4 Outono') > seasonOrder('Q:\\2026.1 Inverno'))
	assert.ok(seasonOrder('Q:\\2026.1 Inverno') > seasonOrder('Q:\\2025.2 Primavera'))
	assert.equal(seasonOrder('Q:\\Movies'), Number.NEGATIVE_INFINITY)
})

test('orderCrawlTargets walks the newest season first, targets alphabetically inside each one', () => {
	const roots = ['Q:\\2025.2 Primavera', 'Q:\\Movies', 'Q:\\2026.4 Outono', 'Q:\\2026.1 Inverno']
	const targets = [
		target('Q:\\2025.2 Primavera', '[Erai-raws] aiomodarkelf [480p]'),
		target('Q:\\2026.1 Inverno', '[Erai-raws] 29_sai Dokushin [480p]'),
		target('Q:\\Movies', 'Some Movie'),
		target('Q:\\2026.4 Outono', '[Erai-raws] Magical Explorer [480p]'),
		target('Q:\\2026.4 Outono', '[Erai-raws] Ao Ashi Season 2 [480p]'),
	]
	assert.deepEqual(orderCrawlTargets(targets, roots).map(({ rootName, target: t }) => `${rootName} / ${t.folderName}`), [
		'2026.4 Outono / [Erai-raws] Ao Ashi Season 2 [480p]',
		'2026.4 Outono / [Erai-raws] Magical Explorer [480p]',
		'2026.1 Inverno / [Erai-raws] 29_sai Dokushin [480p]',
		'2025.2 Primavera / [Erai-raws] aiomodarkelf [480p]',
		'Movies / Some Movie',
	])
})

const eraiInfo = 'https://www.erai-raws.info/anime-list/magical-explorer/'
const malLink = { label: 'MAL', url: 'https://myanimelist.net/anime/59999/Magical_Explorer' }
const anidbLink = { label: 'AniDB', url: 'https://anidb.net/anime/19999' }

// Everything saved by default; overrides make parts of it missing. `calls` records what hit the "network".
function fakeDeps(overrides: Partial<CrawlDeps> = {}): CrawlDeps & { calls: string[] } {
	const calls: string[] = []
	const files: WatchTargetFile[] = [
		{ name: 'ep 01.mkv', comboKey: 'cr|none|true' },
		{ name: 'ep 02.mkv', comboKey: 'cr|none|true', torrent: { torrentId: '2169231', status: 'approved', item: {} as never } },
	]
	return {
		calls,
		listFiles: async () => files,
		findIndexedNyaaId: (filePath) => (filePath.endsWith('ep 01.mkv') ? '2169226' : undefined),
		findFolderTorrents: () => [],
		processedAtUtc: () => undefined,
		hasNyaaDetail: async () => true,
		getNyaaDetail: async (torrentId) => {
			calls.push(`nyaa:${torrentId}`)
			return { information: eraiInfo }
		},
		savedSeriesSources: async () => ['erai', 'erai-releases', 'mal', 'anidb'],
		readEraiSeries: async () => ({ links: [malLink, anidbLink] }),
		getEraiSeries: async (slug) => calls.push(`erai:${slug}`),
		getMalDetails: async (slug) => calls.push(`mal:${slug}`),
		getAnidbDetails: async (slug) => calls.push(`anidb:${slug}`),
		...overrides,
	}
}

test('crawlTarget uses the first file with a torrent id and skips what is already saved', async () => {
	const deps = fakeDeps()
	const result = await crawlTarget(target('Q:\\2026.4 Outono', 'Magical Explorer [480p]'), deps, { anidbEnabled: true })
	assert.equal(result.torrentId, '2169226') // ep 01, found through the qBittorrent index
	assert.equal(result.slug, 'magical-explorer')
	assert.deepEqual(result.steps, { nyaa: 'cached', erai: 'cached', mal: 'cached', anidb: 'cached' })
	assert.equal(result.usedNetwork, false)
	assert.deepEqual(deps.calls, ['nyaa:2169226']) // the saved Nyaa file is read, nothing else
})

test('crawlTarget fetches what is missing and marks the target as having used the network', async () => {
	const deps = fakeDeps({ hasNyaaDetail: async () => false, savedSeriesSources: async () => [] })
	const result = await crawlTarget(target('Q:\\x', 'Magical Explorer [480p]'), deps, { anidbEnabled: true })
	assert.deepEqual(result.steps, { nyaa: 'fetched', erai: 'fetched', mal: 'fetched', anidb: 'fetched' })
	assert.equal(result.usedNetwork, true)
	assert.deepEqual(deps.calls, ['nyaa:2169226', 'erai:magical-explorer', 'mal:magical-explorer', 'anidb:magical-explorer'])
})

test('crawlTarget does not call MAL/AniDB when the Erai page has no link for them', async () => {
	const deps = fakeDeps({ savedSeriesSources: async () => ['erai', 'erai-releases'], readEraiSeries: async () => ({ links: [] }) })
	const result = await crawlTarget(target('Q:\\x', 'No links [480p]'), deps, { anidbEnabled: true })
	assert.deepEqual(result.steps, { nyaa: 'cached', erai: 'cached', mal: 'no-link', anidb: 'no-link' })
	assert.equal(result.usedNetwork, false)
	assert.deepEqual(deps.calls, ['nyaa:2169226'])
})

test('pickFolderTorrentId picks the lowest episode', () => {
	assert.equal(pickFolderTorrentId([
		{ torrentId: '2172038', name: '[Erai-raws] Romelia Senki - 02 [480p CR WEB-DL AVC AAC][MultiSub].mkv-2172038.torrent' },
		{ torrentId: '9', name: 'no episode here' },
		{ torrentId: '2169093', name: '[Erai-raws] Romelia Senki - 01 [480p CR WEB-DL AVC AAC][MultiSub].mkv-2169093.torrent' },
	]), '2169093')
	assert.equal(pickFolderTorrentId([]), undefined)
})

// Regression: "Romelia Senki [480p]" had its torrents sent to qBittorrent (added stopped) but no file on disk yet,
// so the crawler reported "no-torrent".
test('crawlTarget falls back to the torrents sent to the folder when it has no file yet', async () => {
	const deps = fakeDeps({
		listFiles: async () => [],
		findFolderTorrents: (folderPath) => (folderPath.endsWith('Romelia Senki [480p]')
			? [{ torrentId: '2172038', name: '[Erai-raws] Romelia Senki - 02 [480p CR WEB-DL AVC AAC][MultiSub].mkv' }, { torrentId: '2169093', name: '[Erai-raws] Romelia Senki - 01 [480p CR WEB-DL AVC AAC][MultiSub].mkv' }]
			: []),
	})
	const result = await crawlTarget(target('Q:\\2026.4 Outono', '[Erai-raws] Romelia Senki [480p]'), deps, { anidbEnabled: true })
	assert.equal(result.torrentId, '2169093')
	assert.equal(result.steps.nyaa, 'cached')
})

test('crawlTarget reports targets without a torrent id and Nyaa pages without an erai-raws link', async () => {
	const noTorrent = await crawlTarget(target('Q:\\x', 'Old [480p]'), fakeDeps({ listFiles: async () => [{ name: 'a.mkv', comboKey: 'k' }], findIndexedNyaaId: () => undefined }), { anidbEnabled: true })
	assert.equal(noTorrent.steps.nyaa, 'no-torrent')
	assert.equal(noTorrent.usedNetwork, false)

	const noSlug = await crawlTarget(target('Q:\\x', 'Other group [480p]'), fakeDeps({ getNyaaDetail: async () => ({ information: 'https://example.com/' }) }), { anidbEnabled: true })
	assert.deepEqual(noSlug.steps, { nyaa: 'cached', erai: 'no-link', mal: 'no-link', anidb: 'no-link' })
})

test('crawlTarget keeps an AniDB error to its own step and turns AniDB off for the run when banned', async () => {
	const options = { anidbEnabled: true }
	const deps = fakeDeps({
		savedSeriesSources: async () => ['erai', 'erai-releases'],
		getAnidbDetails: async () => {
			throw new Error('AniDB: Banned')
		},
	})
	const first = await crawlTarget(target('Q:\\x', 'A [480p]'), deps, options)
	assert.deepEqual(first.steps, { nyaa: 'cached', erai: 'cached', mal: 'fetched', anidb: 'error' })
	assert.deepEqual(first.errors, ['anidb: AniDB: Banned'])
	assert.equal(options.anidbEnabled, false)
	const second = await crawlTarget(target('Q:\\x', 'B [480p]'), deps, options)
	assert.equal(second.steps.anidb, 'skipped')
})

test('crawlTarget flags an expired erai-raws session as fatal', async () => {
	const deps = fakeDeps({
		savedSeriesSources: async () => [],
		getEraiSeries: async () => {
			throw new EraiRawsAuthError()
		},
	})
	const result = await crawlTarget(target('Q:\\x', 'A [480p]'), deps, { anidbEnabled: true })
	assert.equal(result.steps.erai, 'error')
	assert.equal(result.steps.mal, 'skipped')
	assert.match(result.fatal ?? '', /session/)
})

const ok = (usedNetwork: boolean): CrawlTargetResult => ({ steps: { nyaa: usedNetwork ? 'fetched' : 'cached', erai: 'cached', mal: 'cached', anidb: 'cached' }, errors: [], usedNetwork })

function fakeClock() {
	let time = 1_000_000
	const sleeps: number[] = []
	return {
		sleeps,
		now: () => time,
		sleep: async (ms: number) => {
			sleeps.push(ms)
			time += ms
		},
		advance: (ms: number) => {
			time += ms
		},
	}
}

test('runCrawlLoop waits only after targets that used the network, completing 3s from their start', async () => {
	const clock = fakeClock()
	const status = createCrawlerStatus()
	status.state = 'running'
	const usedNetwork = [true, false, true, true]
	const targets = usedNetwork.map((_, index) => ({ target: target('Q:\\2026.4 Outono', `T${index}`), rootName: '2026.4 Outono' }))
	let call = 0
	await runCrawlLoop(status, targets, {
		crawl: async () => {
			clock.advance(1000) // each target takes 1s
			return ok(usedNetwork[call++]!)
		},
		sleep: clock.sleep,
		now: clock.now,
	})
	// After T0 (network, 1s): wait 2s. After T1 (no network): none. After T2 (network): wait 2s.
	assert.deepEqual(clock.sleeps, [crawlIntervalMs - 1000, crawlIntervalMs - 1000])
	assert.equal(status.state, 'finished')
	assert.equal(status.position, 4)
	assert.equal(status.counts.nyaa.fetched, 3)
	assert.equal(status.counts.nyaa.cached, 1)
	assert.deepEqual(status.recent.map((entry) => entry.folderName), ['T3', 'T2', 'T1', 'T0'])
})

test('runCrawlLoop stops between targets when asked, and on a fatal error', async () => {
	const clock = fakeClock()
	const stopped = createCrawlerStatus()
	stopped.state = 'running'
	const targets = ['A', 'B', 'C'].map((name) => ({ target: target('Q:\\x', name), rootName: 'x' }))
	await runCrawlLoop(stopped, targets, {
		crawl: async () => {
			stopped.state = 'stopping' // the user clicks Stop while the first target runs
			return ok(false)
		},
		sleep: clock.sleep,
		now: clock.now,
	})
	assert.equal(stopped.state, 'stopped')
	assert.equal(stopped.stopReason, 'Stopped by the user')
	assert.equal(stopped.recent.length, 1)

	const fatal = createCrawlerStatus()
	fatal.state = 'running'
	await runCrawlLoop(fatal, targets, {
		crawl: async () => ({ ...ok(true), fatal: 'erai-raws session is missing or expired' }),
		sleep: clock.sleep,
		now: clock.now,
	})
	assert.equal(fatal.state, 'stopped')
	assert.equal(fatal.stopReason, 'erai-raws session is missing or expired')
	assert.equal(fatal.position, 1)
})
