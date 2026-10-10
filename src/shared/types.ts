export type TorrentFilter = 'all' | 'auto_downloaded' | 'already_downloaded' | 'blocked' | 'pending' | 'approved' | 'skipped'

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
	category?: string
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
	watchRootStatuses?: WatchRootStatus[]
}

export interface EraiRawsStatus {
	configured: boolean
	status: 'unknown' | 'ok' | 'expired'
	loggedInAs?: string
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
	customQuery?: string
	queryKey?: string
	pagesScanned: number
	inspectedCount: number
	found: boolean
	reason: string
	nyaaResultsText?: string
	nyaaResultsLast?: number
	nyaaResultsTotal?: number
	hasNextPage?: boolean
	mode?: 'needs_review' | 'page_completed' | 'found_already_downloaded' | 'no_items'
	currentPage?: number
	currentItemIndex?: number
	nextPage?: number
	nextItemIndex?: number
	nextCursorToken?: string
	wholePage?: boolean
	autoApproved?: BootstrapAutoDecisionSummary[]
	autoRejected?: BootstrapAutoDecisionSummary[]
	alreadyDownloaded?: BootstrapAutoDecisionSummary[]
	backfilled?: BootstrapAutoDecisionSummary[]
	// Items that needed review: status starts as 'pending' and is updated in place when the user approves/blacklists/skips them.
	manual?: BootstrapAutoDecisionSummary[]
	// Items whose qBittorrent submit failed before a decision was saved (retry them from the qBittorrent failures list).
	qbFailed?: BootstrapAutoDecisionSummary[]
	// Number of torrents on the scraped Nyaa page, to show how many of them are listed.
	pageItemCount?: number
	actionItem?: PendingItem
	torrentId?: string
	title?: string
	page?: number
	checkpoint?: LastProcessed
	watchTargetsIssue?: WatchTargetsIssue
}

export type WatchTargetsIssueKind = 'no_roots_configured' | 'roots_offline' | 'no_series_found'

export interface WatchTargetsIssue {
	kind: WatchTargetsIssueKind
	configuredRoots: number
	offlineRoots: string[]
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
	category?: string
	sizeText?: string
	page: number
	itemIndex: number
}

export interface WatchRootStatus {
	path: string
	exists: boolean
	isDirectory: boolean
	watchTargetsCount: number
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

export interface QbittorrentFailuresFile {
	items: QbittorrentFailureItem[]
}

export interface QbittorrentAddResponsesFile {
	items: QbittorrentAddApiResponseItem[]
}

// Everything the Nyaa /view/<id> page exposes, saved as data/YYYY-MM/<torrentId>.json
// (YYYY-MM = month the torrent was first classified by NYAADL).
export interface NyaaTorrentDetail {
	torrentId: string
	url: string
	fetchedAtUtc: string
	title: string
	category?: string
	categoryIds: string[]
	publishedAtUtc?: string
	submitter?: string
	submitterRank?: string
	information?: string
	sizeText?: string
	seeders?: number
	leechers?: number
	completed?: number
	infoHash?: string
	magnet?: string
	descriptionMarkdown?: string
	files: Array<{ path: string; sizeText?: string }>
	comments: Array<{ user: string; postedAtUtc?: string; text: string }>
}

export interface TorrentDetailsPayload {
	nyaa: NyaaTorrentDetail
	// Set when `information` points at an erai-raws series: key of data/series/<slug>/.
	seriesSlug?: string
	// Series sources already saved on disk (the others get a "not downloaded yet" marker on their tab).
	savedSources?: SeriesSource[]
}

// data/series/<slug>/erai.json
export interface EraiRawsSeries {
	url: string
	slug: string
	fetchedAtUtc: string
	title: string
	synopsis?: string
	imageUrl?: string
	links: Array<{ label: string; url: string }>
}

// data/series/<slug>/erai-releases.json
export interface EraiRawsReleasesFile {
	fetchedAtUtc: string
	releases: EraiRawsRelease[]
}

export interface EraiRawsRelease {
	type?: string
	title: string
	url?: string
	releasedAt?: string
	subtitles: string[]
	variants: Array<{ resolution: string; sizeText?: string; source?: string }>
}

export interface EraiRawsSeriesDetails {
	series: EraiRawsSeries
	releases: EraiRawsRelease[]
}

// data/series/<slug>/mal.json
export interface MalDetails {
	url: string
	fetchedAtUtc: string
	title: string
	englishTitle?: string
	imageUrl?: string
	score?: string
	rank?: string
	popularity?: string
	members?: string
	synopsis?: string
	info: Array<{ label: string; value: string }>
	videos: Array<{ title: string; youtubeId: string }>
	// First page of /reviews (absent in files saved before reviews were added).
	reviews?: MalReview[]
}

export interface MalReview {
	user: string
	postedAt?: string
	// "Recommended" | "Mixed Feelings" | "Not Recommended"
	verdict?: string
	// e.g. "Preliminary (3/12 eps)"
	preliminary?: string
	score?: number
	reactions?: number
	text: string
	url?: string
}

// data/series/<slug>/anidb.json
export interface AnidbDetails {
	aid: string
	url: string
	fetchedAtUtc: string
	titles: Array<{ type: string; lang: string; title: string }>
	type?: string
	episodeCount?: number
	startDate?: string
	endDate?: string
	ratings: Array<{ kind: string; value: string; count?: number }>
	tags: Array<{ name: string; weight: number; description?: string }>
	description?: string
	imageUrl?: string
	// The fields below came later: files saved before them don't have them.
	season?: string
	officialUrl?: string
	resources?: Array<{ label: string; url: string }>
	creators?: Array<{ role: string; name: string }>
	characters?: Array<{ name: string; role: string; seiyuu?: string }>
	episodes?: Array<{ number: string; title?: string; airDate?: string; lengthMinutes?: number; rating?: string; summary?: string }>
	recommendations?: Array<{ type: string; text: string }>
	related?: Array<{ aid: string; relation: string; title: string }>
}

export type SeriesSource = 'erai' | 'mal' | 'anidb'

export interface SeriesSourcePayload<T> {
	data: T | null
	// Why data is null (series has no link to that site).
	reason?: string
}

export interface AnidbClientStatus {
	configured: boolean
	client?: string
	clientver?: string
}