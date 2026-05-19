import { createEffect, createMemo, createSignal, onMount } from 'solid-js'
import type { BootstrapLogFilter, BootstrapSessionEntry } from '../types'

const BOOTSTRAP_SESSION_LOG_STORAGE_KEY = 'nyaadl.bootstrap.session.log.v1'
const BOOTSTRAP_SESSION_LOG_MAX_ENTRIES = 1000
export const BOOTSTRAP_SESSION_LOG_PAGE_SIZE = 10

function isBootstrapSessionEntry(value: unknown): value is BootstrapSessionEntry {
	if (!value || typeof value !== 'object') {
		return false
	}
	const candidate = value as Partial<BootstrapSessionEntry>
	return typeof candidate.timestampUtc === 'string'
		&& (candidate.kind === 'step' || candidate.kind === 'action' || candidate.kind === 'error')
		&& typeof candidate.message === 'string'
}

export function useBootstrapSessionLog() {
	const [entries, setEntries] = createSignal<BootstrapSessionEntry[]>([])
	const [filter, setFilter] = createSignal<BootstrapLogFilter>('all')
	const [query, setQuery] = createSignal('')
	const [page, setPage] = createSignal(1)

	onMount(() => {
		if (typeof window === 'undefined') {
			return
		}
		try {
			const raw = window.sessionStorage.getItem(BOOTSTRAP_SESSION_LOG_STORAGE_KEY)
			if (!raw) {
				return
			}
			const parsed = JSON.parse(raw) as unknown
			if (!Array.isArray(parsed)) {
				return
			}
			const restored = parsed.filter(isBootstrapSessionEntry).slice(0, BOOTSTRAP_SESSION_LOG_MAX_ENTRIES)
			setEntries(restored)
		} catch {
			setEntries([])
		}
	})

	createEffect(() => {
		if (typeof window === 'undefined') {
			return
		}
		try {
			window.sessionStorage.setItem(BOOTSTRAP_SESSION_LOG_STORAGE_KEY, JSON.stringify(entries()))
		} catch {
			// Ignore session storage write failures (private mode/quota).
		}
	})

	const filteredEntries = createMemo(() => {
		const selectedFilter = filter()
		const normalizedQuery = query().trim().toLowerCase()
		return entries().filter((entry) => {
			if (selectedFilter !== 'all' && entry.kind !== selectedFilter) {
				return false
			}
			if (!normalizedQuery) {
				return true
			}
			const haystack = `${entry.kind} ${entry.message} ${entry.page ?? ''} ${entry.itemIndex ?? ''}`.toLowerCase()
			return haystack.includes(normalizedQuery)
		})
	})

	const totalPages = createMemo(() => {
		const total = filteredEntries().length
		return Math.max(1, Math.ceil(total / BOOTSTRAP_SESSION_LOG_PAGE_SIZE))
	})

	const paginatedEntries = createMemo(() => {
		const currentPage = page()
		const start = (currentPage - 1) * BOOTSTRAP_SESSION_LOG_PAGE_SIZE
		const end = start + BOOTSTRAP_SESSION_LOG_PAGE_SIZE
		return filteredEntries().slice(start, end)
	})

	createEffect(() => {
		const maxPage = totalPages()
		const currentPage = page()
		if (currentPage > maxPage) {
			setPage(maxPage)
			return
		}
		if (currentPage < 1) {
			setPage(1)
		}
	})

	createEffect(() => {
		filter()
		query()
		setPage(1)
	})

	function appendEntry(entry: BootstrapSessionEntry) {
		setEntries((previous) => [entry, ...previous].slice(0, BOOTSTRAP_SESSION_LOG_MAX_ENTRIES))
	}

	function clearEntries() {
		setEntries([])
		setPage(1)
	}

	function firstPage() {
		setPage(1)
	}

	function previousPage() {
		setPage((current) => Math.max(1, current - 1))
	}

	function nextPage() {
		setPage((current) => Math.min(totalPages(), current + 1))
	}

	function lastPage() {
		setPage(totalPages())
	}

	function exportLog() {
		const snapshot = {
			exportedAtUtc: new Date().toISOString(),
			filter: filter(),
			query: query(),
			visibleEntries: filteredEntries(),
			totalEntries: entries(),
		}
		const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = `nyaadl-bootstrap-session-log-${new Date().toISOString().slice(0, 10)}.json`
		anchor.click()
		URL.revokeObjectURL(url)
	}

	return {
		entries,
		filter,
		setFilter,
		query,
		setQuery,
		page,
		totalPages,
		filteredEntries,
		paginatedEntries,
		appendEntry,
		clearEntries,
		firstPage,
		previousPage,
		nextPage,
		lastPage,
		exportLog,
	}
}
