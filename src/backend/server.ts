import { H3, readBody } from 'h3'
import { toNodeHandler } from 'h3/node'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { ensureDirectory, dataRoot } from './storage/jsonStore'
import { advanceCheckpoint, determineScrapePages } from './services/checkpointService'
import { badRequest, notFound } from './services/apiErrorService'
import { addWatchRoot, inspectWatchRoots, loadAliases, loadWatchRoots, removeWatchRoot, scanWatchTargets, upsertAliases, validateWatchRootPath } from './services/watchlistService'
import { downloadTorrentFile, findDownloadedTorrentFileById } from './services/downloaderService'
import { addTorrentToQbittorrent, getQbittorrentRuntimeConfig, QbittorrentRequestError, updateQbittorrentRuntimeConfig } from './services/qbittorrentService'
import { buildDailyReport } from './services/reportService'
import { inspectAndClassifyTorrent, savePageSnapshot, scrapeNyaaPage } from './services/nyaaScraperService'
import { parseTorrentMetainfo } from './services/torrentMetainfoService'
import { initStateFiles, loadBlacklist, loadBootstrapDiscovery, loadDecisions, loadLastProcessed, loadPending, loadQbittorrentAddResponses, loadQbittorrentFailures, loadQbittorrentSubmitted, saveBlacklist, saveBootstrapDiscovery, saveDecisions, saveLastProcessed, savePending, saveQbittorrentAddResponses, saveQbittorrentFailures, saveQbittorrentSubmitted } from './services/stateService'
import { findExistingLocalMatchByTitle } from './services/localLibraryService'
import { buildTorrentMatchResult, matchTorrentToWatchTargets } from './services/matchingService'
import { buildNormalizedKey } from './services/normalizeService'
import { listDecisionTorrentIds, listPendingTorrentIds } from './services/stateService'
import type { AppStatus, BootstrapAutoDecisionSummary, BootstrapDiscoveryResult, DecisionRecord, DecisionStatus, LastProcessed, PendingItem, QbittorrentAddApiResponseItem, QbittorrentFailureItem, TorrentHistoryItem, TorrentItem, WatchRootStatus, WatchTarget } from '@shared/types'

const serverPort = 8787
const watchTargetsState: WatchTarget[] = []
const torrentsState: TorrentItem[] = []
const pendingState: PendingItem[] = []
const decisionsState: DecisionRecord[] = []
const qbittorrentFailuresState: QbittorrentFailureItem[] = []
const qbittorrentAddResponsesState: QbittorrentAddApiResponseItem[] = []
let qbittorrentSubmittedState = new Set<string>()
const blacklistState: string[] = []
const watchRootsState: string[] = []
let watchRootStatusesState: WatchRootStatus[] = []
let bootstrapDiscoveryState: BootstrapDiscoveryResult | undefined
let lastProcessedState: LastProcessed | undefined

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
}

interface QbittorrentConfigBody {
	baseUrl?: string
	username?: string
	password?: string
}

async function ensureInitialData(): Promise<void> {
	await ensureDirectory(dataRoot)
	await initStateFiles()
	lastProcessedState = await loadLastProcessed()
	bootstrapDiscoveryState = await loadBootstrapDiscovery()
	blacklistState.splice(0, blacklistState.length, ...(await loadBlacklist()))
	pendingState.splice(0, pendingState.length, ...(await loadPending()))
	decisionsState.splice(0, decisionsState.length, ...(await loadDecisions()))
	qbittorrentFailuresState.splice(0, qbittorrentFailuresState.length, ...(await loadQbittorrentFailures()))
	qbittorrentAddResponsesState.splice(0, qbittorrentAddResponsesState.length, ...(await loadQbittorrentAddResponses()))
	qbittorrentSubmittedState = await loadQbittorrentSubmitted()
}

async function refreshWatchTargets(): Promise<WatchTarget[]> {
	const targets = await scanWatchTargets()
	watchTargetsState.splice(0, watchTargetsState.length, ...targets)
	return watchTargetsState
}

