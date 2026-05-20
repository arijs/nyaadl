import { createEffect, createMemo, createResource, createSignal } from 'solid-js'
import type { WatchTargetQuery, WatchTargetResponse } from '../../shared/api'
import { postJsonBody } from '../lib/httpClient'

async function fetchWatchTargets(query: WatchTargetQuery): Promise<WatchTargetResponse> {
	const response = await postJsonBody<WatchTargetResponse>('/api/watchlist/targets', query)
	return response.data
}

export function useWatchTargets() {
	const [targetsQuery, setTargetsQuery] = createSignal('')
	const [resolutionFilter, setResolutionFilter] = createSignal('all')
	const [rootFilter, setRootFilter] = createSignal('all')
	const [targetsPage, setTargetsPage] = createSignal(1)
	const pageSize = 10

	const [targets, { refetch }] = createResource(
		() => ({
			page: targetsPage(),
			pageSize,
			query: targetsQuery().trim() || undefined,
			resolutionFilter: resolutionFilter(),
			rootFilter: rootFilter(),
		}),
		fetchWatchTargets,
	)

	const resolutionOptions = createMemo(() => targets()?.resolutionOptions ?? ['all'])
	const totalItems = createMemo(() => targets()?.totalItems ?? 0)
	const totalPages = createMemo(() => targets()?.totalPages ?? 1)
	const paginatedWatchTargetRows = createMemo(() => targets()?.items ?? [])
	const resolutionCounts = createMemo(() => targets()?.resolutionCounts ?? {})
	const rootOptions = createMemo(() => targets()?.rootOptions ?? ['all'])
	const rootCounts = createMemo(() => targets()?.rootCounts ?? {})

	createEffect(() => {
		targetsQuery()
		resolutionFilter()
		rootFilter()
		setTargetsPage(1)
	})

	createEffect(() => {
		const page = targetsPage()
		const max = totalPages()
		if (page > max) {
			setTargetsPage(max)
		}
		if (page < 1) {
			setTargetsPage(1)
		}
	})

	createEffect(() => {
		const response = targets()
		if (!response) {
			return
		}
		if (response.currentPage !== targetsPage()) {
			setTargetsPage(response.currentPage)
		}
	})

	function goFirstPage() {
		setTargetsPage(1)
	}

	function goPreviousPage() {
		setTargetsPage((page) => Math.max(1, page - 1))
	}

	function goNextPage() {
		setTargetsPage((page) => Math.min(totalPages(), page + 1))
	}

	function goLastPage() {
		setTargetsPage(totalPages())
	}

	return {
		targetsQuery,
		setTargetsQuery,
		resolutionFilter,
		setResolutionFilter,
		rootFilter,
		setRootFilter,
		resolutionOptions,
		resolutionCounts,
		rootOptions,
		rootCounts,
		totalItems,
		paginatedWatchTargetRows,
		targetsPage,
		totalPages,
		pageSize,
		refetch,
		goFirstPage,
		goPreviousPage,
		goNextPage,
		goLastPage,
	}
}