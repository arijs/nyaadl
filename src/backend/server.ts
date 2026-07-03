import path from 'node:path'
import { H3, getQuery, readBody } from 'h3'
import { toNodeHandler } from 'h3/node'
import { mkdir, readFile } from 'node:fs/promises'
import { advanceCheckpoint, determineScrapePages } from './services/checkpointService'
import { discoverLastDownloadedCheckpointStep } from './services/bootstrapDiscoveryService'
import { badRequest, notFound } from './services/apiErrorService'
import { addWatchRoot, loadAliases, removeWatchRoot, validateWatchRootPath } from './services/watchlistService'
import { downloadTorrentFile, findDownloadedTorrentFileById } from './services/downloaderService'
import { getQbittorrentRuntimeConfig, updateQbittorrentRuntimeConfig } from './services/qbittorrentService'
import { buildDailyReport } from './services/reportService'
// If nyaaScraperServiceStream fails, you can use the cheerio version below
// import { scrapeNyaaPage } from './services/nyaaScraperService'
import { scrapeNyaaPage } from './services/nyaaScraperServiceStream'
import { inspectAndClassifyTorrent, savePageSnapshot } from './services/nyaaTorrentService'
import { parseTorrentMetainfo } from './services/torrentMetainfoService'
import { loadBlacklist, saveBlacklist, saveBootstrapDiscovery, saveDecisions, saveLastProcessed, savePending, saveQbittorrentSubmitted } from './services/stateService'
import { buildNormalizedKey, deriveSeriesBase, deriveFolderNameFromTitle } from './services/normalizeService'
import { listDecisionTorrentIds, listPendingTorrentIds } from './services/stateService'
import { buildTorrentHistoryPage } from './services/torrentHistoryService'
import { buildBlacklistPage, parseBlacklistEntry } from './services/blacklistService'
import { buildWatchTargetPage } from './services/watchTargetService'
import { countMatchingLocalFiles, analyzeFingerprintCombos } from './services/localLibraryService'
import {
	blacklistState,
	bootstrapDiscoveryState,
	decisionsState,
	ensureInitialData,
	lastProcessedState,
	pendingState,
	qbittorrentFailuresState,
	qbittorrentSubmittedState,
	refreshWatchRoots,
	refreshWatchTargets,
	setBootstrapDiscoveryState,
	setLastProcessedState,
	torrentsState,
	watchRootsState,
	watchRootStatusesState,
	watchTargetsState,
} from './services/runtimeStateService'
import {
	createDecisionRecord,
	finalizeSuccessfulTorrent,
	resolveTorrentTarget,
	sanitizeInternalNames,
	submitDownloadedTorrent,
} from './services/decisionWorkflowService'
import type { AppStatus, BlacklistEntry, DecisionRecord, LastProcessed, PendingItem, QbittorrentFailureItem, TorrentFilter, TorrentItem, WatchRootStatus, WatchTarget } from '@shared/types'

const serverPort = 8900


interface ScrapeRunBody {
	pages?: number[]
}

interface SeedWatchlistBody {
	targets?: WatchTarget[]
}

interface WatchRootBody {
	folderPath?: string
}

interface BootstrapDiscoverStepBody {
	page?: number
	itemIndex?: number
	cursorToken?: string
	qbForceResubmit?: boolean
	customQuery?: string
	wholePage?: boolean
}

interface QbittorrentConfigBody {
	baseUrl?: string
	username?: string
	password?: string
}

interface ApproveBody {
	rootPath?: string
	seriesFolder?: string
}

function rememberDownloadedTorrent(item: TorrentItem): void {
	if (torrentsState.some((torrent) => torrent.torrentId === item.torrentId)) {
		return
	}
	torrentsState.push(item)
}

function hydrateDownloadedTorrents(): void {
	torrentsState.splice(0, torrentsState.length)
	for (const decision of decisionsState) {
		if (decision.status === 'auto_downloaded' || decision.status === 'approved') {
			rememberDownloadedTorrent(decision.item)
		}
	}
}

