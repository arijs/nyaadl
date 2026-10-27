import { releaseTagLabels } from '@shared/releaseTitle'
import type { ReleaseTagKey, ReleaseTags } from '@shared/releaseTitle'
import type { BlacklistEntry } from '@shared/types'
import { buildNormalizedKey } from './normalizeService'

export interface BlacklistQuery {
	page?: number
	pageSize?: number
	query?: string
	resolutionFilter?: string
}

export interface BlacklistPage {
	items: BlacklistEntry[]
	currentPage: number
	pageSize: number
	totalItems: number
	totalPages: number
	resolutionCounts: Record<string, number>
	resolutionOptions: string[]
}

function normalizeQuery(value: string | undefined): string {
	return value?.trim().toLowerCase() ?? ''
}

// Only known tag names with plain lowercase values ("source=bili") make it into a key.
export function sanitizeBlacklistTags(value: unknown): ReleaseTags {
	const tags: ReleaseTags = {}
	if (typeof value !== 'object' || value === null) {
		return tags
	}
	for (const [tag, tagValue] of Object.entries(value)) {
		if (tag in releaseTagLabels && typeof tagValue === 'string' && /^[a-z0-9.+-]+$/.test(tagValue)) {
			tags[tag as ReleaseTagKey] = tagValue
		}
	}
	return tags
}

// "series::res" blocks the whole series at that resolution; "series::res::source=bili;videoCodec=h265"
// blocks only its releases whose title carries all of those tags.
export function buildBlacklistKey(seriesKey: string, resolution: string, tags: ReleaseTags = {}): string {
	const tagPart = Object.entries(tags)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([tag, value]) => `${tag}=${value}`)
		.join(';')
	return `${buildNormalizedKey(seriesKey, resolution)}${tagPart ? `::${tagPart}` : ''}`
}

export function parseBlacklistEntry(key: string): BlacklistEntry {
	const parts = key.split('::')
	const tagPart = parts.length > 2 && parts[parts.length - 1]!.includes('=') ? parts.pop()! : undefined
	if (parts.length < 2) {
		return {
			key,
			seriesKey: key,
			resolution: 'unknown',
		}
	}

	const resolution = parts.pop()!.trim() || 'unknown'
	const seriesKey = parts.join('::').trim() || key
	const tags = tagPart ? Object.fromEntries(tagPart.split(';').map((pair) => pair.split('=') as [string, string])) : undefined
	return {
		key,
		seriesKey,
		resolution,
		...(tags ? { tags: sanitizeBlacklistTags(tags) } : {}),
	}
}

export function buildBlacklistPage(items: string[], query: BlacklistQuery = {}): BlacklistPage {
	const pageSize = Math.max(1, Math.floor(query.pageSize ?? 10))
	const selectedResolution = query.resolutionFilter?.trim() ?? 'all'
	const searchQuery = normalizeQuery(query.query)
	const parsed = items.map(parseBlacklistEntry)
	const searchFiltered = parsed.filter((item) => {
		if (!searchQuery) {
			return true
		}
		const haystack = `${item.seriesKey} ${item.key} ${item.resolution}`.toLowerCase()
		return haystack.includes(searchQuery)
	})
	const filtered = selectedResolution === 'all'
		? searchFiltered
		: searchFiltered.filter((item) => item.resolution === selectedResolution)
	const resolutionCounts = searchFiltered.reduce<Record<string, number>>((acc, item) => {
		acc[item.resolution] = (acc[item.resolution] ?? 0) + 1
		return acc
	}, {})
	const resolutionOptions = ['all', ...Array.from(new Set(searchFiltered.map((item) => item.resolution))).sort((left, right) => left.localeCompare(right))]
	const totalItems = filtered.length
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
	const currentPage = Math.min(Math.max(1, Math.floor(query.page ?? 1)), totalPages)
	const start = (currentPage - 1) * pageSize

	return {
		items: filtered.slice(start, start + pageSize),
		currentPage,
		pageSize,
		totalItems,
		totalPages,
		resolutionCounts,
		resolutionOptions,
	}
}