async function refreshWatchRoots(): Promise<string[]> {
	const roots = await loadWatchRoots()
	watchRootsState.splice(0, watchRootsState.length, ...roots)
	watchRootStatusesState = await inspectWatchRoots(roots)
	return watchRootsState
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

function buildTorrentHistory(): TorrentHistoryItem[] {
	return decisionsState.map((decision) => ({
		...decision,
		seriesKey: (decision as DecisionRecord & { seriesKey?: string }).seriesKey ?? decision.item.seriesBaseRaw.toLowerCase(),
		internalNames: (decision as DecisionRecord & { internalNames?: string[] }).internalNames,
	}))
}

async function recordTorrentAliases(seriesKey: string, internalNames: string[]): Promise<void> {
	const aliasEntries = internalNames
		.flatMap((name) => {
			const trimmed = name.trim()
			if (!trimmed) {
				return []
			}
			return [[trimmed, seriesKey], [path.parse(trimmed).name, seriesKey]] as Array<[string, string]>
		})
	await upsertAliases(aliasEntries)
}

function resolveTorrentTarget(item: TorrentItem, videoNames: string[], aliases: Record<string, string>): WatchTarget {
	const matchResult = buildTorrentMatchResult({ title: item.title, videoNames }, aliases)
	const target = matchTorrentToWatchTargets(matchResult, watchTargetsState)
	if (!target) {
		throw badRequest(
			`Unable to resolve qBittorrent destination folder for torrent ${item.torrentId} (page ${item.page}): ${item.title}`,
			{
				torrentId: item.torrentId,
				title: item.title,
				page: item.page,
			},
		)
	}
	return target
}

function listFailedQbittorrentIds(): Set<string> {
	return new Set(qbittorrentFailuresState.map((item) => item.torrentId))
}

function removeQbittorrentFailure(torrentId: string): void {
	const index = qbittorrentFailuresState.findIndex((item) => item.torrentId === torrentId)
	if (index >= 0) {
		qbittorrentFailuresState.splice(index, 1)
	}
}

function recordQbittorrentFailure(item: QbittorrentFailureItem): void {
	const index = qbittorrentFailuresState.findIndex((entry) => entry.torrentId === item.torrentId)
	if (index >= 0) {
		qbittorrentFailuresState[index] = item
		return
	}
	qbittorrentFailuresState.unshift(item)
}

async function recordQbittorrentAddResponse(item: QbittorrentAddApiResponseItem): Promise<void> {
	qbittorrentAddResponsesState.unshift(item)
	const capped = qbittorrentAddResponsesState.slice(0, 500)
	qbittorrentAddResponsesState.splice(0, qbittorrentAddResponsesState.length, ...capped)
	await saveQbittorrentAddResponses(qbittorrentAddResponsesState)
}

function createDecisionRecord(item: TorrentItem, status: DecisionStatus, reason: string): DecisionRecord {
	return {
		torrentId: item.torrentId,
		status,
		reason,
		createdAtUtc: new Date().toISOString(),
		item,
	}
}

async function persistPrimaryState(): Promise<void> {
	await savePending(pendingState)
	await saveDecisions(decisionsState)
	await saveQbittorrentFailures(qbittorrentFailuresState)
	if (lastProcessedState) {
		await saveLastProcessed(lastProcessedState)
	}
}

async function submitDownloadedTorrent(params: {
	item: TorrentItem
	torrentFilePath: string
	torrentFilename: string
	targetFolderPath: string
	decisionStatus: Extract<DecisionStatus, 'auto_downloaded' | 'approved'>
	decisionReason: string
	source: QbittorrentFailureItem['source']
	seriesKey?: string
	internalNames?: string[]
	forceResubmit?: boolean
}): Promise<{ responseText?: string }> {
	try {
		const addResult = await addTorrentToQbittorrent({
			torrentFilePath: params.torrentFilePath,
			torrentFilename: params.torrentFilename,
			savePath: params.targetFolderPath,
		})
		await recordQbittorrentAddResponse({
			torrentId: params.item.torrentId,
			createdAtUtc: new Date().toISOString(),
			source: params.source,
			decisionStatus: params.decisionStatus,
			decisionReason: params.decisionReason,
			requestBaseUrl: getQbittorrentRuntimeConfig().baseUrl,
			targetFolderPath: params.targetFolderPath,
			torrentFilename: params.torrentFilename,
			forceResubmit: params.forceResubmit,
			ok: addResult.ok,
			status: addResult.status,
			statusText: addResult.statusText,
			responseText: addResult.responseText,
		})
		qbittorrentSubmittedState.add(params.item.torrentId)
		await saveQbittorrentSubmitted(qbittorrentSubmittedState)
		removeQbittorrentFailure(params.item.torrentId)
		await saveQbittorrentFailures(qbittorrentFailuresState)
		return { responseText: addResult.responseText }
	} catch (error) {
		const requestError = error instanceof QbittorrentRequestError ? error : new QbittorrentRequestError(error instanceof Error ? error.message : 'Failed to submit torrent to qBittorrent', 'http')
		await recordQbittorrentAddResponse({
			torrentId: params.item.torrentId,
			createdAtUtc: new Date().toISOString(),
			source: params.source,
			decisionStatus: params.decisionStatus,
			decisionReason: params.decisionReason,
			requestBaseUrl: getQbittorrentRuntimeConfig().baseUrl,
			targetFolderPath: params.targetFolderPath,
			torrentFilename: params.torrentFilename,
			forceResubmit: params.forceResubmit,
			ok: false,
			status: requestError.status,
			statusText: requestError.status ? 'Error' : undefined,
			responseText: requestError.responseText,
			errorKind: requestError.kind,
			errorMessage: requestError.message,
		})
		recordQbittorrentFailure({
			torrentId: params.item.torrentId,
			createdAtUtc: new Date().toISOString(),
			source: params.source,
			decisionStatus: params.decisionStatus,
			decisionReason: params.decisionReason,
			item: params.item,
			targetFolderPath: params.targetFolderPath,
			torrentFilePath: params.torrentFilePath,
			torrentFilename: params.torrentFilename,
			errorKind: requestError.kind,
			errorMessage: requestError.message,
			suggestion: requestError.suggestion,
			seriesKey: params.seriesKey,
			internalNames: params.internalNames,
		})
		await saveQbittorrentFailures(qbittorrentFailuresState)
		throw badRequest(requestError.message, {
			kind: requestError.kind,
			torrentId: params.item.torrentId,
			suggestion: requestError.suggestion,
		})
	}
}

async function finalizeSuccessfulTorrent(params: {
	item: TorrentItem
	decisionStatus: Extract<DecisionStatus, 'auto_downloaded' | 'approved'>
	decisionReason: string
	seriesKey?: string
	internalNames?: string[]
}): Promise<DecisionRecord> {
	rememberDownloadedTorrent(params.item)
	if (params.seriesKey) {
		await recordTorrentAliases(params.seriesKey, params.internalNames ?? [])
	}
	const decision = createDecisionRecord(params.item, params.decisionStatus, params.decisionReason)
	removeQbittorrentFailure(params.item.torrentId)
	await saveQbittorrentFailures(qbittorrentFailuresState)
	return decision
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
		watchRoots: watchRootsState,
		watchRootStatuses: watchRootStatusesState,
		lastBootstrapDiscovery: bootstrapDiscoveryState,
	}
}

