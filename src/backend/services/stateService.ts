import path from 'node:path'
import type {
	BlacklistFile,
	BootstrapDiscoveryFile,
	BootstrapDiscoveryResult,
	DecisionRecord,
	DecisionsFile,
	LastProcessed,
	PendingFile,
	PendingItem,
	QbittorrentAddApiResponseItem,
	QbittorrentAddResponsesFile,
	QbittorrentFailureItem,
	QbittorrentFailuresFile,
} from '@shared/types'
import {
	dataRoot,
	ensureJsonFile,
	isAliasMapFile,
	isBlacklistFile,
	isBootstrapDiscoveryFile,
	isDecisionsFile,
	isFolderConfigFile,
	isLastProcessedFile,
	isPendingFile,
	isQbittorrentFailuresFile,
	readJsonFile,
	writeJsonFileAtomic,
} from '../storage/jsonStore'

const foldersConfigPath = path.join(dataRoot, 'folders-config.json')
const blacklistPath = path.join(dataRoot, 'blacklist.json')
const pendingPath = path.join(dataRoot, 'pending.json')
const decisionsPath = path.join(dataRoot, 'decisions.json')
const lastProcessedPath = path.join(dataRoot, 'last_processed.json')
const aliasesPath = path.join(dataRoot, 'aliases.json')
const bootstrapDiscoveryPath = path.join(dataRoot, 'bootstrap-discovery.json')
const qbittorrentFailuresPath = path.join(dataRoot, 'qbittorrent-failures.json')
const qbittorrentSubmittedPath = path.join(dataRoot, 'qbittorrent-submitted.json')
const qbittorrentAddResponsesPath = path.join(dataRoot, 'qbittorrent-add-responses.json')

interface QbittorrentSubmittedFile {
	items: string[]
}

function isQbittorrentSubmittedFile(value: unknown): value is QbittorrentSubmittedFile {
	if (typeof value !== 'object' || value === null || !('items' in value)) {
		return false
	}
	const items = (value as { items?: unknown }).items
	return Array.isArray(items) && items.every((item) => typeof item === 'string')
}

function isQbittorrentAddResponsesFile(value: unknown): value is QbittorrentAddResponsesFile {
	if (typeof value !== 'object' || value === null || !('items' in value)) {
		return false
	}
	const items = (value as { items?: unknown }).items
	if (!Array.isArray(items)) {
		return false
	}
	return items.every((item) => typeof item === 'object' && item !== null
		&& typeof (item as { torrentId?: unknown }).torrentId === 'string'
		&& typeof (item as { createdAtUtc?: unknown }).createdAtUtc === 'string'
		&& typeof (item as { source?: unknown }).source === 'string'
		&& typeof (item as { decisionStatus?: unknown }).decisionStatus === 'string'
		&& typeof (item as { decisionReason?: unknown }).decisionReason === 'string'
		&& typeof (item as { requestBaseUrl?: unknown }).requestBaseUrl === 'string'
		&& typeof (item as { targetFolderPath?: unknown }).targetFolderPath === 'string'
		&& typeof (item as { torrentFilename?: unknown }).torrentFilename === 'string'
		&& typeof (item as { ok?: unknown }).ok === 'boolean')
}

export async function initStateFiles(): Promise<void> {
	await ensureJsonFile(foldersConfigPath, { folders: [] }, isFolderConfigFile)
	await ensureJsonFile<BlacklistFile>(blacklistPath, { items: [] }, isBlacklistFile)
	await ensureJsonFile<PendingFile>(pendingPath, { items: [] }, isPendingFile)
	await ensureJsonFile<DecisionsFile>(decisionsPath, { items: [] }, isDecisionsFile)
	await ensureJsonFile(aliasesPath, { aliases: {} }, isAliasMapFile)
	await ensureJsonFile<BootstrapDiscoveryFile>(bootstrapDiscoveryPath, {}, isBootstrapDiscoveryFile)
	await ensureJsonFile<QbittorrentFailuresFile>(qbittorrentFailuresPath, { items: [] }, isQbittorrentFailuresFile)
	await ensureJsonFile<QbittorrentSubmittedFile>(qbittorrentSubmittedPath, { items: [] }, isQbittorrentSubmittedFile)
	await ensureJsonFile<QbittorrentAddResponsesFile>(qbittorrentAddResponsesPath, { items: [] }, isQbittorrentAddResponsesFile)
	await ensureJsonFile<LastProcessed>(lastProcessedPath, {
		lastRunAt: new Date().toISOString(),
		bootstrapMode: 'assisted',
	}, isLastProcessedFile)
}

