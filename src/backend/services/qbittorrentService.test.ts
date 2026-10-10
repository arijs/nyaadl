import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { QBITTORRENT_ALREADY_PRESENT } from '@shared/qbittorrent'
import { addTorrentToQbittorrent, QbittorrentRequestError } from './qbittorrentService'

// Smallest valid single-file torrent; its info hash is the SHA-1 of the bencoded info dict.
const info = Buffer.concat([Buffer.from('d6:lengthi1e4:name5:a.mkv12:piece lengthi16384e6:pieces20:'), Buffer.alloc(20), Buffer.from('e')])
const infoHash = createHash('sha1').update(info).digest('hex')

async function torrentFile(): Promise<string> {
	const dir = await mkdtemp(path.join(os.tmpdir(), 'nyaadl-qb-'))
	const filePath = path.join(dir, 'a.torrent')
	await writeFile(filePath, Buffer.concat([Buffer.from('d4:info'), info, Buffer.from('e')]))
	return filePath
}

// Answers torrents/add with 409 Conflict and torrents/info with the given list; records the URLs it saw.
function mockQbittorrent(t: { after: (fn: () => void) => void }, torrentsInfo: unknown[]): string[] {
	const urls: string[] = []
	const originalFetch = globalThis.fetch
	globalThis.fetch = (async (input: string | URL | Request) => {
		const url = String(input)
		urls.push(url)
		if (url.includes('/api/v2/torrents/add')) {
			return new Response('Conflict', { status: 409, statusText: 'Conflict' })
		}
		return Response.json(torrentsInfo)
	}) as typeof fetch
	t.after(() => {
		globalThis.fetch = originalFetch
	})
	return urls
}

// Regression: retrying a torrent already in qBittorrent failed with "409 Conflict" and stayed in the failures list.
test('addTorrentToQbittorrent treats a 409 for a torrent already in qBittorrent as added', async (t) => {
	const urls = mockQbittorrent(t, [{ hash: infoHash }])
	const result = await addTorrentToQbittorrent({ torrentFilePath: await torrentFile(), torrentFilename: 'a.torrent', savePath: 'Q:\\x' })
	assert.equal(result.ok, true)
	assert.equal(result.responseText, QBITTORRENT_ALREADY_PRESENT)
	assert.ok(urls.some((url) => url.endsWith(`/api/v2/torrents/info?hashes=${infoHash}`)))
})

test('addTorrentToQbittorrent still fails a 409 when the torrent is not in qBittorrent', async (t) => {
	mockQbittorrent(t, [])
	await assert.rejects(
		addTorrentToQbittorrent({ torrentFilePath: await torrentFile(), torrentFilename: 'a.torrent', savePath: 'Q:\\x' }),
		(error: unknown) => error instanceof QbittorrentRequestError && error.message.includes('409 Conflict'),
	)
})
