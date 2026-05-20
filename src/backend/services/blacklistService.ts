import type { BlacklistEntry } from '@shared/types'

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

export function parseBlacklistEntry(key: string): BlacklistEntry {
	const separatorIndex = key.lastIndexOf('::')
	if (separatorIndex < 0) {
		return {
			key,
			seriesKey: key,
			resolution: 'unknown',
		}
	}

	const seriesKey = key.slice(0, separatorIndex).trim() || key
	const resolution = key.slice(separatorIndex + 2).trim() || 'unknown'
	return {
		key,
		seriesKey,
		resolution,
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