export async function loadBlacklist(): Promise<string[]> {
	const file = await readJsonFile<BlacklistFile>(blacklistPath, { items: [] }, isBlacklistFile)
	return Array.from(new Set(file.items.map((item) => item.trim().toLowerCase()).filter(Boolean)))
}

export async function saveBlacklist(items: string[]): Promise<void> {
	await writeJsonFileAtomic<BlacklistFile>(blacklistPath, { items: Array.from(new Set(items.map((item) => item.trim().toLowerCase()).filter(Boolean))) })
}

export async function loadPending(): Promise<PendingItem[]> {
	const file = await readJsonFile<PendingFile>(pendingPath, { items: [] }, isPendingFile)
	return file.items
}

export async function savePending(items: PendingItem[]): Promise<void> {
	await writeJsonFileAtomic<PendingFile>(pendingPath, { items })
}

export async function loadDecisions(): Promise<DecisionRecord[]> {
	const file = await readJsonFile<DecisionsFile>(decisionsPath, { items: [] }, isDecisionsFile)
	return file.items
}

export async function saveDecisions(items: DecisionRecord[]): Promise<void> {
	await writeJsonFileAtomic<DecisionsFile>(decisionsPath, { items })
}

export async function loadQbittorrentFailures(): Promise<QbittorrentFailureItem[]> {
	const file = await readJsonFile<QbittorrentFailuresFile>(qbittorrentFailuresPath, { items: [] }, isQbittorrentFailuresFile)
	return file.items
}

export async function saveQbittorrentFailures(items: QbittorrentFailureItem[]): Promise<void> {
	await writeJsonFileAtomic<QbittorrentFailuresFile>(qbittorrentFailuresPath, { items })
}

export async function loadQbittorrentSubmitted(): Promise<Set<string>> {
	const file = await readJsonFile<QbittorrentSubmittedFile>(qbittorrentSubmittedPath, { items: [] }, isQbittorrentSubmittedFile)
	return new Set(file.items)
}

export async function saveQbittorrentSubmitted(items: Set<string>): Promise<void> {
	await writeJsonFileAtomic<QbittorrentSubmittedFile>(qbittorrentSubmittedPath, { items: Array.from(items) })
}

export async function loadQbittorrentAddResponses(): Promise<QbittorrentAddApiResponseItem[]> {
	const file = await readJsonFile<QbittorrentAddResponsesFile>(qbittorrentAddResponsesPath, { items: [] }, isQbittorrentAddResponsesFile)
	return file.items
}

export async function saveQbittorrentAddResponses(items: QbittorrentAddApiResponseItem[]): Promise<void> {
	await writeJsonFileAtomic<QbittorrentAddResponsesFile>(qbittorrentAddResponsesPath, { items })
}

export function listDecisionTorrentIds(items: DecisionRecord[]): Set<string> {
	return new Set(items.map((item) => item.torrentId))
}

export function listPendingTorrentIds(items: PendingItem[]): Set<string> {
	return new Set(items.map((item) => item.torrentId))
}

export async function loadLastProcessed(): Promise<LastProcessed> {
	return readJsonFile<LastProcessed>(lastProcessedPath, {
		lastRunAt: new Date().toISOString(),
		bootstrapMode: 'assisted',
	}, isLastProcessedFile)
}

export async function saveLastProcessed(value: LastProcessed): Promise<void> {
	await writeJsonFileAtomic(lastProcessedPath, value)
}

export async function loadBootstrapDiscovery(): Promise<BootstrapDiscoveryResult | undefined> {
	const file = await readJsonFile<BootstrapDiscoveryFile>(bootstrapDiscoveryPath, {}, isBootstrapDiscoveryFile)
	return file.result
}

export async function saveBootstrapDiscovery(result: BootstrapDiscoveryResult | undefined): Promise<void> {
	await writeJsonFileAtomic<BootstrapDiscoveryFile>(bootstrapDiscoveryPath, result ? { result } : {})
}
