import path from 'node:path'
import { readdir, writeFile } from 'node:fs/promises'
import type { TorrentItem } from '@shared/types'
import { dataRoot, ensureDirectory } from '../storage/jsonStore'
import { sanitizePathSegment } from './normalizeService'
import { withRetry } from './retryService'

export interface DownloadedTorrentFile {
	filename: string
	filePath: string
}

function extractFilenameFromContentDisposition(headerValue: string | null): string | null {
	if (!headerValue) {
		return null
	}
	const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(headerValue)
	if (utf8Match?.[1]) {
		return decodeURIComponent(utf8Match[1])
	}
	const quotedMatch = /filename="?([^";]+)"?/i.exec(headerValue)
	return quotedMatch?.[1] ?? null
}

export async function downloadTorrentFile(item: Pick<TorrentItem, 'downloadUrl' | 'title' | 'torrentId' | 'page'>): Promise<DownloadedTorrentFile> {
	const datePrefix = new Date().toISOString().slice(0, 10)
	const torrentsRoot = path.join(dataRoot, '..', 'torrents', `page-${datePrefix}-${item.page}`)
	await ensureDirectory(torrentsRoot)

	const response = await withRetry(async () => fetch(`https://nyaa.si${item.downloadUrl}`, {
		headers: {
			'user-agent': 'Mozilla/5.0 (compatible; NYAADL/1.0; +https://github.com)',
			'accept': 'application/x-bittorrent,*/*',
		},
	}))
	if (!response.ok) {
		throw new Error(`Failed to download torrent ${item.downloadUrl}: ${response.status} ${response.statusText}`)
	}
	const suggestedName = extractFilenameFromContentDisposition(response.headers.get('content-disposition'))
	const baseName = sanitizePathSegment((suggestedName ?? item.title).replace(/\.torrent$/i, '')) || 'torrent'
	const filename = `${baseName}-${item.torrentId}.torrent`
	const filePath = path.join(torrentsRoot, filename)
	await writeFile(filePath, Buffer.from(await response.arrayBuffer()))
	return { filename, filePath }
}

export async function findDownloadedTorrentFileById(torrentId: string): Promise<DownloadedTorrentFile | undefined> {
	const torrentsRoot = path.join(dataRoot, '..', 'torrents')
	const fileSuffix = `-${torrentId}.torrent`

	const searchDirectory = async (dirPath: string): Promise<DownloadedTorrentFile | undefined> => {
		const entries = await readdir(dirPath, { withFileTypes: true }).catch(() => [])
		for (const entry of entries) {
			const entryPath = path.join(dirPath, entry.name)
			if (entry.isDirectory()) {
				const nested = await searchDirectory(entryPath)
				if (nested) {
					return nested
				}
				continue
			}
			if (entry.isFile() && entry.name.endsWith(fileSuffix)) {
				return { filename: entry.name, filePath: entryPath }
			}
		}
		return undefined
	}

	return searchDirectory(torrentsRoot)
}