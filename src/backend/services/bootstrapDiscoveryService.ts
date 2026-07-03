import { readFile } from 'node:fs/promises'
import type {
	BootstrapAutoDecisionSummary,
	BootstrapDiscoveryResult,
	DecisionRecord,
	PendingItem,
	TorrentItem,
} from '@shared/types'
import { badRequest } from './apiErrorService'
import {
	createDecisionRecord,
	finalizeSuccessfulTorrent,
	getDecisionInternalNames,
	lookupLatestQbResponseText,
	resolveTorrentTarget,
	sanitizeInternalNames,
	submitDownloadedTorrent,
} from './decisionWorkflowService'
import { downloadTorrentFile, findDownloadedTorrentFileById } from './downloaderService'
import { findExistingLocalMatchByTitle, type ExistingLocalMatch } from './localLibraryService'
import { buildTorrentMatchResult, isTorrentBlacklisted, matchTorrentToWatchTargets } from './matchingService'
import { scrapeNyaaPage } from './nyaaScraperServiceStream'
import { buildNyaaQueryKey, normalizeNyaaQuery } from './nyaaQueryService'
import { inspectAndClassifyTorrent, savePageSnapshot } from './nyaaTorrentService'
import {
	blacklistState,
	decisionsState,
	lastProcessedState,
	pendingState,
	qbittorrentFailuresState,
	qbittorrentSubmittedState,
	refreshWatchRoots,
	refreshWatchTargets,
	setBootstrapDiscoveryState,
	setLastProcessedState,
	watchTargetsState,
} from './runtimeStateService'
import { listDecisionTorrentIds, listPendingTorrentIds, saveBootstrapDiscovery, saveDecisions, saveLastProcessed, savePending } from './stateService'
import { parseTorrentMetainfo } from './torrentMetainfoService'
import { loadAliases } from './watchlistService'

interface BootstrapDiscoverStepBody {
	page?: number
	itemIndex?: number
	cursorToken?: string
	qbForceResubmit?: boolean
	customQuery?: string
	wholePage?: boolean
}

function buildBootstrapSummary(
	item: TorrentItem,
	status: DecisionRecord['status'],
	reason: string,
	itemIndex: number,
	qbResponseText?: string,
	fileMissing?: boolean,
	newlyFound?: boolean,
	resubmittedFromNyaa?: boolean,
): BootstrapAutoDecisionSummary {
	return {
		torrentId: item.torrentId,
		title: item.title,
		status,
		reason,
		fileMissing,
		newlyFound,
		resubmittedFromNyaa,
		qbResponseText,
		page: item.page,
		itemIndex,
	}
}

function parseNyaaResultsStats(html: string): { text?: string; last?: number; total?: number; hasNextPage?: boolean } {
	const match = /Displaying results\s+(\d[\d,]*)\s*-\s*(\d[\d,]*)\s+out of\s+(\d[\d,]*)\s+results\./i.exec(html)
	if (!match) {
		return {}
	}

	const parseNumber = (value: string) => Number.parseInt(value.replace(/,/g, ''), 10)
	const first = parseNumber(match[1] ?? '')
	const last = parseNumber(match[2] ?? '')
	const total = parseNumber(match[3] ?? '')
	const text = `Displaying results ${first}-${last} out of ${total} results.`

	if (!Number.isFinite(last) || !Number.isFinite(total)) {
		return { text }
	}

	return {
		text,
		last,
		total,
		hasNextPage: last < total,
	}
}

async function findReplayLocalMatch(decision: DecisionRecord, aliases: Record<string, string>): Promise<ExistingLocalMatch | undefined> {
	const matchResult = buildTorrentMatchResult({
		title: decision.item.title,
		videoNames: getDecisionInternalNames(decision),
	}, aliases)
	const target = matchTorrentToWatchTargets(matchResult, watchTargetsState)
	if (!target) {
		return undefined
	}
	return findExistingLocalMatchByTitle(target, decision.item.title)
}

