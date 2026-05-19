export type DecisionStatus = 'auto_downloaded' | 'already_downloaded' | 'blocked' | 'pending' | 'approved' | 'skipped'

export type QbittorrentFailureKind = 'auth' | 'timeout' | 'unreachable' | 'http'
export type QbittorrentFailureSource = 'bootstrap' | 'scrape' | 'manual_approve'

export interface TorrentItem {
	torrentId: string
	title: string
	viewUrl: string
	downloadUrl: string
	page: number
	publishedAtUtc?: string
	sizeText?: string
	seeders?: number
	leechers?: number
	downloads?: number
	seriesBaseRaw: string
	resolution: string
	matchCandidates: string[]
}

export interface WatchTarget {
	folderName: string
	folderPath: string
	seriesKey: string
	resolution: string
	normalizedKey: string
	matchCandidates: string[]
}

export interface BlacklistEntry {
	key: string
	seriesKey: string
	resolution: string
}

export interface PendingItem {
	torrentId: string
	status: DecisionStatus
	reason: string
	item: TorrentItem
	seriesKey?: string
	internalNames?: string[]
}

export interface DecisionRecord {
	torrentId: string
	status: DecisionStatus
	reason: string
	createdAtUtc: string
	item: TorrentItem
}

export interface TorrentHistoryItem extends DecisionRecord {
	seriesKey: string
	internalNames?: string[]
}

export interface DailyReportItem {
	torrentId: string
	status: DecisionStatus
	reason: string
	createdAtUtc: string
	title: string
	seriesBaseRaw: string
	resolution: string
	page: number
}

export interface DailyReport {
	date: string
	generatedAtUtc: string
	total: number
	byStatus: Record<DecisionStatus, number>
	items: DailyReportItem[]
}

export interface LastProcessed {
	lastTorrentId?: string
	lastSeenPage?: number
	lastRunAt: string
	bootstrapMode: 'assisted' | 'checkpoint'
}

export interface AppStatus {
	watchTargetsCount: number
	pendingCount: number
	blockedCount: number
	autoCount: number
	alreadyDownloadedCount: number
	downloadedCount: number
	qbittorrentFailureCount: number
	nextPages: number[]
	lastProcessed?: LastProcessed
	watchRoots: string[]
	watchRootStatuses?: WatchRootStatus[]
	lastBootstrapDiscovery?: BootstrapDiscoveryResult
}

export interface QbittorrentRuntimeConfig {
	baseUrl: string
	username: string
	hasPassword: boolean
}

export interface QbittorrentFailureItem {
	torrentId: string
	createdAtUtc: string
	source: QbittorrentFailureSource
	decisionStatus: Extract<DecisionStatus, 'auto_downloaded' | 'approved'>
	decisionReason: string
	item: TorrentItem
	targetFolderPath: string
	torrentFilePath: string
	torrentFilename: string
	errorKind: QbittorrentFailureKind
	errorMessage: string
	suggestion?: string
	seriesKey?: string
	internalNames?: string[]
}

export interface QbittorrentAddApiResponseItem {
	torrentId: string
	createdAtUtc: string
	source: QbittorrentFailureSource
	decisionStatus: Extract<DecisionStatus, 'auto_downloaded' | 'approved'>
	decisionReason: string
	requestBaseUrl: string
	targetFolderPath: string
	torrentFilename: string
	forceResubmit?: boolean
	ok: boolean
	status?: number
	statusText?: string
	responseText?: string
	errorKind?: QbittorrentFailureKind
	errorMessage?: string
}

export interface BootstrapDiscoveryResult {
	startedAtUtc: string
	finishedAtUtc: string
	pagesScanned: number
	inspectedCount: number
	found: boolean
	reason: string
	mode?: 'needs_review' | 'page_completed' | 'found_already_downloaded' | 'no_items'
	currentPage?: number
	currentItemIndex?: number
	nextPage?: number
	nextItemIndex?: number
	nextCursorToken?: string
	autoApproved?: BootstrapAutoDecisionSummary[]
	autoRejected?: BootstrapAutoDecisionSummary[]
	alreadyDownloaded?: BootstrapAutoDecisionSummary[]
	backfilled?: BootstrapAutoDecisionSummary[]
	actionItem?: PendingItem
	torrentId?: string
	title?: string
	page?: number
	checkpoint?: LastProcessed
}

export interface BootstrapAutoDecisionSummary {
	torrentId: string
	title: string
	status: DecisionStatus
	reason: string
	fileMissing?: boolean
	newlyFound?: boolean
	resubmittedFromNyaa?: boolean
	qbResponseText?: string
	page: number
	itemIndex: number
}

export interface WatchRootStatus {
	path: string
	exists: boolean
	isDirectory: boolean
	issue?: string
}

export interface FolderConfigFile {
	folders?: string[]
	paths?: string[]
	watchRoots?: string[]
}

export interface AliasMapFile {
	aliases: Record<string, string>
}

export interface BlacklistFile {
	items: string[]
}

export interface BootstrapDiscoveryFile {
	result?: BootstrapDiscoveryResult
}

export interface PendingFile {
	items: PendingItem[]
}

export interface DecisionsFile {
	items: DecisionRecord[]
}

export interface QbittorrentFailuresFile {
	items: QbittorrentFailureItem[]
}

export interface QbittorrentAddResponsesFile {
	items: QbittorrentAddApiResponseItem[]
}