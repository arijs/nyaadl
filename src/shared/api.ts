import type { AppStatus, BlacklistEntry, BootstrapDiscoveryResult, DailyReport, PendingItem, QbittorrentFailureItem, QbittorrentRuntimeConfig, TorrentFilter, TorrentHistoryItem, WatchRootStatus, WatchTarget } from './types'

export interface ApiEnvelope<T> {
	success: boolean
	data: T
}

export interface StatusPayload {
	status: AppStatus
	queue: PendingItem[]
	qbittorrentConfig: QbittorrentRuntimeConfig
	qbittorrentFailures: QbittorrentFailureItem[]
}

export type StatusResponse = ApiEnvelope<StatusPayload>

export interface BootstrapDiscoveryPayload {
	result?: BootstrapDiscoveryResult
}

export type BootstrapDiscoveryResponse = ApiEnvelope<BootstrapDiscoveryPayload>

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

export interface TorrentHistoryResponse {
	items: TorrentHistoryItem[]
	currentPage: number
	pageSize: number
	totalItems: number
	totalPages: number
	counts: Record<TorrentFilter, number>
	resolutionOptions: string[]
}

export type TorrentHistoryListResponse = ApiEnvelope<TorrentHistoryResponse>

export interface FingerprintComboBreakdown {
	source?: string
	episodeTag?: string
	isMultisub: boolean
	count: number
	minEpisode?: string
	maxEpisode?: string
	missingEpisodes?: string[]
}

export interface WatchTargetRow {
	target: WatchTarget
	rootPath?: string
	rootName: string
	matchingFilesCount?: number
	fingerprintCombos?: FingerprintComboBreakdown[]
}

export interface WatchTargetQuery {
	page?: number
	pageSize?: number
	query?: string
	resolutionFilter?: string
	rootFilter?: string
}

export interface WatchTargetResponse {
	items: WatchTargetRow[]
	currentPage: number
	pageSize: number
	totalItems: number
	totalPages: number
	resolutionCounts: Record<string, number>
	resolutionOptions: string[]
	rootCounts: Record<string, number>
	rootOptions: string[]
}

export type WatchTargetListResponse = ApiEnvelope<WatchTargetResponse>

export interface BlacklistQuery {
	page?: number
	pageSize?: number
	query?: string
	resolutionFilter?: string
}

export interface BlacklistResponse {
	items: BlacklistEntry[]
	currentPage: number
	pageSize: number
	totalItems: number
	totalPages: number
	resolutionCounts: Record<string, number>
	resolutionOptions: string[]
}

export type BlacklistListResponse = ApiEnvelope<BlacklistResponse>

export interface BlacklistAddRequest {
	series?: string
	resolution?: string
	torrentId?: string
}

export interface BlacklistAddResult {
	key: string
	removedPending: number
	items: BlacklistEntry[]
}

export type BlacklistAddResponse = ApiEnvelope<BlacklistAddResult>

export type ListResponse<T> = ApiEnvelope<T>

export type ReportResponse = ApiEnvelope<DailyReport>

export interface FolderTitleVariations {
	fullMeta: string
	onlyRes: string
}

export type FolderTitleVariationKey = keyof FolderTitleVariations

export interface FolderOptionsData {
	fromTitle: FolderTitleVariations
	fromFilename: FolderTitleVariations
	watchRoots: WatchRootStatus[]
}

export type FolderOptionsResponse = ApiEnvelope<FolderOptionsData>

export interface ApiErrorBody {
	success: false
	error: string
	details?: unknown
}