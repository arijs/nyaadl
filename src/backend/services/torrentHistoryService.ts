import type { DecisionRecord, TorrentFilter, TorrentHistoryItem } from '@shared/types'

const statusFilters: TorrentFilter[] = ['all', 'auto_downloaded', 'already_downloaded', 'blocked', 'pending', 'approved', 'skipped']

export interface TorrentHistoryQuery {
	page?: number
	pageSize?: number
	filter?: TorrentFilter
	fromDate?: string
	toDate?: string
	titleQuery?: string
	excludeTitleQuery?: string
	resolutionFilter?: string
}

export interface TorrentHistoryPage {
	items: TorrentHistoryItem[]
	currentPage: number
	pageSize: number
	totalItems: number
	totalPages: number
	counts: Record<TorrentFilter, number>
	resolutionOptions: string[]
}

function toHistoryItem(decision: DecisionRecord): TorrentHistoryItem {
	return {
		...decision,
		seriesKey: (decision as DecisionRecord & { seriesKey?: string }).seriesKey ?? decision.item.seriesBaseRaw.toLowerCase(),
		internalNames: (decision as DecisionRecord & { internalNames?: string[] }).internalNames,
	}
}

function normalizeQuery(value: string | undefined): string {
	return value?.trim().toLowerCase() ?? ''
}

function isInDateRange(createdAtUtc: string, fromDate: string, toDate: string): boolean {
	const createdAt = createdAtUtc.slice(0, 10)
	if (fromDate && createdAt < fromDate) {
		return false
	}
	if (toDate && createdAt > toDate) {
		return false
	}
	return true
}

function buildCounts(items: TorrentHistoryItem[]): Record<TorrentFilter, number> {
	return statusFilters.reduce<Record<TorrentFilter, number>>((acc, status) => {
		acc[status] = status === 'all' ? items.length : items.filter((item) => item.status === status).length
		return acc
	}, {
		all: 0,
		auto_downloaded: 0,
		already_downloaded: 0,
		blocked: 0,
		pending: 0,
		approved: 0,
		skipped: 0,
	})
}

export function buildTorrentHistoryPage(decisions: DecisionRecord[], query: TorrentHistoryQuery = {}): TorrentHistoryPage {
	const pageSize = Math.max(1, Math.floor(query.pageSize ?? 10))
	const fromDate = query.fromDate?.trim() ?? ''
	const toDate = query.toDate?.trim() ?? ''
	const titleQuery = normalizeQuery(query.titleQuery)
	const excludeTitleQuery = normalizeQuery(query.excludeTitleQuery)
	const resolutionFilter = query.resolutionFilter?.trim() ?? 'all'
	const selectedFilter = query.filter ?? 'all'

	const history = decisions.map(toHistoryItem)
	const dateFiltered = history.filter((item) => isInDateRange(item.createdAtUtc, fromDate, toDate))
	const resolutionOptions = ['all', ...Array.from(new Set(dateFiltered.map((item) => item.item.resolution))).sort((left, right) => left.localeCompare(right))]
	const queryFiltered = dateFiltered.filter((item) => {
		if (resolutionFilter !== 'all' && item.item.resolution !== resolutionFilter) {
			return false
		}

		const haystack = `${item.item.title} ${item.item.seriesBaseRaw}`.toLowerCase()
		if (titleQuery && !haystack.includes(titleQuery)) {
			return false
		}
		if (excludeTitleQuery && haystack.includes(excludeTitleQuery)) {
			return false
		}
		return true
	})
	const counts = buildCounts(queryFiltered)
	const selectedItems = selectedFilter === 'all'
		? queryFiltered
		: queryFiltered.filter((item) => item.status === selectedFilter)
	const totalItems = selectedItems.length
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
	const currentPage = Math.min(Math.max(1, Math.floor(query.page ?? 1)), totalPages)
	const start = (currentPage - 1) * pageSize

	return {
		items: selectedItems.slice(start, start + pageSize),
		currentPage,
		pageSize,
		totalItems,
		totalPages,
		counts,
		resolutionOptions,
	}
}