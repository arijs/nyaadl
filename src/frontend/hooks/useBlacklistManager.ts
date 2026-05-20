import { createEffect, createMemo, createResource, createSignal } from 'solid-js'
import type { BlacklistQuery, BlacklistResponse } from '../../shared/api'
import { requestJson } from '../lib/httpClient'

interface UseBlacklistManagerOptions {
	refetch: () => unknown | Promise<unknown>
}

async function fetchBlacklist(query: BlacklistQuery): Promise<BlacklistResponse> {
	const searchParams = new URLSearchParams()
	if (typeof query.page === 'number') {
		searchParams.set('page', String(query.page))
	}
	if (typeof query.pageSize === 'number') {
		searchParams.set('pageSize', String(query.pageSize))
	}
	if (query.query) {
		searchParams.set('query', query.query)
	}
	if (query.resolutionFilter) {
		searchParams.set('resolutionFilter', query.resolutionFilter)
	}
	const url = searchParams.size ? `/api/blacklist?${searchParams.toString()}` : '/api/blacklist'
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`Failed to load blacklist: ${response.status}`)
	}
	const body = await response.json() as { success: boolean; data: BlacklistResponse }
	return body.data
}

export function useBlacklistManager(options: UseBlacklistManagerOptions) {
	const [titleQuery, setTitleQuery] = createSignal('')
	const [resolutionFilter, setResolutionFilter] = createSignal('all')
	const [currentPage, setCurrentPage] = createSignal(1)
	const [deletingKey, setDeletingKey] = createSignal<string | undefined>(undefined)
	const [displayBlacklist, setDisplayBlacklist] = createSignal<BlacklistResponse | undefined>(undefined)
	const pageSize = 10

	const [blacklist, { refetch }] = createResource(
		() => ({
			page: currentPage(),
			pageSize,
			query: titleQuery().trim() || undefined,
			resolutionFilter: resolutionFilter(),
		}),
		fetchBlacklist,
	)

	createEffect(() => {
		const response = blacklist()
		if (response) {
			setDisplayBlacklist(response)
		}
	})

	const resolutionOptions = createMemo(() => {
		return displayBlacklist()?.resolutionOptions ?? ['all']
	})

	const resolutionCounts = createMemo(() => displayBlacklist()?.resolutionCounts ?? {})
	const filtered = createMemo(() => displayBlacklist()?.items ?? [])
	const totalPages = createMemo(() => displayBlacklist()?.totalPages ?? 1)
	const totalItems = createMemo(() => displayBlacklist()?.totalItems ?? 0)

	createEffect(() => {
		titleQuery()
		resolutionFilter()
		setCurrentPage(1)
	})

	createEffect(() => {
		const page = currentPage()
		const max = totalPages()
		if (page > max) {
			setCurrentPage(max)
		}
		if (page < 1) {
			setCurrentPage(1)
		}
	})

	async function removeItem(key: string) {
		setDeletingKey(key)
		try {
			await requestJson('/api/blacklist', 'DELETE', { key })
			await Promise.resolve(options.refetch())
			await refetch()
		} finally {
			setDeletingKey(undefined)
		}
	}

	function goFirstPage() {
		setCurrentPage(1)
	}

	function goPreviousPage() {
		setCurrentPage((page) => Math.max(1, page - 1))
	}

	function goNextPage() {
		setCurrentPage((page) => Math.min(totalPages(), page + 1))
	}

	function goLastPage() {
		setCurrentPage(totalPages())
	}

	return {
		isLoading: () => blacklist.loading,
		error: () => blacklist.error,
		titleQuery,
		setTitleQuery,
		resolutionFilter,
		setResolutionFilter,
		resolutionOptions,
		resolutionCounts,
		filtered,
		paginated: filtered,
		totalItems,
		currentPage,
		totalPages,
		pageSize,
		deletingKey,
		removeItem,
		refetch,
		goFirstPage,
		goPreviousPage,
		goNextPage,
		goLastPage,
	}
}
