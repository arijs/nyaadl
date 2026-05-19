import { createHash } from 'node:crypto'
import { sanitizePathSegment } from './normalizeService'

export const defaultNyaaQuery = 'Erai-raws -HEVC'
export const defaultNyaaQueryKey = 'default'

function normalizeSpaces(value: string): string {
	return value.trim().replace(/\s+/g, ' ')
}

export function normalizeNyaaQuery(value: string | undefined): string | undefined {
	const normalized = normalizeSpaces(value ?? '')
	return normalized.length > 0 ? normalized : undefined
}

export function buildNyaaQueryKey(value: string | undefined): string {
	const normalized = normalizeNyaaQuery(value)
	if (!normalized) {
		return defaultNyaaQueryKey
	}
	return normalized.toLowerCase()
}

export function buildNyaaQueryUrl(page: number, customQuery?: string): string {
	const query = normalizeNyaaQuery(customQuery) ?? defaultNyaaQuery
	const search = new URLSearchParams({
		f: '0',
		c: '1_2',
		q: query,
		p: String(page),
	})
	return `https://nyaa.si/?${search.toString()}`
}

export function buildNyaaSnapshotFolderName(datePrefix: string, page: number, customQuery?: string): string {
	const normalizedQuery = normalizeNyaaQuery(customQuery)
	if (!normalizedQuery) {
		return `page-${datePrefix}-${page}`
	}

	const safeSlugBase = sanitizePathSegment(normalizedQuery)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48)
	const queryHash = createHash('sha1').update(normalizedQuery).digest('hex').slice(0, 8)
	const safeSlug = safeSlugBase.length > 0 ? `${safeSlugBase}-${queryHash}` : queryHash
	return `page-${datePrefix}-q-${safeSlug}-${page}`
}
