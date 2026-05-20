import { postJson, postJsonBody } from '../lib/httpClient'

interface UseDashboardActionsOptions {
	refetch: () => unknown | Promise<unknown>
}

export function useDashboardActions(options: UseDashboardActionsOptions) {
	async function refreshAfter(action: Promise<unknown>) {
		try {
			await action
		} finally {
			await Promise.resolve(options.refetch())
		}
	}

	async function scrapePageOne() {
		await refreshAfter(postJson('/api/scrape/run'))
	}

	async function bootstrapNextPage() {
		await refreshAfter(postJson('/api/bootstrap/next-page'))
	}

	async function approveAllPending() {
		await refreshAfter(postJson('/api/pending/approve-all'))
	}

	async function approvePending(torrentId: string) {
		await refreshAfter(postJson(`/api/pending/${torrentId}/approve`))
	}

	async function blacklistPending(torrentId: string) {
		await refreshAfter(postJson(`/api/pending/${torrentId}/blacklist`))
	}

	async function skipPending(torrentId: string) {
		await refreshAfter(postJson(`/api/pending/${torrentId}/skip`))
	}

	async function retryQbittorrentFailure(torrentId: string, config: { baseUrl: string; username: string; password: string }) {
		await refreshAfter((async () => {
			await postJsonBody('/api/qbittorrent/config', config)
			await postJson(`/api/qbittorrent/failures/${torrentId}/retry`)
		})())
	}

	async function saveQbittorrentConfig(config: { baseUrl: string; username: string; password: string }) {
		await refreshAfter(postJsonBody('/api/qbittorrent/config', config))
	}

	async function suppressQbittorrentFailure(torrentId: string) {
		await refreshAfter(postJson(`/api/qbittorrent/failures/${torrentId}/suppress`))
	}

	async function exportReportForToday() {
		const date = new Date().toISOString().slice(0, 10)
		const response = await fetch(`/api/reports/${date}`)
		if (!response.ok) {
			throw new Error(`Failed to export report: ${response.status}`)
		}
		const blob = await response.blob()
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = `nyaadl-report-${date}.json`
		anchor.click()
		URL.revokeObjectURL(url)
	}

	return {
		scrapePageOne,
		bootstrapNextPage,
		approveAllPending,
		approvePending,
		blacklistPending,
		skipPending,
		retryQbittorrentFailure,
		saveQbittorrentConfig,
		suppressQbittorrentFailure,
		exportReportForToday,
	}
}
