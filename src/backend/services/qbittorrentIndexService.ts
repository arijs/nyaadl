import { createReadStream, createWriteStream } from 'node:fs'
import { rename } from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip, createGzip } from 'node:zlib'
import type { QbittorrentIndexStatus, QbittorrentTorrentSummary } from '@shared/api'
import { dataRoot, ensureDirectory } from '../storage/jsonStore'
import { getQbittorrentJson } from './qbittorrentService'

// What qBittorrent's torrents/info returns per torrent (only the fields used here).
export interface QbittorrentInfo {
	hash: string
	name: string
	content_path: string
	comment?: string
	state: string
	progress: number
	size: number
	added_on: number
	completion_on?: number
	ratio?: number
	num_complete?: number
	num_incomplete?: number
	tags?: string
	category?: string
}

// The fields that (almost) never change, kept on disk. Live ones (state, ratio...) are fetched when shown.
export interface IndexedTorrent {
	hash: string
	contentPath: string
	name: string
	nyaaTorrentId?: string
	addedOn: number
	size: number
}

export interface QbittorrentIndex {
	torrents: Map<string, IndexedTorrent>
	// Normalized content_path -> hash. For a single-file torrent content_path is the file itself.
	byContentPath: Map<string, string>
	fullSyncAt?: string
	newTorrentsCheckedAt?: string
}

export function createQbittorrentIndex(): QbittorrentIndex {
	return { torrents: new Map(), byContentPath: new Map() }
}

export const normalizeQbittorrentPath = (value: string) => value.replace(/[\\/]+/g, '/').toLowerCase()

const parseNyaaTorrentId = (comment: string | undefined) => /nyaa\.si\/view\/(\d+)/.exec(comment ?? '')?.[1]

export function toIndexedTorrent(info: QbittorrentInfo): IndexedTorrent {
	return { hash: info.hash, contentPath: info.content_path, name: info.name, nyaaTorrentId: parseNyaaTorrentId(info.comment), addedOn: info.added_on, size: info.size }
}

export function toTorrentSummary(info: QbittorrentInfo): QbittorrentTorrentSummary {
	return {
		hash: info.hash,
		name: info.name,
		live: true,
		state: info.state,
		progress: info.progress,
		sizeBytes: info.size,
		addedOn: info.added_on,
		completionOn: info.completion_on && info.completion_on > 0 ? info.completion_on : undefined,
		ratio: info.ratio,
		numComplete: info.num_complete,
		numIncomplete: info.num_incomplete,
		tags: info.tags || undefined,
		category: info.category || undefined,
		nyaaTorrentId: parseNyaaTorrentId(info.comment),
	}
}

// Adds or updates a torrent; returns whether the index changed.
export function upsertTorrent(index: QbittorrentIndex, torrent: IndexedTorrent): boolean {
	const current = index.torrents.get(torrent.hash)
	if (current && current.contentPath === torrent.contentPath && current.name === torrent.name && current.nyaaTorrentId === torrent.nyaaTorrentId) {
		return false
	}
	if (current) {
		index.byContentPath.delete(normalizeQbittorrentPath(current.contentPath))
	}
	index.torrents.set(torrent.hash, torrent)
	index.byContentPath.set(normalizeQbittorrentPath(torrent.contentPath), torrent.hash)
	return true
}

export function removeTorrent(index: QbittorrentIndex, hash: string): boolean {
	const current = index.torrents.get(hash)
	if (!current) {
		return false
	}
	index.byContentPath.delete(normalizeQbittorrentPath(current.contentPath))
	index.torrents.delete(hash)
	return true
}

export function findIndexedTorrentByPath(index: QbittorrentIndex, filePath: string): IndexedTorrent | undefined {
	const hash = index.byContentPath.get(normalizeQbittorrentPath(filePath))
	return hash ? index.torrents.get(hash) : undefined
}

export function getIndexStatus(index: QbittorrentIndex): QbittorrentIndexStatus {
	return { torrents: index.torrents.size, fullSyncAt: index.fullSyncAt, newTorrentsCheckedAt: index.newTorrentsCheckedAt }
}

// File format (gzipped NDJSON): a header line, then one line per torrent:
//   {"version":1,"fullSyncAt":"...","newTorrentsCheckedAt":"..."}
//   ["<hash>","<content_path>","<name>","<nyaa id>"|null,<added_on>,<size>]
type IndexRow = [string, string, string, string | null, number, number]

export async function saveQbittorrentIndex(index: QbittorrentIndex, filePath: string): Promise<void> {
	await ensureDirectory(path.dirname(filePath))
	const tempPath = `${filePath}.tmp`
	function* lines() {
		yield `${JSON.stringify({ version: 1, fullSyncAt: index.fullSyncAt, newTorrentsCheckedAt: index.newTorrentsCheckedAt })}\n`
		for (const torrent of index.torrents.values()) {
			const row: IndexRow = [torrent.hash, torrent.contentPath, torrent.name, torrent.nyaaTorrentId ?? null, torrent.addedOn, torrent.size]
			yield `${JSON.stringify(row)}\n`
		}
	}
	await pipeline(Readable.from(lines()), createGzip(), createWriteStream(tempPath))
	await rename(tempPath, filePath)
}