async function processReplayedDecision(
	latestDecision: DecisionRecord,
	item: TorrentItem,
	itemIndex: number,
	aliases: Record<string, string>,
	qbForceResubmit: boolean,
	autoApproved: BootstrapAutoDecisionSummary[],
	autoRejected: BootstrapAutoDecisionSummary[],
	alreadyDownloaded: BootstrapAutoDecisionSummary[],
	backfilled: BootstrapAutoDecisionSummary[],
): Promise<{ inspectedCount: number; result?: BootstrapDiscoveryResult }> {
	const replayLocalMatch = await findReplayLocalMatch(latestDecision, aliases)
	if (replayLocalMatch) {
		const upgradedFromDifferentStatus = latestDecision.status !== 'already_downloaded'
		const replayReason = latestDecision.status === 'already_downloaded'
			? `${replayLocalMatch.reason} (replayed from history)`
			: `${replayLocalMatch.reason} (replayed from history; previous status: ${latestDecision.status})`
		alreadyDownloaded.push(buildBootstrapSummary(
			latestDecision.item,
			'already_downloaded',
			replayReason,
			itemIndex,
			undefined,
			undefined,
			upgradedFromDifferentStatus,
		))
		return { inspectedCount: 1 }
	}

	if (latestDecision.status === 'already_downloaded') {
		let usedMetainfoFallback = false
		let usedFilenameFallback = false
		let usedNyaaDownloadFallback = false
		const existingTorrent = await findDownloadedTorrentFileById(item.torrentId)
		const torrentToSubmit = existingTorrent ?? await downloadTorrentFile(latestDecision.item)
		if (!existingTorrent) {
			usedNyaaDownloadFallback = true
		}
		let decisionInternalNames = getDecisionInternalNames(latestDecision)
		if (decisionInternalNames.length === 0) {
			const metainfo = await readFile(torrentToSubmit.filePath)
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
			const filenameCandidate = torrentToSubmit.filename
				.replace(new RegExp(`-${item.torrentId}\\.torrent$`, 'i'), '')
				.replace(/\.torrent$/i, '')
				.trim()
			decisionInternalNames = sanitizeInternalNames([filenameCandidate])
			if (decisionInternalNames.length > 0) {
				usedFilenameFallback = true
			}
		}
		const target = resolveTorrentTarget(latestDecision.item, decisionInternalNames, aliases)
		const resubmitReason = `${latestDecision.reason} (replayed from history; local file missing -> resubmitted)`
		const submitResult = await submitDownloadedTorrent({
			item: latestDecision.item,
			torrentFilePath: torrentToSubmit.filePath,
			torrentFilename: torrentToSubmit.filename,
			targetFolderPath: target.folderPath,
			decisionStatus: 'approved',
			decisionReason: resubmitReason,
			source: 'bootstrap',
			seriesKey: (latestDecision as DecisionRecord & { seriesKey?: string }).seriesKey,
			internalNames: decisionInternalNames,
			forceResubmit: qbForceResubmit,
		})
		const backfillSources: string[] = []
		if (usedNyaaDownloadFallback) backfillSources.push('fresh Nyaa torrent download')
		if (usedMetainfoFallback) backfillSources.push('local torrent metainfo')
		if (usedFilenameFallback) backfillSources.push('saved torrent filename')
		const backfillReason = backfillSources.length > 0
			? `${resubmitReason} (backfill using ${backfillSources.join(' + ')})`
			: resubmitReason
		backfilled.push(buildBootstrapSummary(
			latestDecision.item,
			latestDecision.status,
			backfillReason,
			itemIndex,
			submitResult.responseText ?? lookupLatestQbResponseText(latestDecision.item.torrentId),
			true,
			undefined,
			usedNyaaDownloadFallback,
		))
		return { inspectedCount: 1 }
	}

	if (qbForceResubmit || !qbittorrentSubmittedState.has(item.torrentId)) {
		if (latestDecision.status === 'auto_downloaded' || latestDecision.status === 'approved') {
			const existingTorrent = await findDownloadedTorrentFileById(item.torrentId)
			if (existingTorrent) {
				let usedMetainfoFallback = false
				let usedFilenameFallback = false
				let decisionInternalNames = getDecisionInternalNames(latestDecision)
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
				if (usedMetainfoFallback) backfillSources.push('local torrent metainfo')
				if (usedFilenameFallback) backfillSources.push('saved torrent filename')
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

	if (latestDecision.status === 'auto_downloaded' || latestDecision.status === 'approved') {
		autoApproved.push(buildBootstrapSummary(
			latestDecision.item,
			latestDecision.status,
			`${latestDecision.reason} (replayed from history)`,
			itemIndex,
			lookupLatestQbResponseText(latestDecision.item.torrentId),
		))
		return { inspectedCount: 1 }
	}
	if (latestDecision.status === 'blocked' || latestDecision.status === 'skipped') {
		autoRejected.push(buildBootstrapSummary(latestDecision.item, latestDecision.status, `${latestDecision.reason} (replayed from history)`, itemIndex))
		return { inspectedCount: 1 }
	}
	if (latestDecision.status === 'pending') {
		autoRejected.push(buildBootstrapSummary(latestDecision.item, latestDecision.status, `${latestDecision.reason} (already pending from history)`, itemIndex))
		return { inspectedCount: 1 }
	}

	return { inspectedCount: 1 }
}

async function processBootstrapItem(
	item: TorrentItem,
	itemIndex: number,
	page: number,
	customQuery: string | undefined,
	queryKey: string,
	pageItemCount: number,
	aliases: Record<string, string>,
	startedAtUtc: string,
	nyaaResultsStats: { text?: string; last?: number; total?: number; hasNextPage?: boolean },
	pageCursorToken: string,
	qbForceResubmit: boolean,
	processedTorrentIds: Set<string>,
	pendingTorrentIds: Set<string>,
	qbittorrentFailedIds: Set<string>,
	autoApproved: BootstrapAutoDecisionSummary[],
	autoRejected: BootstrapAutoDecisionSummary[],
	alreadyDownloaded: BootstrapAutoDecisionSummary[],
	backfilled: BootstrapAutoDecisionSummary[],
	stopOnPending: boolean,
): Promise<{ inspectedCount: number; result?: BootstrapDiscoveryResult }> {
	let inspectedCount = 0

	if (processedTorrentIds.has(item.torrentId) || pendingTorrentIds.has(item.torrentId) || qbittorrentFailedIds.has(item.torrentId)) {
		const latestDecision = processedTorrentIds.has(item.torrentId)
			? decisionsState.findLast((decision) => decision.torrentId === item.torrentId)
			: undefined

		// A previously blocked/skipped torrent must be re-evaluated against the
		// current blacklist instead of blindly replaying the old rejection. If the
		// series+resolution is no longer blacklisted, fall through to fresh
		// classification so the user is prompted again.
		const wasRejected = latestDecision?.status === 'blocked' || latestDecision?.status === 'skipped'
		const reEvaluateRejection = wasRejected
			&& !pendingTorrentIds.has(item.torrentId)
			&& !qbittorrentFailedIds.has(item.torrentId)
			&& !isTorrentBlacklisted(buildTorrentMatchResult({ title: item.title, videoNames: [] }, aliases), blacklistState)

		if (latestDecision && !reEvaluateRejection) {
			return await processReplayedDecision(
				latestDecision,
				item,
				itemIndex,
				aliases,
				qbForceResubmit,
				autoApproved,
				autoRejected,
				alreadyDownloaded,
				backfilled,
			)
		}

		if (!latestDecision) {
			if (pendingTorrentIds.has(item.torrentId)) {
				const pendingItem = pendingState.find((entry) => entry.torrentId === item.torrentId)
				if (pendingItem) {
					autoRejected.push(buildBootstrapSummary(pendingItem.item, pendingItem.status, `${pendingItem.reason} (already pending from queue)`, itemIndex))
					return { inspectedCount: 1 }
				}
			}
			return { inspectedCount: 0 }
		}
		// else: latestDecision is a no-longer-blacklisted rejection -> fall through
	}

	inspectedCount += 1
	const quickMatch = buildTorrentMatchResult({ title: item.title, videoNames: [] }, aliases)
	const titleMatchedTarget = matchTorrentToWatchTargets(quickMatch, watchTargetsState)

	if (isTorrentBlacklisted(quickMatch, blacklistState)) {
		const decision = createDecisionRecord(
			{ ...item, seriesBaseRaw: quickMatch.seriesBaseRaw, resolution: quickMatch.resolution, matchCandidates: quickMatch.matchCandidates },
			'blocked',
			'series+resolution blacklisted',
		)
		decisionsState.push(decision)
		processedTorrentIds.add(item.torrentId)
		autoRejected.push(buildBootstrapSummary(item, 'blocked', decision.reason, itemIndex))
		return { inspectedCount }
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
			setLastProcessedState({
				lastTorrentId: item.torrentId,
				lastSeenPage: page,
				lastRunAt: new Date().toISOString(),
				bootstrapMode: 'checkpoint',
			})
			return { inspectedCount }
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
		setLastProcessedState({
			lastTorrentId: item.torrentId,
			lastSeenPage: page,
			lastRunAt: new Date().toISOString(),
			bootstrapMode: 'assisted',
		})
		return { inspectedCount }
	}

	const classified = await inspectAndClassifyTorrent(item, aliases, watchTargetsState, blacklistState)

	if (classified.status === 'already_downloaded') {
		const decision = createDecisionRecord(classified, 'already_downloaded', classified.reason)
		decisionsState.push(decision)
		processedTorrentIds.add(item.torrentId)
		alreadyDownloaded.push(buildBootstrapSummary(classified, 'already_downloaded', classified.reason, itemIndex))
		setLastProcessedState({
			lastTorrentId: classified.torrentId,
			lastSeenPage: page,
			lastRunAt: new Date().toISOString(),
			bootstrapMode: 'checkpoint',
		})
		return { inspectedCount }
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
		if (!stopOnPending) {
			// Whole-page mode: queue this pending item and keep scanning the rest of the page.
			return { inspectedCount: inspectedCount + 1 }
		}
		const result: BootstrapDiscoveryResult = {
			startedAtUtc,
			finishedAtUtc: new Date().toISOString(),
			customQuery,
			queryKey,
			pagesScanned: 1,
			inspectedCount: inspectedCount + 1,
			found: false,
			nyaaResultsText: nyaaResultsStats.text,
			nyaaResultsLast: nyaaResultsStats.last,
			nyaaResultsTotal: nyaaResultsStats.total,
			hasNextPage: nyaaResultsStats.hasNextPage,
			mode: 'needs_review',
			currentPage: page,
			currentItemIndex: itemIndex,
			nextPage: itemIndex + 1 < pageItemCount ? page : page + 1,
			nextItemIndex: itemIndex + 1 < pageItemCount ? itemIndex + 1 : 0,
			nextCursorToken: itemIndex + 1 < pageItemCount ? pageCursorToken : undefined,
			actionItem: pendingItem,
			autoApproved,
			autoRejected,
			alreadyDownloaded,
			backfilled,
			reason: classified.reason,
			torrentId: classified.torrentId,
			title: classified.title,
		}
		return { inspectedCount: inspectedCount + 1, result }
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
		setLastProcessedState({
			lastTorrentId: classified.torrentId,
			lastSeenPage: page,
			lastRunAt: new Date().toISOString(),
			bootstrapMode: 'assisted',
		})
		return { inspectedCount }
	}

	if (classified.status === 'blocked') {
		const decision = createDecisionRecord(classified, 'blocked', classified.reason)
		decisionsState.push(decision)
		processedTorrentIds.add(item.torrentId)
		autoRejected.push(buildBootstrapSummary(classified, 'blocked', classified.reason, itemIndex))
	}

	return { inspectedCount }
}

export async function discoverLastDownloadedCheckpointStep(
	input: BootstrapDiscoverStepBody | undefined,
): Promise<BootstrapDiscoveryResult> {
	const startedAtUtc = new Date().toISOString()
	const page = input?.page && Number.isInteger(input.page) && input.page > 0 ? input.page : 1
	const startItemIndex = input?.itemIndex && Number.isInteger(input.itemIndex) && input.itemIndex >= 0 ? input.itemIndex : 0
	const qbForceResubmit = input?.qbForceResubmit === true
	const wholePage = input?.wholePage === true
	const stopOnPending = !wholePage
	const customQuery = normalizeNyaaQuery(input?.customQuery)
	const queryKey = buildNyaaQueryKey(customQuery)
	const pagesScanned = 1
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
	const qbittorrentFailedIds = new Set(qbittorrentFailuresState.map((item) => item.torrentId))

	if (watchTargetsState.length === 0) {
		const result: BootstrapDiscoveryResult = {
			startedAtUtc,
			finishedAtUtc: new Date().toISOString(),
			customQuery,
			queryKey,
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
		setBootstrapDiscoveryState(result)
		await saveBootstrapDiscovery(result)
		return result
	}

	const { html, items } = await scrapeNyaaPage(page, customQuery)
	await savePageSnapshot(page, html, items, customQuery)
	const nyaaResultsStats = parseNyaaResultsStats(html)
	const pageCursorToken = `${queryKey}:${page}:${items.length}:${items[0]?.torrentId ?? 'none'}:${items[items.length - 1]?.torrentId ?? 'none'}`

	if (startItemIndex > 0 && input?.cursorToken && input.cursorToken !== pageCursorToken) {
		throw badRequest('Bootstrap cursor became stale. Restart from itemIndex 0 for this page.')
	}

	if (startItemIndex >= items.length) {
		const result: BootstrapDiscoveryResult = {
			startedAtUtc,
			finishedAtUtc: new Date().toISOString(),
			customQuery,
			queryKey,
			pagesScanned,
			inspectedCount,
			found: false,
			nyaaResultsText: nyaaResultsStats.text,
			nyaaResultsLast: nyaaResultsStats.last,
			nyaaResultsTotal: nyaaResultsStats.total,
			hasNextPage: nyaaResultsStats.hasNextPage,
			mode: 'page_completed',
			currentPage: page,
			currentItemIndex: startItemIndex,
			nextPage: page + 1,
			nextItemIndex: 0,
			nextCursorToken: undefined,
			wholePage,
			autoApproved,
			autoRejected,
			alreadyDownloaded,
			backfilled,
			reason: `Page ${page} already exhausted`,
		}
		setBootstrapDiscoveryState(result)
		await saveBootstrapDiscovery(result)
		return result
	}

	for (let itemIndex = startItemIndex; itemIndex < items.length; itemIndex += 1) {
		const item = items[itemIndex]!
		const { inspectedCount: itemCount, result } = await processBootstrapItem(
			item,
			itemIndex,
			page,
			customQuery,
			queryKey,
			items.length,
			aliases,
			startedAtUtc,
			nyaaResultsStats,
			pageCursorToken,
			qbForceResubmit,
			processedTorrentIds,
			pendingTorrentIds,
			qbittorrentFailedIds,
			autoApproved,
			autoRejected,
			alreadyDownloaded,
			backfilled,
			stopOnPending,
		)
		inspectedCount += itemCount
		if (result) {
			setBootstrapDiscoveryState(result)
			await saveBootstrapDiscovery(result)
			return result
		}
	}

	const result: BootstrapDiscoveryResult = {
		startedAtUtc,
		finishedAtUtc: new Date().toISOString(),
		customQuery,
		queryKey,
		pagesScanned,
		inspectedCount,
		found: false,
		nyaaResultsText: nyaaResultsStats.text,
		nyaaResultsLast: nyaaResultsStats.last,
		nyaaResultsTotal: nyaaResultsStats.total,
		hasNextPage: nyaaResultsStats.hasNextPage,
		mode: 'page_completed',
		currentPage: page,
		currentItemIndex: items.length,
		nextPage: page + 1,
		nextItemIndex: 0,
		nextCursorToken: undefined,
		wholePage,
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
	setBootstrapDiscoveryState(result)
	await saveBootstrapDiscovery(result)
	return result
}
