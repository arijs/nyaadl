import path from 'node:path'
import { sanitizePathSegment } from './normalizeService'
import parseTorrent from 'parse-torrent'

export interface TorrentMetainfoFile {
	path: string[]
	length?: number
}

export interface TorrentMetainfoResult {
	name: string
	files: TorrentMetainfoFile[]
	isSingleFile: boolean
	videoNames: string[]
}

export async function parseTorrentMetainfo(buffer: Buffer): Promise<TorrentMetainfoResult> {
	const parsed = parseTorrent(buffer) as {
		name?: string | string[]
		files?: Array<{ path?: string[] | string; name?: string; length?: number }>
	}
	const resolved = await Promise.resolve(parsed)
	const normalizeSegments = (rawPath?: string[] | string, fallbackName?: string): string[] => {
		if (Array.isArray(rawPath)) {
			return rawPath.map((segment) => sanitizePathSegment(segment)).filter(Boolean)
		}
		if (typeof rawPath === 'string' && rawPath.trim()) {
			return rawPath
				.split(/[\\/]+/)
				.map((segment) => sanitizePathSegment(segment))
				.filter(Boolean)
		}
		if (fallbackName?.trim()) {
			return [sanitizePathSegment(fallbackName)]
		}
		return []
	}
	const files = (resolved.files ?? []).map((file) => ({
		path: normalizeSegments(file.path, file.name),
		length: file.length,
	})) as TorrentMetainfoFile[]
	const videoNames = files.map((file) => {
		const fullPath = file.path.join(path.sep)
		return sanitizePathSegment(path.basename(fullPath))
	}).filter(Boolean)

	return {
		name: sanitizePathSegment(Array.isArray(resolved.name) ? resolved.name.join(path.sep) : resolved.name ?? 'unknown'),
		files,
		isSingleFile: files.length <= 1,
		videoNames,
	}
}