function listFailedQbittorrentIds(): Set<string> {
	return new Set(qbittorrentFailuresState.map((item) => item.torrentId))
}

function buildWatchRootStatusesWithCounts(): WatchRootStatus[] {
	return watchRootStatusesState.map((status) => {
		const watchTargetsCount = watchTargetsState.filter((target) => target.folderPath.toLowerCase().startsWith(status.path.toLowerCase())).length
		return {
			...status,
			watchTargetsCount,
		}
	})
}

function buildStatus(): AppStatus {
	const plan = determineScrapePages(lastProcessedState)
	return {
		watchTargetsCount: watchTargetsState.length,
		pendingCount: pendingState.length,
		blockedCount: decisionsState.filter((item) => item.status === 'blocked').length,
		autoCount: decisionsState.filter((item) => item.status === 'auto_downloaded').length,
		alreadyDownloadedCount: decisionsState.filter((item) => item.status === 'already_downloaded').length,
		downloadedCount: torrentsState.length,
		qbittorrentFailureCount: qbittorrentFailuresState.length,
		nextPages: plan.pages,
		lastProcessed: lastProcessedState,
		watchRootStatuses: buildWatchRootStatusesWithCounts(),
	}
}

async function approvePendingItemByIndex(pendingIndex: number, approveBody?: ApproveBody): Promise<DecisionRecord> {
	const pendingItem = pendingState[pendingIndex]!
	const aliases = await loadAliases()
	const downloadedTorrent = await downloadTorrentFile(pendingItem.item)
	let resolvedInternalNames = sanitizeInternalNames(pendingItem.internalNames)
	if (resolvedInternalNames.length === 0) {
		const metainfo = await readFile(downloadedTorrent.filePath)
			.then((buffer) => parseTorrentMetainfo(buffer))
			.catch(() => undefined)
		if (metainfo) {
			resolvedInternalNames = sanitizeInternalNames(metainfo.videoNames.length > 0 ? metainfo.videoNames : [metainfo.name])
		}
	}
	if (resolvedInternalNames.length === 0) {
		const filenameCandidate = downloadedTorrent.filename
			.replace(new RegExp(`-${pendingItem.item.torrentId}\\.torrent$`, 'i'), '')
			.replace(/\.torrent$/i, '')
			.trim()
		resolvedInternalNames = sanitizeInternalNames([filenameCandidate])
	}
	let targetFolderPath: string
	const rootPath = approveBody?.rootPath?.trim()
	const seriesFolder = approveBody?.seriesFolder?.trim()
	if (rootPath && seriesFolder) {
		const normalizedRoot = path.resolve(rootPath)
		if (!watchRootsState.some((r) => path.resolve(r) === normalizedRoot)) {
			await addWatchRoot(rootPath)
			await refreshWatchRoots()
		}
		targetFolderPath = path.join(normalizedRoot, seriesFolder)
		await mkdir(targetFolderPath, { recursive: true }).catch(() => undefined)
		await refreshWatchTargets()
	} else {
		targetFolderPath = resolveTorrentTarget(pendingItem.item, resolvedInternalNames, aliases).folderPath
	}
	pendingState.splice(pendingIndex, 1)
	await savePending(pendingState)
	await submitDownloadedTorrent({
		item: pendingItem.item,
		torrentFilePath: downloadedTorrent.filePath,
		torrentFilename: downloadedTorrent.filename,
		targetFolderPath,
		decisionStatus: 'approved',
		decisionReason: `approved manually -> ${downloadedTorrent.filename}`,
		source: 'manual_approve',
		seriesKey: pendingItem.seriesKey ?? pendingItem.item.seriesBaseRaw,
		internalNames: resolvedInternalNames,
	})
	const decision = await finalizeSuccessfulTorrent({
		item: pendingItem.item,
		decisionStatus: 'approved',
		decisionReason: `approved manually -> ${downloadedTorrent.filename}`,
		seriesKey: pendingItem.seriesKey ?? pendingItem.item.seriesBaseRaw,
		internalNames: resolvedInternalNames,
	})
	decisionsState.push(decision)
	await savePending(pendingState)
	await saveDecisions(decisionsState)
	return decision
}

