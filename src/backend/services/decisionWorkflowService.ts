import path from 'node:path'
import type {
	DecisionRecord,
	DecisionStatus,
	QbittorrentAddApiResponseItem,
	QbittorrentFailureItem,
	TorrentItem,
	WatchTarget,
} from '@shared/types'
import { badRequest } from './apiErrorService'
import { buildTorrentMatchResult, matchTorrentToWatchTargets } from './matchingService'
import { upsertAliases } from './watchlistService'
import { addTorrentToQbittorrent, getQbittorrentRuntimeConfig, QbittorrentRequestError } from './qbittorrentService'
import { saveQbittorrentAddResponses, saveQbittorrentFailures, saveQbittorrentSubmitted } from './stateService'
import {
	qbittorrentAddResponsesState,
	qbittorrentFailuresState,
	qbittorrentSubmittedState,
	torrentsState,
	watchTargetsState,
} from './runtimeStateService'

function rememberDownloadedTorrent(item: TorrentItem): void {
	if (torrentsState.some((torrent) => torrent.torrentId === item.torrentId)) {
		return
	}
	torrentsState.push(item)
}

async function recordTorrentAliases(seriesKey: string, internalNames: string[]): Promise<void> {
	const aliasEntries = internalNames.flatMap((name) => {
		const trimmed = name.trim()
		if (!trimmed) {
			return []
		}
		return [[trimmed, seriesKey], [path.parse(trimmed).name, seriesKey]] as Array<[string, string]>
	})
	await upsertAliases(aliasEntries)
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

export function createDecisionRecord(item: TorrentItem, status: DecisionStatus, reason: string): DecisionRecord {
	return {
		torrentId: item.torrentId,
		status,
		reason,
		createdAtUtc: new Date().toISOString(),
		item,
	}
}

export function resolveTorrentTarget(item: TorrentItem, videoNames: string[], aliases: Record<string, string>): WatchTarget {
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

export function sanitizeInternalNames(names: string[] | undefined): string[] {
	if (!names) {
		return []
	}
	return Array.from(new Set(
		names
			.map((name) => name.trim())
			.filter((name) => name.length > 0 && name.toLowerCase() !== 'unknown'),
	))
}

export function getDecisionInternalNames(decision: DecisionRecord): string[] {
	let internalNames = sanitizeInternalNames((decision as DecisionRecord & { internalNames?: string[] }).internalNames)
	if (internalNames.length === 0) {
		internalNames = sanitizeInternalNames((decision.item as TorrentItem & { internalNames?: string[] }).internalNames)
	}
	return internalNames
}

export function lookupLatestQbResponseText(torrentId: string): string | undefined {
	const latest = qbittorrentAddResponsesState.find((entry) => entry.torrentId === torrentId)
	const text = latest?.responseText?.trim()
	return text ? text : undefined
}

export async function submitDownloadedTorrent(params: {
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
		const requestError = error instanceof QbittorrentRequestError
			? error
			: new QbittorrentRequestError(error instanceof Error ? error.message : 'Failed to submit torrent to qBittorrent', 'http')
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

export async function finalizeSuccessfulTorrent(params: {
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