export async function loadQbittorrentIndex(filePath: string): Promise<QbittorrentIndex> {
	const index = createQbittorrentIndex()
	const input = createReadStream(filePath)
	const opened = await new Promise<boolean>((resolve) => {
		input.once('open', () => resolve(true))
		input.once('error', () => resolve(false))
	})
	if (!opened) {
		return index
	}
	let isHeader = true
	for await (const line of createInterface({ input: input.pipe(createGunzip()), crlfDelay: Infinity })) {
		if (!line) {
			continue
		}
		if (isHeader) {
			const header = JSON.parse(line) as { fullSyncAt?: string; newTorrentsCheckedAt?: string }
			index.fullSyncAt = header.fullSyncAt
			index.newTorrentsCheckedAt = header.newTorrentsCheckedAt
			isHeader = false
			continue
		}
		const [hash, contentPath, name, nyaaTorrentId, addedOn, size] = JSON.parse(line) as IndexRow
		upsertTorrent(index, { hash, contentPath, name, nyaaTorrentId: nyaaTorrentId ?? undefined, addedOn, size })
	}
	return index
}

// Pages through torrents newest first until one already in the index shows up. qBittorrent sorts the
// whole list on every call (~4s for 27k torrents), so pages are large and this normally needs just one.
export async function fetchNewTorrents(index: QbittorrentIndex, fetchPage: (offset: number, limit: number) => Promise<QbittorrentInfo[]>, pageSize = 200): Promise<number> {
	let added = 0
	for (let offset = 0; ; offset += pageSize) {
		const page = await fetchPage(offset, pageSize)
		for (const info of page) {
			if (index.torrents.has(info.hash)) {
				return added
			}
			upsertTorrent(index, toIndexedTorrent(info))
			added += 1
		}
		if (page.length < pageSize) {
			return added
		}
	}
}

// Live data for the given torrents. A hash qBittorrent no longer returns was removed; a changed
// content_path means it was moved. Both are fixed in the index; returns whether it changed.
export function applyLiveTorrents(index: QbittorrentIndex, requestedHashes: string[], live: QbittorrentInfo[]): boolean {
	let changed = false
	const returned = new Set(live.map((info) => info.hash))
	for (const hash of requestedHashes) {
		if (!returned.has(hash)) {
			changed = removeTorrent(index, hash) || changed
		}
	}
	for (const info of live) {
		changed = upsertTorrent(index, toIndexedTorrent(info)) || changed
	}
	return changed
}

// --- App state: the index file under data/, loaded at startup and saved after every change. ---

const indexFilePath = path.join(dataRoot, 'qbittorrent-index.jsonl.gz')
const newTorrentsCheckIntervalMs = 5 * 60_000
let index = createQbittorrentIndex()
let queue: Promise<unknown> = Promise.resolve()

// Index updates run one at a time, so a rebuild never interleaves with a new-torrents check.
function serialized<T>(task: () => Promise<T>): Promise<T> {
	const run = queue.then(task, task)
	queue = run.catch(() => undefined)
	return run
}

const fetchInfoPage = (offset: number, limit: number) =>
	getQbittorrentJson<QbittorrentInfo[]>(`/api/v2/torrents/info?sort=added_on&reverse=true&limit=${limit}&offset=${offset}`)

export async function initQbittorrentIndex(): Promise<void> {
	// A damaged file must not stop the app; the index just starts empty until the next rebuild.
	index = await loadQbittorrentIndex(indexFilePath).catch((error: unknown) => {
		console.error('Failed to load the qBittorrent index, starting empty', error)
		return createQbittorrentIndex()
	})
}

export function getQbittorrentIndex(): QbittorrentIndex {
	return index
}

// Manual only: downloads the whole torrent list (tens of MB on a large qBittorrent) and replaces the index.
export function rebuildQbittorrentIndex(): Promise<QbittorrentIndexStatus> {
	return serialized(async () => {
		const all = await getQbittorrentJson<QbittorrentInfo[]>('/api/v2/torrents/info', 180_000)
		const rebuilt = createQbittorrentIndex()
		for (const info of all) {
			upsertTorrent(rebuilt, toIndexedTorrent(info))
		}
		rebuilt.fullSyncAt = new Date().toISOString()
		rebuilt.newTorrentsCheckedAt = rebuilt.fullSyncAt
		await saveQbittorrentIndex(rebuilt, indexFilePath)
		index = rebuilt
		return getIndexStatus(index)
	})
}

// Adds torrents added to qBittorrent since the last check (at most every 5 minutes; skipped until the first rebuild).
export function checkNewQbittorrentTorrents(now = Date.now()): Promise<number> {
	return serialized(async () => {
		const lastCheck = index.newTorrentsCheckedAt ? Date.parse(index.newTorrentsCheckedAt) : 0
		if (index.torrents.size === 0 || now - lastCheck < newTorrentsCheckIntervalMs) {
			return 0
		}
		const added = await fetchNewTorrents(index, fetchInfoPage)
		index.newTorrentsCheckedAt = new Date(now).toISOString()
		await saveQbittorrentIndex(index, indexFilePath)
		return added
	})
}

// Live summaries for indexed torrents, keyed by hash; fixes removed/moved torrents in the index on the way.
export function fetchLiveQbittorrentTorrents(hashes: string[]): Promise<Map<string, QbittorrentTorrentSummary>> {
	return serialized(async () => {
		if (hashes.length === 0) {
			return new Map()
		}
		const live = await getQbittorrentJson<QbittorrentInfo[]>(`/api/v2/torrents/info?hashes=${hashes.join('|')}`)
		if (applyLiveTorrents(index, hashes, live)) {
			await saveQbittorrentIndex(index, indexFilePath)
		}
		return new Map(live.map((info) => [info.hash, toTorrentSummary(info)]))
	})
}
