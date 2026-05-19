import type {
	BootstrapDiscoveryResult,
	DecisionRecord,
	LastProcessed,
	PendingItem,
	QbittorrentAddApiResponseItem,
	QbittorrentFailureItem,
	TorrentItem,
	WatchRootStatus,
	WatchTarget,
} from '@shared/types'
import { ensureDirectory, dataRoot } from '../storage/jsonStore'
import {
	initStateFiles,
	loadBlacklist,
	loadBootstrapDiscovery,
	loadDecisions,
	loadLastProcessed,
	loadPending,
	loadQbittorrentAddResponses,
	loadQbittorrentFailures,
	loadQbittorrentSubmitted,
} from './stateService'
import { inspectWatchRoots, loadWatchRoots, scanWatchTargets } from './watchlistService'

export const watchTargetsState: WatchTarget[] = []
export const torrentsState: TorrentItem[] = []
export const pendingState: PendingItem[] = []
export const decisionsState: DecisionRecord[] = []
export const qbittorrentFailuresState: QbittorrentFailureItem[] = []
export const qbittorrentAddResponsesState: QbittorrentAddApiResponseItem[] = []
export const blacklistState: string[] = []
export const watchRootsState: string[] = []

export let qbittorrentSubmittedState = new Set<string>()
export let watchRootStatusesState: WatchRootStatus[] = []
export let bootstrapDiscoveryState: BootstrapDiscoveryResult | undefined
export let lastProcessedState: LastProcessed | undefined

export function setBootstrapDiscoveryState(value: BootstrapDiscoveryResult | undefined): void {
	bootstrapDiscoveryState = value
}

export function setLastProcessedState(value: LastProcessed | undefined): void {
	lastProcessedState = value
}

export async function ensureInitialData(): Promise<void> {
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

export async function refreshWatchTargets(): Promise<WatchTarget[]> {
	const targets = await scanWatchTargets()
	watchTargetsState.splice(0, watchTargetsState.length, ...targets)
	return watchTargetsState
}

export async function refreshWatchRoots(): Promise<string[]> {
	const roots = await loadWatchRoots()
	watchRootsState.splice(0, watchRootsState.length, ...roots)
	watchRootStatusesState = await inspectWatchRoots(roots)
	return watchRootsState
}