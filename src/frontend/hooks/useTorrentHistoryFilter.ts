import { createEffect, createMemo, createResource, createSignal } from 'solid-js'
import type { TorrentHistoryQuery, TorrentHistoryResponse } from '../../shared/api'
import type { BlacklistConfirmState } from '../components/ui/BlacklistConfirmModal'
import { postJsonBody, requestJson } from '../lib/httpClient'
import type { TorrentFilter } from '../types'

const emptyCounts: Record<TorrentFilter, number> = {
	all: 0,
	auto_downloaded: 0,
	already_downloaded: 0,
	blocked: 0,
	pending: 0,
	approved: 0,
	skipped: 0,
}

async function fetchTorrentHistory(query: TorrentHistoryQuery): Promise<TorrentHistoryResponse> {
	const response = await postJsonBody<TorrentHistoryResponse>('/api/torrents/history', query)
	return response.data
}

export function useTorrentHistoryFilter() {
	const [filter, setFilter] = createSignal<TorrentFilter>('all')
	const [fromDate, setFromDate] = createSignal('')
	const [toDate, setToDate] = createSignal('')
	const [titleQuery, setTitleQuery] = createSignal('')
	const [excludeTitleQuery, setExcludeTitleQuery] = createSignal('')
	const [resolutionFilter, setResolutionFilter] = createSignal('all')
	const [currentPage, setCurrentPage] = createSignal(1)
	const [blacklistModal, setBlacklistModal] = createSignal<BlacklistConfirmState | null>(null)
	const [isBlacklisting, setIsBlacklisting] = createSignal(false)
	const [blacklistError, setBlacklistError] = createSignal<string | undefined>(undefined)
	const pageSize = 10

	const [history, { refetch }] = createResource(
		() => ({
			page: currentPage(),
			pageSize,
			filter: filter(),
			fromDate: fromDate().trim() || undefined,
			toDate: toDate().trim() || undefined,
			titleQuery: titleQuery().trim() || undefined,
			excludeTitleQuery: excludeTitleQuery().trim() || undefined,
			resolutionFilter: resolutionFilter(),
		}),
		fetchTorrentHistory,
	)

	const resolutionOptions = createMemo(() => {
		return history()?.resolutionOptions ?? ['all']
	})

	const filterCounts = createMemo<Record<TorrentFilter, number>>(() => {
		return history()?.counts ?? emptyCounts
	})

	const totalItems = createMemo(() => history()?.totalItems ?? 0)

	const paginatedTorrents = createMemo(() => history()?.items ?? [])

	const totalPages = createMemo(() => history()?.totalPages ?? 1)

	createEffect(() => {
		filter()
		fromDate()
		toDate()
		titleQuery()
		excludeTitleQuery()
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

	createEffect(() => {
		const response = history()
		if (!response) {
			return
		}
		if (response.currentPage !== currentPage()) {
			setCurrentPage(response.currentPage)
		}
	})

	function openBlacklistModal(state: BlacklistConfirmState) {
		setBlacklistError(undefined)
		setBlacklistModal(state)
	}

	function cancelBlacklist() {
		if (isBlacklisting()) {
			return
		}
		setBlacklistModal(null)
	}

	async function confirmBlacklist() {
		const modal = blacklistModal()
		if (!modal) {
			return
		}
		setIsBlacklisting(true)
		setBlacklistError(undefined)
		try {
			await requestJson('/api/blacklist', 'POST', { torrentId: modal.torrentId })
			setBlacklistModal(null)
			await refetch()
		} catch (error) {
			setBlacklistError(error instanceof Error ? error.message : 'Falha ao bloquear.')
		} finally {
			setIsBlacklisting(false)
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
		filter,
		setFilter,
		fromDate,
		setFromDate,
		toDate,
		setToDate,
		titleQuery,
		setTitleQuery,
		excludeTitleQuery,
		setExcludeTitleQuery,
		resolutionFilter,
		setResolutionFilter,
		resolutionOptions,
		filterCounts,
		totalItems,
		paginatedTorrents,
		currentPage,
		totalPages,
		pageSize,
		blacklistModal,
		isBlacklisting,
		blacklistError,
		openBlacklistModal,
		confirmBlacklist,
		cancelBlacklist,
		refetch,
		goFirstPage,
		goPreviousPage,
		goNextPage,
		goLastPage,
	}
}
