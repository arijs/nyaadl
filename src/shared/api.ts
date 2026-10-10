import type { AnidbClientStatus, AppStatus, BlacklistEntry,EraiRawsStatus,BootstrapDiscoveryResult, DailyReport, DecisionStatus, PendingItem, QbittorrentFailureItem, QbittorrentRuntimeConfig, TorrentFilter, TorrentHistoryItem, TorrentItem, WatchRootStatus, WatchTarget } from './types'

export interface ApiEnvelope<T> {
	success: boolean
	data: T
}

export interface StatusPayload {
	status: AppStatus
	queue: PendingItem[]
	qbittorrentConfig: QbittorrentRuntimeConfig
	qbittorrentFailures: QbittorrentFailureItem[]
	eraiRaws: EraiRawsStatus
	anidb: AnidbClientStatus
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
	key: string
	source?: string
	episodeTag?: string
	isMultisub: boolean
	count: number
	minEpisode?: string
	maxEpisode?: string
	missingEpisodes?: string[]
}

// A local video file of a watch target, with the torrent it came from when the decision history knows it.
export interface WatchTargetFile {
	name: string
	comboKey: string
	episode?: string
	sizeBytes?: number
	torrent?: {
		torrentId: string
		status: DecisionStatus
		item: TorrentItem
	}
	// Only for files the decision history doesn't know: the qBittorrent torrent whose content is this file.
	qbittorrent?: QbittorrentTorrentSummary
}

export interface QbittorrentTorrentSummary {
	hash: string
	name: string
	// false when qBittorrent didn't answer: only what the local index keeps (no state, progress, ratio or swarm).
	live: boolean
	state?: string
	progress?: number
	sizeBytes: number
	addedOn?: number
	completionOn?: number
	ratio?: number
	numComplete?: number
	numIncomplete?: number
	tags?: string
	category?: string
	// From the torrent comment ("https://nyaa.si/view/<id>") when it came from Nyaa.
	nyaaTorrentId?: string
}

// The local copy of qBittorrent's torrent list (data/qbittorrent-index.jsonl.gz); rebuilt only on request.
export interface QbittorrentIndexStatus {
	torrents: number
	fullSyncAt?: string
	newTorrentsCheckedAt?: string
}

export interface WatchTargetFilesResponse {
	files: WatchTargetFile[]
	qbittorrentIndex: QbittorrentIndexStatus
	// Set when qBittorrent couldn't be reached; files are still listed with what the history and the index know.
	qbittorrentError?: string
}

// Details downloader: walks the watch targets and saves Nyaa (first file), Erai, MAL and AniDB data.
export type DetailsCrawlerSource = 'nyaa' | 'erai' | 'mal' | 'anidb'
export type DetailsCrawlerStepResult = 'cached' | 'fetched' | 'no-link' | 'no-torrent' | 'skipped' | 'error'

export interface DetailsCrawlerEntry {
	folderName: string
	rootName: string
	torrentId?: string
	slug?: string
	steps: Record<DetailsCrawlerSource, DetailsCrawlerStepResult>
	error?: string
	atUtc: string
}

export interface DetailsCrawlerStatus {
	state: 'idle' | 'running' | 'stopping' | 'stopped' | 'finished'
	startedAtUtc?: string
	finishedAtUtc?: string
	stopReason?: string
	total: number
	position: number
	current?: { folderName: string; rootName: string }
	counts: Record<DetailsCrawlerSource, Record<DetailsCrawlerStepResult, number>>
	// Newest first, capped.
	recent: DetailsCrawlerEntry[]
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