function lookupLatestQbResponseText(torrentId: string): string | undefined {
	const latest = qbittorrentAddResponsesState.find((entry) => entry.torrentId === torrentId)
	const text = latest?.responseText?.trim()
	return text ? text : undefined
}

function buildBootstrapSummary(
	item: TorrentItem,
	status: DecisionRecord['status'],
	reason: string,
	itemIndex: number,
	qbResponseText?: string,
): BootstrapAutoDecisionSummary {
	return {
		torrentId: item.torrentId,
		title: item.title,
		status,
		reason,
		qbResponseText,
		page: item.page,
		itemIndex,
	}
}

function sanitizeInternalNames(names: string[] | undefined): string[] {
	if (!names) {
		return []
	}
	return Array.from(new Set(
		names
			.map((name) => name.trim())
			.filter((name) => name.length > 0 && name.toLowerCase() !== 'unknown'),
	))
}

async function discoverLastDownloadedCheckpointStep(input?: BootstrapDiscoverStepBody): Promise<BootstrapDiscoveryResult> {
	const startedAtUtc = new Date().toISOString()
	const page = input?.page && Number.isInteger(input.page) && input.page > 0 ? input.page : 1
	const startItemIndex = input?.itemIndex && Number.isInteger(input.itemIndex) && input.itemIndex >= 0 ? input.itemIndex : 0
	const qbForceResubmit = input?.qbForceResubmit === true
	let pagesScanned = 1
	let inspectedCount = 0
	const autoApproved: BootstrapAutoDecisionSummary[] = []
	const autoRejected: BootstrapAutoDecisionSummary[] = []
	const alreadyDownloaded: BootstrapAutoDecisionSummary[] = []
	const backfilled: BootstrapAutoDecisionSummary[] = []

	await refreshWatchRoots()
	await refreshWatchTargets()
	const aliases = await loadAliases()
	const processedTorrentIds = listDecisionTorrentIds(decisionsState)
	const pendingTorrentIds = listPendingTorrentIds(pendingState)
	const qbittorrentFailedIds = listFailedQbittorrentIds()

	if (watchTargetsState.length === 0) {
		const result: BootstrapDiscoveryResult = {
			startedAtUtc,
			finishedAtUtc: new Date().toISOString(),
			pagesScanned,
			inspectedCount,
			found: false,
			mode: 'no_items',
			currentPage: page,
			currentItemIndex: startItemIndex,
			nextPage: page,
			nextItemIndex: startItemIndex,
			autoApproved,
			autoRejected,
			alreadyDownloaded,
			backfilled,
			reason: 'No watch targets available for bootstrap discovery',
		}
		bootstrapDiscoveryState = result
		await saveBootstrapDiscovery(result)
		return result
	}

	const { html, items } = await scrapeNyaaPage(page)
	await savePageSnapshot(page, html, items)
	const pageCursorToken = `${page}:${items.length}:${items[0]?.torrentId ?? 'none'}:${items[items.length - 1]?.torrentId ?? 'none'}`

	if (startItemIndex > 0 && input?.cursorToken && input.cursorToken !== pageCursorToken) {
		throw badRequest('Bootstrap cursor became stale. Restart from itemIndex 0 for this page.')
	}

	if (startItemIndex >= items.length) {
		const result: BootstrapDiscoveryResult = {
			startedAtUtc,
			finishedAtUtc: new Date().toISOString(),
			pagesScanned,
			inspectedCount,
			found: false,
			mode: 'page_completed',
			currentPage: page,
			currentItemIndex: startItemIndex,
			nextPage: page + 1,
			nextItemIndex: 0,
			nextCursorToken: undefined,
			autoApproved,
			autoRejected,
			alreadyDownloaded,
			backfilled,
			reason: `Page ${page} already exhausted`,
		}
		bootstrapDiscoveryState = result
		await saveBootstrapDiscovery(result)
		return result
	}

	for (let itemIndex = startItemIndex; itemIndex < items.length; itemIndex += 1) {
		const item = items[itemIndex]!
		if (processedTorrentIds.has(item.torrentId) || pendingTorrentIds.has(item.torrentId) || qbittorrentFailedIds.has(item.torrentId)) {
			const latestDecision = processedTorrentIds.has(item.torrentId)
				? decisionsState.findLast((decision) => decision.torrentId === item.torrentId)
				: undefined
			if (latestDecision && (qbForceResubmit || !qbittorrentSubmittedState.has(item.torrentId))) {
				if (latestDecision && (latestDecision.status === 'auto_downloaded' || latestDecision.status === 'approved')) {
					const existingTorrent = await findDownloadedTorrentFileById(item.torrentId)
					if (existingTorrent) {
						let usedMetainfoFallback = false
						let usedFilenameFallback = false
						let decisionInternalNames = sanitizeInternalNames((latestDecision as DecisionRecord & { internalNames?: string[] }).internalNames)
						if (decisionInternalNames.length === 0) {
							decisionInternalNames = sanitizeInternalNames((latestDecision.item as TorrentItem & { internalNames?: string[] }).internalNames)
						}
						if (decisionInternalNames.length === 0) {
							const metainfo = await readFile(existingTorrent.filePath)
								.then((buffer) => parseTorrentMetainfo(buffer))
								.catch(() => undefined)
							if (metainfo) {
								decisionInternalNames = sanitizeInternalNames(metainfo.videoNames.length > 0 ? metainfo.videoNames : [metainfo.name])
								if (decisionInternalNames.length > 0) {
									usedMetainfoFallback = true
								}
							}
						}
						if (decisionInternalNames.length === 0) {
							const filenameCandidate = existingTorrent.filename
								.replace(new RegExp(`-${item.torrentId}\\.torrent$`, 'i'), '')
								.replace(/\.torrent$/i, '')
								.trim()
							decisionInternalNames = sanitizeInternalNames([filenameCandidate])
							if (decisionInternalNames.length > 0) {
								usedFilenameFallback = true
							}
						}
						const target = resolveTorrentTarget(latestDecision.item, decisionInternalNames, aliases)
						const submitResult = await submitDownloadedTorrent({
							item: latestDecision.item,
							torrentFilePath: existingTorrent.filePath,
							torrentFilename: existingTorrent.filename,
							targetFolderPath: target.folderPath,
							decisionStatus: latestDecision.status,
							decisionReason: latestDecision.reason,
							source: 'bootstrap',
							seriesKey: (latestDecision as DecisionRecord & { seriesKey?: string }).seriesKey,
							internalNames: decisionInternalNames,
							forceResubmit: qbForceResubmit,
						})
						const backfillSources: string[] = []
						if (usedMetainfoFallback) {
							backfillSources.push('local torrent metainfo')
						}
						if (usedFilenameFallback) {
							backfillSources.push('saved torrent filename')
						}
						const backfillReason = backfillSources.length > 0
							? `${latestDecision.reason} (backfill using ${backfillSources.join(' + ')})`
							: latestDecision.reason
						backfilled.push(buildBootstrapSummary(
							latestDecision.item,
							latestDecision.status,
							backfillReason,
							itemIndex,
							submitResult.responseText ?? lookupLatestQbResponseText(latestDecision.item.torrentId),
						))
					}
				}
			}

			if (latestDecision) {
				if (latestDecision.status === 'auto_downloaded' || latestDecision.status === 'approved') {
					autoApproved.push(buildBootstrapSummary(
						latestDecision.item,
						latestDecision.status,
						`${latestDecision.reason} (replayed from history)`,
						itemIndex,
						lookupLatestQbResponseText(latestDecision.item.torrentId),
					))
					inspectedCount += 1
					continue
				}
				if (latestDecision.status === 'blocked' || latestDecision.status === 'skipped') {
					autoRejected.push(buildBootstrapSummary(latestDecision.item, latestDecision.status, `${latestDecision.reason} (replayed from history)`, itemIndex))
					inspectedCount += 1
					continue
				}
				if (latestDecision.status === 'already_downloaded') {
					alreadyDownloaded.push(buildBootstrapSummary(latestDecision.item, latestDecision.status, `${latestDecision.reason} (replayed from history)`, itemIndex))
					inspectedCount += 1
					continue
				}
				if (latestDecision.status === 'pending') {
					autoRejected.push(buildBootstrapSummary(latestDecision.item, latestDecision.status, `${latestDecision.reason} (already pending from history)`, itemIndex))
					inspectedCount += 1
					continue
				}
			}

			if (pendingTorrentIds.has(item.torrentId)) {
				const pendingItem = pendingState.find((entry) => entry.torrentId === item.torrentId)
				if (pendingItem) {
					autoRejected.push(buildBootstrapSummary(pendingItem.item, pendingItem.status, `${pendingItem.reason} (already pending from queue)`, itemIndex))
					inspectedCount += 1
					continue
				}
			}
			continue
		}

		inspectedCount += 1
		const quickMatch = buildTorrentMatchResult({ title: item.title, videoNames: [] }, aliases)
		const titleMatchedTarget = matchTorrentToWatchTargets(quickMatch, watchTargetsState)

		if (blacklistState.includes(quickMatch.normalizedKey)) {
			const decision = createDecisionRecord(
				{ ...item, seriesBaseRaw: quickMatch.seriesBaseRaw, resolution: quickMatch.resolution, matchCandidates: quickMatch.matchCandidates },
				'blocked',
				'series+resolution blacklisted',
			)
			decisionsState.push(decision)
			processedTorrentIds.add(item.torrentId)
			autoRejected.push(buildBootstrapSummary(item, 'blocked', decision.reason, itemIndex))
			continue
		}

		if (titleMatchedTarget) {
			const existingLocal = await findExistingLocalMatchByTitle(titleMatchedTarget, item.title)
			if (existingLocal) {
				const decision = createDecisionRecord(
					{ ...item, seriesBaseRaw: quickMatch.seriesBaseRaw, resolution: quickMatch.resolution, matchCandidates: quickMatch.matchCandidates },
					'already_downloaded',
					existingLocal.reason,
				)
				decisionsState.push(decision)
				processedTorrentIds.add(item.torrentId)
				alreadyDownloaded.push(buildBootstrapSummary(item, 'already_downloaded', decision.reason, itemIndex))
				lastProcessedState = {
					lastTorrentId: item.torrentId,
					lastSeenPage: page,
					lastRunAt: new Date().toISOString(),
					bootstrapMode: 'checkpoint',
				}
				continue
			}

			const downloadedTorrent = await downloadTorrentFile(item)
			const matchedItem = { ...item, seriesBaseRaw: quickMatch.seriesBaseRaw, resolution: quickMatch.resolution, matchCandidates: quickMatch.matchCandidates }
			const submitResult = await submitDownloadedTorrent({
				item: matchedItem,
				torrentFilePath: downloadedTorrent.filePath,
				torrentFilename: downloadedTorrent.filename,
				targetFolderPath: titleMatchedTarget.folderPath,
				decisionStatus: 'auto_downloaded',
				decisionReason: `matched ${titleMatchedTarget.normalizedKey} by title`,
				source: 'bootstrap',
				seriesKey: titleMatchedTarget.seriesKey,
				internalNames: [],
			})
			const decision = await finalizeSuccessfulTorrent({
				item: matchedItem,
				decisionStatus: 'auto_downloaded',
				decisionReason: `matched ${titleMatchedTarget.normalizedKey} by title`,
				seriesKey: titleMatchedTarget.seriesKey,
				internalNames: [],
			})
			decisionsState.push(decision)
			processedTorrentIds.add(item.torrentId)
			autoApproved.push(buildBootstrapSummary(item, 'auto_downloaded', decision.reason, itemIndex, submitResult.responseText))
			lastProcessedState = {
				lastTorrentId: item.torrentId,
				lastSeenPage: page,
				lastRunAt: new Date().toISOString(),
				bootstrapMode: 'assisted',
			}
			continue
		}

		const classified = await inspectAndClassifyTorrent(item, aliases, watchTargetsState, blacklistState)

		if (classified.status === 'already_downloaded') {
			const decision = createDecisionRecord(classified, 'already_downloaded', classified.reason)
			decisionsState.push(decision)
			processedTorrentIds.add(item.torrentId)
			alreadyDownloaded.push(buildBootstrapSummary(classified, 'already_downloaded', classified.reason, itemIndex))
			lastProcessedState = {
				lastTorrentId: classified.torrentId,
				lastSeenPage: page,
				lastRunAt: new Date().toISOString(),
				bootstrapMode: 'checkpoint',
			}
			continue
		}

		if (classified.status === 'pending') {
			const decision = createDecisionRecord(classified, 'pending', classified.reason)
			decisionsState.push(decision)
			processedTorrentIds.add(item.torrentId)
			const pendingItem: PendingItem = {
				torrentId: classified.torrentId,
				status: classified.status,
				reason: classified.reason,
				item: classified,
				seriesKey: classified.seriesKey,
				internalNames: classified.internalNames,
			}
			pendingState.push(pendingItem)
			pendingTorrentIds.add(item.torrentId)
			await savePending(pendingState)
			await saveDecisions(decisionsState)
			const result: BootstrapDiscoveryResult = {
				startedAtUtc,
				finishedAtUtc: new Date().toISOString(),
				pagesScanned,
				inspectedCount,
				found: false,
				mode: 'needs_review',
				currentPage: page,
				currentItemIndex: itemIndex,
				nextPage: itemIndex + 1 < items.length ? page : page + 1,
				nextItemIndex: itemIndex + 1 < items.length ? itemIndex + 1 : 0,
				nextCursorToken: itemIndex + 1 < items.length ? pageCursorToken : undefined,
				actionItem: pendingItem,
				autoApproved,
				autoRejected,
				alreadyDownloaded,
				backfilled,
				reason: classified.reason,
				torrentId: classified.torrentId,
				title: classified.title,
			}
			bootstrapDiscoveryState = result
			await saveBootstrapDiscovery(result)
			return result
		}

		if (classified.status === 'auto_downloaded') {
			const downloadedTorrent = await downloadTorrentFile(classified)
			const target = classified.matchedTarget ?? resolveTorrentTarget(classified, classified.internalNames ?? [], aliases)
			const submitResult = await submitDownloadedTorrent({
				item: classified,
				torrentFilePath: downloadedTorrent.filePath,
				torrentFilename: downloadedTorrent.filename,
				targetFolderPath: target.folderPath,
				decisionStatus: 'auto_downloaded',
				decisionReason: classified.reason,
				source: 'bootstrap',
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
			autoApproved.push(buildBootstrapSummary(classified, 'auto_downloaded', classified.reason, itemIndex, submitResult.responseText))
			lastProcessedState = {
				lastTorrentId: classified.torrentId,
				lastSeenPage: page,
				lastRunAt: new Date().toISOString(),
				bootstrapMode: 'assisted',
			}
			continue
		}

		if (classified.status === 'blocked') {
			const decision = createDecisionRecord(classified, 'blocked', classified.reason)
			decisionsState.push(decision)
			processedTorrentIds.add(item.torrentId)
			autoRejected.push(buildBootstrapSummary(classified, 'blocked', classified.reason, itemIndex))
		}
	}

	const result: BootstrapDiscoveryResult = {
		startedAtUtc,
		finishedAtUtc: new Date().toISOString(),
		pagesScanned,
		inspectedCount,
		found: false,
		mode: 'page_completed',
		currentPage: page,
		currentItemIndex: items.length,
		nextPage: page + 1,
		nextItemIndex: 0,
		nextCursorToken: undefined,
		autoApproved,
		autoRejected,
		alreadyDownloaded,
		backfilled,
		reason: `Page ${page} completed without manual stop`,
	}

	await savePending(pendingState)
	await saveDecisions(decisionsState)
	if (lastProcessedState) {
		await saveLastProcessed(lastProcessedState)
	}
	bootstrapDiscoveryState = result
	await saveBootstrapDiscovery(result)
	return result
}

async function approvePendingItemByIndex(pendingIndex: number): Promise<DecisionRecord> {
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
	const target = resolveTorrentTarget(pendingItem.item, resolvedInternalNames, aliases)
	pendingState.splice(pendingIndex, 1)
	await savePending(pendingState)
	await submitDownloadedTorrent({
		item: pendingItem.item,
		torrentFilePath: downloadedTorrent.filePath,
		torrentFilename: downloadedTorrent.filename,
		targetFolderPath: target.folderPath,
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
		lastProcessedState = {
			lastTorrentId: classified.torrentId,
			lastSeenPage: page,
			lastRunAt: new Date().toISOString(),
			bootstrapMode,
		}
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
				watchTargets: watchTargetsState,
				queue: pendingState,
				qbittorrentConfig: getQbittorrentRuntimeConfig(),
				qbittorrentFailures: qbittorrentFailuresState,
				torrents: buildTorrentHistory(),
			},
		}
	})

	app.post('/api/watchlist/scan', async () => {
		const targets = await refreshWatchTargets()
		return { success: true, data: targets }
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

	app.post('/api/bootstrap/discovery/clear', async () => {
		bootstrapDiscoveryState = undefined
		await saveBootstrapDiscovery(undefined)
		return { success: true, data: { status: buildStatus() } }
	})

	app.get('/api/watchlist', () => ({ success: true, data: watchTargetsState }))
	app.get('/api/pending', () => ({ success: true, data: pendingState }))
	app.get('/api/torrents', () => ({ success: true, data: buildTorrentHistory() }))

	app.post('/api/pending/:id/approve', async (event) => {
		const torrentId = event.context.params?.id
		if (!torrentId) {
			throw badRequest('Missing torrent id')
		}
		const pendingIndex = pendingState.findIndex((item) => item.torrentId === torrentId)
		if (pendingIndex < 0) {
			throw notFound('Pending item not found')
		}
		const decision = await approvePendingItemByIndex(pendingIndex)
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
		const seriesKey = pendingItem.seriesKey ?? pendingItem.item.seriesBaseRaw.toLowerCase()
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
			lastProcessedState = advanceCheckpoint(lastProcessedState, lastProcessedState?.lastTorrentId ?? 'bootstrap', nextPage, lastProcessedState?.bootstrapMode ?? 'assisted')
			await saveLastProcessed(lastProcessedState)
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