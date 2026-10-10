import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import {
	applyLiveTorrents,
	createQbittorrentIndex,
	fetchNewTorrents,
	findIndexedTorrentByPath,
	loadQbittorrentIndex,
	saveQbittorrentIndex,
	toIndexedTorrent,
	upsertTorrent,
	type QbittorrentInfo,
} from './qbittorrentIndexService'

const file06 = 'Q:\\2025.2 Primavera\\[Erai-raws] aiomodarkelf [480p]\\[Erai-raws] aiomodarkelf - 06 [480p ADN WEB-DL AVC AAC][MultiSub][C6EAC20A].mkv'

function info(hash: string, contentPath: string, addedOn: number, fields: Partial<QbittorrentInfo> = {}): QbittorrentInfo {
	return { hash, name: path.win32.basename(contentPath), content_path: contentPath, state: 'stalledUP', progress: 1, size: 100, added_on: addedOn, ...fields }
}

test('the index finds a torrent by file path, ignoring case and slash direction, and follows moves', () => {
	const index = createQbittorrentIndex()
	upsertTorrent(index, toIndexedTorrent(info('aaa', file06, 1747254035, { comment: 'https://nyaa.si/view/1971457' })))
	const found = findIndexedTorrentByPath(index, file06.replace(/\\/g, '/').toUpperCase())
	assert.equal(found?.hash, 'aaa')
	assert.equal(found?.nyaaTorrentId, '1971457')

	assert.equal(upsertTorrent(index, toIndexedTorrent(info('aaa', 'Q:\\moved\\ep06.mkv', 1747254035))), true)
	assert.equal(findIndexedTorrentByPath(index, file06), undefined)
	assert.equal(findIndexedTorrentByPath(index, 'Q:\\moved\\ep06.mkv')?.hash, 'aaa')
	// Same data again: nothing changes, so nothing needs saving.
	assert.equal(upsertTorrent(index, toIndexedTorrent(info('aaa', 'Q:\\moved\\ep06.mkv', 1747254035))), false)
})

test('the index is saved as gzipped NDJSON (header + one row per torrent) and loads back', async () => {
	const dir = await mkdtemp(path.join(os.tmpdir(), 'nyaadl-qbindex-'))
	const filePath = path.join(dir, 'qbittorrent-index.jsonl.gz')
	const index = createQbittorrentIndex()
	index.fullSyncAt = '2026-10-10T19:00:00.000Z'
	upsertTorrent(index, toIndexedTorrent(info('aaa', file06, 1747254035, { comment: 'https://nyaa.si/view/1971457', size: 146890739 })))
	upsertTorrent(index, toIndexedTorrent(info('bbb', 'Q:\\other.mkv', 1700000000)))
	await saveQbittorrentIndex(index, filePath)

	const lines = gunzipSync(await readFile(filePath)).toString('utf8').trimEnd().split('\n')
	assert.equal(lines.length, 3)
	assert.deepEqual(JSON.parse(lines[0]!), { version: 1, fullSyncAt: '2026-10-10T19:00:00.000Z' })
	assert.deepEqual(JSON.parse(lines[1]!), ['aaa', file06, path.win32.basename(file06), '1971457', 1747254035, 146890739])
	assert.deepEqual(JSON.parse(lines[2]!), ['bbb', 'Q:\\other.mkv', 'other.mkv', null, 1700000000, 100])

	const loaded = await loadQbittorrentIndex(filePath)
	assert.equal(loaded.fullSyncAt, '2026-10-10T19:00:00.000Z')
	assert.equal(loaded.torrents.size, 2)
	assert.equal(findIndexedTorrentByPath(loaded, file06)?.size, 146890739)
	assert.equal(findIndexedTorrentByPath(loaded, 'Q:\\other.mkv')?.nyaaTorrentId, undefined)
})

test('loading a missing index file gives an empty index; a damaged one fails', async () => {
	const dir = await mkdtemp(path.join(os.tmpdir(), 'nyaadl-qbindex-'))
	assert.equal((await loadQbittorrentIndex(path.join(dir, 'missing.jsonl.gz'))).torrents.size, 0)
	const damaged = path.join(dir, 'damaged.jsonl.gz')
	await writeFile(damaged, 'not gzip')
	await assert.rejects(loadQbittorrentIndex(damaged))
})

test('fetchNewTorrents pages newest first and stops at the first torrent already indexed', async () => {
	const index = createQbittorrentIndex()
	upsertTorrent(index, toIndexedTorrent(info('old', 'Q:\\old.mkv', 100)))
	const newestFirst = [info('n3', 'Q:\\n3.mkv', 400), info('n2', 'Q:\\n2.mkv', 300), info('n1', 'Q:\\n1.mkv', 200), info('old', 'Q:\\old.mkv', 100), info('older', 'Q:\\older.mkv', 50)]
	const requested: number[] = []
	const added = await fetchNewTorrents(index, async (offset, limit) => {
		requested.push(offset)
		return newestFirst.slice(offset, offset + limit)
	}, 2)
	assert.equal(added, 3)
	assert.deepEqual(requested, [0, 2])
	assert.equal(findIndexedTorrentByPath(index, 'Q:\\n1.mkv')?.hash, 'n1')
	assert.equal(index.torrents.has('older'), false)
})

test('applyLiveTorrents removes torrents qBittorrent no longer returns and records moves', () => {
	const index = createQbittorrentIndex()
	upsertTorrent(index, toIndexedTorrent(info('kept', 'Q:\\kept.mkv', 1)))
	upsertTorrent(index, toIndexedTorrent(info('moved', 'Q:\\a\\moved.mkv', 1)))
	upsertTorrent(index, toIndexedTorrent(info('gone', 'Q:\\gone.mkv', 1)))
	const changed = applyLiveTorrents(index, ['kept', 'moved', 'gone'], [info('kept', 'Q:\\kept.mkv', 1), info('moved', 'Q:\\b\\moved.mkv', 1)])
	assert.equal(changed, true)
	assert.equal(index.torrents.has('gone'), false)
	assert.equal(findIndexedTorrentByPath(index, 'Q:\\b\\moved.mkv')?.hash, 'moved')
	assert.equal(applyLiveTorrents(index, ['kept'], [info('kept', 'Q:\\kept.mkv', 1)]), false)
})
