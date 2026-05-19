import { createMemo, createSignal } from 'solid-js'
import { createEffect } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { StatusResponse } from '../../shared/api'
import type { TorrentFilter } from '../types'

interface UseTorrentHistoryFilterOptions {
	status: Accessor<StatusResponse | undefined>
}

export function useTorrentHistoryFilter(options: UseTorrentHistoryFilterOptions) {
	const [filter, setFilter] = createSignal<TorrentFilter>('all')
	const [fromDate, setFromDate] = createSignal('')
	const [toDate, setToDate] = createSignal('')
	const [titleQuery, setTitleQuery] = createSignal('')
	const [resolutionFilter, setResolutionFilter] = createSignal('all')
	const [currentPage, setCurrentPage] = createSignal(1)
	const pageSize = 10

	const dateFilteredTorrents = createMemo(() => {
		const torrents = options.status()?.data.torrents ?? []
		const from = fromDate()
		const to = toDate()
		return torrents.filter((torrent) => {
			const createdAt = torrent.createdAtUtc.slice(0, 10)
			if (from && createdAt < from) {
				return false
			}
			if (to && createdAt > to) {
				return false
			}
			return true
		})
	})

	const resolutionOptions = createMemo(() => {
		const options = new Set<string>()
		for (const torrent of dateFilteredTorrents()) {
			options.add(torrent.item.resolution)
		}
		return ['all', ...Array.from(options).sort((a, b) => a.localeCompare(b))]
	})

	const filteredByQueryAndResolution = createMemo(() => {
		const query = titleQuery().trim().toLowerCase()
		const selectedResolution = resolutionFilter()
		return dateFilteredTorrents().filter((torrent) => {
			if (selectedResolution !== 'all' && torrent.item.resolution !== selectedResolution) {
				return false
			}
			if (!query) {
				return true
			}
			const haystack = `${torrent.item.title} ${torrent.item.seriesBaseRaw}`.toLowerCase()
			return haystack.includes(query)
		})
	})

	const filterCounts = createMemo<Record<TorrentFilter, number>>(() => {
		const base = {
			all: 0,
			auto_downloaded: 0,
			already_downloaded: 0,
			blocked: 0,
			pending: 0,
			approved: 0,
			skipped: 0,
		} satisfies Record<TorrentFilter, number>
		for (const torrent of filteredByQueryAndResolution()) {
			base.all += 1
			base[torrent.status] += 1
		}
		return base
	})

	const filteredTorrents = createMemo(() => {
		const current = filter()
		const torrents = filteredByQueryAndResolution()
		if (current === 'all') {
			return torrents
		}
		return torrents.filter((torrent) => torrent.status === current)
	})

	const totalPages = createMemo(() => Math.max(1, Math.ceil(filteredTorrents().length / pageSize)))

	createEffect(() => {
		filter()
		fromDate()
		toDate()
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

	const paginatedTorrents = createMemo(() => {
		const page = currentPage()
		const start = (page - 1) * pageSize
		return filteredTorrents().slice(start, start + pageSize)
	})

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
		resolutionFilter,
		setResolutionFilter,
		resolutionOptions,
		filterCounts,
		filteredTorrents,
		paginatedTorrents,
		currentPage,
		totalPages,
		pageSize,
		goFirstPage,
		goPreviousPage,
		goNextPage,
		goLastPage,
	}
}