async function runScrapeForPage(page: number, bootstrapMode: LastProcessed['bootstrapMode']): Promise<{ auto: number; alreadyDownloaded: number; blocked: number; pending: number }> {
	const aliases = await loadAliases()
	const { html, items } = await scrapeNyaaPage(page)
	await savePageSnapshot(page, html, items)
	const processedTorrentIds = listDecisionTorrentIds(decisionsState)
	const pendingTorrentIds = listPendingTorrentIds(pendingState)
	const qbittorrentFailedIds = listFailedQbittorrentIds()

	let auto = 0
	let alreadyDownloaded = 0
	let blocked = 0
	let pending = 0

	for (const item of items) {
		if (processedTorrentIds.has(item.torrentId) || pendingTorrentIds.has(item.torrentId) || qbittorrentFailedIds.has(item.torrentId)) {
			continue
		}
		const classified = await inspectAndClassifyTorrent(item, aliases, watchTargetsState, blacklistState)
		if (classified.status === 'pending') {
			const decision = createDecisionRecord(classified, 'pending', classified.reason)
			decisionsState.push(decision)
			processedTorrentIds.add(item.torrentId)
			pendingState.push({
				torrentId: classified.torrentId,
				status: classified.status,
				reason: classified.reason,
				item: classified,
				seriesKey: classified.seriesKey,
				internalNames: classified.internalNames,
			})
			pendingTorrentIds.add(item.torrentId)
			pending++
		}
		if (classified.status === 'blocked') {
			const decision = createDecisionRecord(classified, 'blocked', classified.reason)
			decisionsState.push(decision)
			processedTorrentIds.add(item.torrentId)
			blocked++
		}
		if (classified.status === 'already_downloaded') {
			const decision = createDecisionRecord(classified, 'already_downloaded', classified.reason)
			decisionsState.push(decision)
			processedTorrentIds.add(item.torrentId)
			alreadyDownloaded++
		}
		if (classified.status === 'auto_downloaded') {
			const downloadedTorrent = await downloadTorrentFile(classified)
			const target = classified.matchedTarget ?? resolveTorrentTarget(classified, classified.internalNames ?? [], aliases)
			await submitDownloadedTorrent({
				item: classified,
				torrentFilePath: downloadedTorrent.filePath,
				torrentFilename: downloadedTorrent.filename,
				targetFolderPath: target.folderPath,
				decisionStatus: 'auto_downloaded',
				decisionReason: classified.reason,
				source: 'scrape',
				seriesKey: classified.matchedTarget?.seriesKey ?? classified.seriesKey,
				internalNames: classified.internalNames,
			})
			const decision = await finalizeSuccessfulTorrent({
				item: classified,
				decisionStatus: 'auto_downloaded',
				decisionReason: classified.reason,
				seriesKey: classified.matchedTarget?.seriesKey ?? classified.seriesKey,
				internalNames: classified.internalNames,
			})
			decisionsState.push(decision)
			processedTorrentIds.add(item.torrentId)
			auto++
		}
		setLastProcessedState({
			lastTorrentId: classified.torrentId,
			lastSeenPage: page,
			lastRunAt: new Date().toISOString(),
			bootstrapMode,
		})
	}

	await savePending(pendingState)
	await saveDecisions(decisionsState)
	if (lastProcessedState) {
		await saveLastProcessed(lastProcessedState)
	}

	return { auto, alreadyDownloaded, blocked, pending }
}

