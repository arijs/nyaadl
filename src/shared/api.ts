import type { AppStatus, DailyReport, PendingItem, QbittorrentFailureItem, QbittorrentRuntimeConfig, TorrentHistoryItem, WatchTarget } from './types'

export interface ApiEnvelope<T> {
	success: boolean
	data: T
}

export interface StatusPayload {
	status: AppStatus
	watchTargets: WatchTarget[]
	queue: PendingItem[]
	qbittorrentConfig: QbittorrentRuntimeConfig
	qbittorrentFailures: QbittorrentFailureItem[]
	torrents: TorrentHistoryItem[]
}

export type StatusResponse = ApiEnvelope<StatusPayload>

export type ListResponse<T> = ApiEnvelope<T>

export type ReportResponse = ApiEnvelope<DailyReport>

export interface ApiErrorBody {
	success: false
	error: string
	details?: unknown
}