import { createEffect, createMemo, createResource, createSignal } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { BlacklistEntry } from '../../shared/types'
import { requestJson } from '../lib/httpClient'

interface UseBlacklistManagerOptions {
	refetch: () => unknown | Promise<unknown>
}

async function fetchBlacklist(): Promise<BlacklistEntry[]> {
	const response = await fetch('/api/blacklist')
	if (!response.ok) {
		throw new Error(`Failed to load blacklist: ${response.status}`)
	}
	const body = await response.json() as { success: boolean; data: BlacklistEntry[] }
	return body.data
}

export function useBlacklistManager(options: UseBlacklistManagerOptions) {
	const [titleQuery, setTitleQuery] = createSignal('')
	const [resolutionFilter, setResolutionFilter] = createSignal('all')
	const [currentPage, setCurrentPage] = createSignal(1)
	const [deletingKey, setDeletingKey] = createSignal<string | undefined>(undefined)
	const pageSize = 10

	const [blacklist, { refetch }] = createResource(fetchBlacklist)

	const resolutionOptions = createMemo(() => {
		const options = new Set<string>()
		for (const item of blacklist() ?? []) {
			options.add(item.resolution)
		}
		return ['all', ...Array.from(options).sort((a, b) => a.localeCompare(b))]
	})

	const filtered = createMemo(() => {
		const query = titleQuery().trim().toLowerCase()
		const resolution = resolutionFilter()
		return (blacklist() ?? []).filter((item) => {
			if (resolution !== 'all' && item.resolution !== resolution) {
				return false
			}
			if (!query) {
				return true
			}
			const haystack = `${item.seriesKey} ${item.key} ${item.resolution}`.toLowerCase()
			return haystack.includes(query)
		})
	})

	const totalPages = createMemo(() => Math.max(1, Math.ceil(filtered().length / pageSize)))

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

	const paginated = createMemo(() => {
		const page = currentPage()
		const start = (page - 1) * pageSize
		return filtered().slice(start, start + pageSize)
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
		blacklist: blacklist as Accessor<BlacklistEntry[] | undefined>,
		isLoading: () => blacklist.loading,
		error: () => blacklist.error,
		titleQuery,
		setTitleQuery,
		resolutionFilter,
		setResolutionFilter,
		resolutionOptions,
		filtered,
		paginated,
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