async function retryQbittorrentFailureById(torrentId: string): Promise<DecisionRecord> {
	const failure = qbittorrentFailuresState.find((item) => item.torrentId === torrentId)
	if (!failure) {
		throw notFound('Failed qBittorrent submission not found')
	}
	await submitDownloadedTorrent({
		item: failure.item,
		torrentFilePath: failure.torrentFilePath,
		torrentFilename: failure.torrentFilename,
		targetFolderPath: failure.targetFolderPath,
		decisionStatus: failure.decisionStatus,
		decisionReason: failure.decisionReason,
		source: failure.source,
		seriesKey: failure.seriesKey,
		internalNames: failure.internalNames,
	})
	const decision = await finalizeSuccessfulTorrent({
		item: failure.item,
		decisionStatus: failure.decisionStatus,
		decisionReason: failure.decisionReason,
		seriesKey: failure.seriesKey,
		internalNames: failure.internalNames,
	})
	decisionsState.push(decision)
	await saveDecisions(decisionsState)
	return decision
}

async function suppressQbittorrentFailureById(torrentId: string): Promise<DecisionRecord> {
	const failure = qbittorrentFailuresState.find((item) => item.torrentId === torrentId)
	if (!failure) {
		throw notFound('Failed qBittorrent submission not found')
	}
	qbittorrentSubmittedState.add(torrentId)
	await saveQbittorrentSubmitted(qbittorrentSubmittedState)
	const decision = await finalizeSuccessfulTorrent({
		item: failure.item,
		decisionStatus: failure.decisionStatus,
		decisionReason: `${failure.decisionReason} (qBittorrent submission suppressed by user)`,
		seriesKey: failure.seriesKey,
		internalNames: failure.internalNames,
	})
	decisionsState.push(decision)
	await saveDecisions(decisionsState)
	return decision
}

async function main(): Promise<void> {
	await ensureInitialData()
	await refreshWatchRoots()
	await refreshWatchTargets()
	hydrateDownloadedTorrents()

	const app = new H3({
		onError(error, event) {
			console.error('Unhandled h3 error', error)
			if (event) {
				event.res.headers.set('content-type', 'application/json; charset=utf-8')
			}
		},
	})

	app.get('/api/status', async () => {
		await refreshWatchRoots()
		return {
			success: true,
			data: {
				status: buildStatus(),
				queue: pendingState,
				qbittorrentConfig: getQbittorrentRuntimeConfig(),
				qbittorrentFailures: qbittorrentFailuresState,
			},
		}
	})

	app.post('/api/qbittorrent/config', async (event) => {
		const body = await readBody<QbittorrentConfigBody>(event).catch(() => undefined)
		const config = updateQbittorrentRuntimeConfig({
			baseUrl: body?.baseUrl,
			username: body?.username,
			password: body?.password,
		})
		return { success: true, data: config }
	})

	app.post('/api/qbittorrent/failures/:id/retry', async (event) => {
		const torrentId = event.context.params?.id
		if (!torrentId) {
			throw badRequest('Missing torrent id')
		}
		const decision = await retryQbittorrentFailureById(torrentId)
		return { success: true, data: { decision, status: buildStatus(), qbittorrentFailures: qbittorrentFailuresState } }
	})

	app.post('/api/qbittorrent/failures/:id/suppress', async (event) => {
		const torrentId = event.context.params?.id
		if (!torrentId) {
			throw badRequest('Missing torrent id')
		}
		const decision = await suppressQbittorrentFailureById(torrentId)
		return { success: true, data: { decision, status: buildStatus(), qbittorrentFailures: qbittorrentFailuresState } }
	})

	app.post('/api/watchlist/folders/refresh', async () => {
		await refreshWatchRoots()
		await refreshWatchTargets()
		return { success: true, data: { watchRoots: watchRootsState, watchRootStatuses: watchRootStatusesState, status: buildStatus() } }
	})

	app.get('/api/watchlist/folders', () => ({ success: true, data: watchRootsState }))

	app.post('/api/watchlist/folders', async (event) => {
		const body = await readBody<WatchRootBody>(event).catch(() => undefined)
		const folderPath = body?.folderPath?.trim()
		if (!folderPath) {
			throw badRequest('Missing folder path')
		}
		let normalizedRoot: string
		try {
			normalizedRoot = await validateWatchRootPath(folderPath)
		} catch (error) {
			throw badRequest(error instanceof Error ? error.message : 'Invalid folder path')
		}
		const roots = await addWatchRoot(normalizedRoot)
		await refreshWatchRoots()
		const targets = await refreshWatchTargets()
		return { success: true, data: { watchRoots: roots, watchRootStatuses: watchRootStatusesState, watchTargets: targets, status: buildStatus() } }
	})

	app.delete('/api/watchlist/folders', async (event) => {
		const body = await readBody<WatchRootBody>(event).catch(() => undefined)
		const folderPath = body?.folderPath?.trim()
		if (!folderPath) {
			throw badRequest('Missing folder path')
		}
		const roots = await removeWatchRoot(folderPath)
		await refreshWatchRoots()
		const targets = await refreshWatchTargets()
		return { success: true, data: { watchRoots: roots, watchRootStatuses: watchRootStatusesState, watchTargets: targets, status: buildStatus() } }
	})

	app.post('/api/scrape/run', async (event) => {
		const body = await readBody<ScrapeRunBody>(event).catch(() => undefined)
		const plan = determineScrapePages(lastProcessedState, body?.pages)
		const summaries: Array<{ page: number; auto: number; alreadyDownloaded: number; blocked: number; pending: number }> = []
		for (const page of plan.pages) {
			const summary = await runScrapeForPage(page, plan.bootstrapMode)
			summaries.push({ page, ...summary })
		}
		return { success: true, data: { summaries, status: buildStatus() } }
	})

	app.post('/api/bootstrap/discover-last-downloaded', async (event) => {
		const body = await readBody<BootstrapDiscoverStepBody>(event).catch(() => undefined)
		const result = await discoverLastDownloadedCheckpointStep(body)
		return { success: true, data: { result, status: buildStatus() } }
	})

	app.get('/api/bootstrap/discover-last-downloaded', async () => ({ success: true, data: { result: bootstrapDiscoveryState } }))

	app.post('/api/bootstrap/discovery/clear', async () => {
		setBootstrapDiscoveryState(undefined)
		await saveBootstrapDiscovery(undefined)
		return { success: true, data: { status: buildStatus() } }
	})

	app.get('/api/watchlist', () => ({ success: true, data: watchTargetsState }))
	app.get('/api/pending', () => ({ success: true, data: pendingState }))
	app.post('/api/watchlist/targets', async (event) => {
		const body = await readBody<{
			page?: number
			pageSize?: number
			query?: string
			resolutionFilter?: string
			rootFilter?: string
		}>(event).catch(() => undefined)
		const page = buildWatchTargetPage(watchTargetsState, watchRootsState, {
			page: body?.page,
			pageSize: body?.pageSize,
			query: body?.query,
			resolutionFilter: body?.resolutionFilter,
			rootFilter: body?.rootFilter,
		})
		page.items = await Promise.all(
			page.items.map(async (row) => ({
				...row,
				matchingFilesCount: await countMatchingLocalFiles(row.target),
				fingerprintCombos: await analyzeFingerprintCombos(row.target),
			})),
		)
		return { success: true, data: page }
	})
	app.post('/api/torrents/history', async (event) => {
		const body = await readBody<{
			page?: number
			pageSize?: number
			filter?: TorrentFilter
			fromDate?: string
			toDate?: string
			titleQuery?: string
			excludeTitleQuery?: string
			resolutionFilter?: string
		}>(event).catch(() => undefined)
		const page = buildTorrentHistoryPage(decisionsState, {
			page: body?.page,
			pageSize: body?.pageSize,
			filter: body?.filter,
			fromDate: body?.fromDate,
			toDate: body?.toDate,
			titleQuery: body?.titleQuery,
			excludeTitleQuery: body?.excludeTitleQuery,
			resolutionFilter: body?.resolutionFilter,
		})
		return { success: true, data: page }
	})
	app.get('/api/blacklist', async (event) => {
		const persistedItems = await loadBlacklist()
		blacklistState.splice(0, blacklistState.length, ...persistedItems)
		const query = getQuery(event)
		const page = buildBlacklistPage(blacklistState, {
			page: typeof query.page === 'string' ? Number(query.page) : undefined,
			pageSize: typeof query.pageSize === 'string' ? Number(query.pageSize) : undefined,
			query: typeof query.query === 'string' ? query.query : undefined,
			resolutionFilter: typeof query.resolutionFilter === 'string' ? query.resolutionFilter : undefined,
		})
		return { success: true, data: page }
	})

	app.delete('/api/blacklist', async (event) => {
		const body = await readBody<{ key?: string }>(event).catch(() => undefined)
		const key = body?.key?.trim()
		if (!key) {
			throw badRequest('Missing blacklist key')
		}

		const index = blacklistState.findIndex((item) => item === key)
		if (index < 0) {
			throw notFound('Blacklist item not found')
		}

		blacklistState.splice(index, 1)
		await saveBlacklist(blacklistState)
		return { success: true, data: { removed: key, items: blacklistState.map(parseBlacklistEntry) } }
	})

	app.get('/api/pending/:id/folder-options', async (event) => {
		const torrentId = event.context.params?.id
		if (!torrentId) {
			throw badRequest('Missing torrent id')
		}
		const pendingItem = pendingState.find((item) => item.torrentId === torrentId)
		if (!pendingItem) {
			throw notFound('Pending item not found')
		}
		const fromTitle = deriveFolderNameFromTitle(pendingItem.item.title)
		let resolvedInternalNames = sanitizeInternalNames(pendingItem.internalNames)
		if (resolvedInternalNames.length === 0) {
			const existing = await findDownloadedTorrentFileById(torrentId)
			const filePath = existing?.filePath
			if (filePath) {
				const metainfo = await readFile(filePath).then((buf) => parseTorrentMetainfo(buf)).catch(() => undefined)
				if (metainfo) {
					resolvedInternalNames = sanitizeInternalNames(metainfo.videoNames.length > 0 ? metainfo.videoNames : [metainfo.name])
				}
			}
		}
		if (resolvedInternalNames.length === 0) {
			const downloaded = await downloadTorrentFile(pendingItem.item).catch(() => undefined)
			if (downloaded) {
				const metainfo = await readFile(downloaded.filePath).then((buf) => parseTorrentMetainfo(buf)).catch(() => undefined)
				if (metainfo) {
					resolvedInternalNames = sanitizeInternalNames(metainfo.videoNames.length > 0 ? metainfo.videoNames : [metainfo.name])
				}
			}
		}
		const firstInternalName = resolvedInternalNames[0]
		const fromFilename = firstInternalName ? deriveFolderNameFromTitle(firstInternalName) : fromTitle
		return {
			success: true,
			data: {
				fromTitle,
				fromFilename,
				watchRoots: watchRootStatusesState,
			},
		}
	})

	app.post('/api/pending/:id/approve', async (event) => {
		const torrentId = event.context.params?.id
		if (!torrentId) {
			throw badRequest('Missing torrent id')
		}
		const pendingIndex = pendingState.findIndex((item) => item.torrentId === torrentId)
		if (pendingIndex < 0) {
			throw notFound('Pending item not found')
		}
		const body = await readBody<ApproveBody>(event).catch(() => ({})) as ApproveBody
		const decision = await approvePendingItemByIndex(pendingIndex, body)
		return { success: true, data: decision }
	})

	app.post('/api/pending/approve-all', async () => {
		const approved: DecisionRecord[] = []
		while (pendingState.length > 0) {
			const decision = await approvePendingItemByIndex(0)
			approved.push(decision)
		}
		return { success: true, data: { approved, count: approved.length, status: buildStatus() } }
	})

	app.post('/api/pending/:id/blacklist', async (event) => {
		const torrentId = event.context.params?.id
		if (!torrentId) {
			throw badRequest('Missing torrent id')
		}
		const pendingIndex = pendingState.findIndex((item) => item.torrentId === torrentId)
		if (pendingIndex < 0) {
			throw notFound('Pending item not found')
		}
		const pendingItem = pendingState[pendingIndex]!
		const seriesKey = deriveSeriesBase(pendingItem.seriesKey ?? pendingItem.item.seriesBaseRaw)
		const blacklistKey = buildNormalizedKey(seriesKey, pendingItem.item.resolution)
		if (!blacklistState.includes(blacklistKey)) {
			blacklistState.push(blacklistKey)
		}
		pendingState.splice(pendingIndex, 1)
		const decision: DecisionRecord = {
			torrentId,
			status: 'blocked',
			reason: 'series+resolution blacklisted by user',
			createdAtUtc: new Date().toISOString(),
			item: pendingItem.item,
		}
		decisionsState.push(decision)
		await saveBlacklist(blacklistState)
		await savePending(pendingState)
		await saveDecisions(decisionsState)
		return { success: true, data: decision }
	})

	app.post('/api/pending/:id/skip', async (event) => {
		const torrentId = event.context.params?.id
		if (!torrentId) {
			throw badRequest('Missing torrent id')
		}
		const pendingItem = pendingState.find((item) => item.torrentId === torrentId)
		if (pendingItem) {
			const index = pendingState.findIndex((item) => item.torrentId === torrentId)
			pendingState.splice(index, 1)
			const decision: DecisionRecord = {
				torrentId,
				status: 'skipped',
				reason: 'skipped by user',
				createdAtUtc: new Date().toISOString(),
				item: pendingItem.item,
			}
			decisionsState.push(decision)
			await savePending(pendingState)
			await saveDecisions(decisionsState)
			return { success: true, data: decision }
		}
		return { success: true, data: null }
	})

	app.post('/api/bootstrap/next-page', async (event) => {
		const body = await readBody<{ next?: boolean }>(event).catch(() => ({ next: false }))
		const shouldAdvance = Boolean(body?.next)
		if (shouldAdvance) {
			const nextPage = Math.max(1, (lastProcessedState?.lastSeenPage ?? 1) - 1)
			setLastProcessedState(advanceCheckpoint(lastProcessedState, lastProcessedState?.lastTorrentId ?? 'bootstrap', nextPage, lastProcessedState?.bootstrapMode ?? 'assisted'))
			if (lastProcessedState) {
				await saveLastProcessed(lastProcessedState)
			}
			return { success: true, data: { next: true, page: nextPage, checkpoint: lastProcessedState } }
		}
		return { success: true, data: { next: false, checkpoint: lastProcessedState ?? null } }
	})

	app.post('/api/watchlist/seed', async (event) => {
		const body = await readBody<SeedWatchlistBody>(event).catch(() => undefined)
		const targets = body?.targets
		if (Array.isArray(targets)) {
			watchTargetsState.splice(0, watchTargetsState.length, ...targets)
		}
		return { success: true, data: watchTargetsState }
	})

	app.get('/api/reports/:date', (event) => {
		const date = event.context.params?.date ?? new Date().toISOString().slice(0, 10)
		const report = buildDailyReport(date, decisionsState)
		return { success: true, data: report }
	})

	app.get('/api/health', () => ({ success: true, data: { ok: true } }))

	const listener = toNodeHandler(app)
	const { createServer } = await import('node:http')
	createServer(listener).listen(serverPort, () => {
		console.log(`NYAADL backend listening on http://127.0.0.1:${serverPort}`)
	})
}

void main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
