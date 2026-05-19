import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import type { BootstrapDiscoveryFile, DecisionRecord, DecisionsFile, PendingFile, PendingItem, QbittorrentFailuresFile } from '@shared/types'

export const projectRoot = process.cwd()
export const dataRoot = path.join(projectRoot, 'data')

export type JsonValidator<T> = (value: unknown) => value is T

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isStringRecord(value: unknown): value is Record<string, string> {
	return isRecord(value) && Object.values(value).every((item) => typeof item === 'string')
}

export function isFolderConfigFile(value: unknown): value is { folders?: string[]; paths?: string[]; watchRoots?: string[] } {
	if (!isRecord(value)) {
		return false
	}
	const { folders, paths, watchRoots } = value
	return (folders === undefined || isStringArray(folders)) && (paths === undefined || isStringArray(paths)) && (watchRoots === undefined || isStringArray(watchRoots))
}

export function isBlacklistFile(value: unknown): value is { items: string[] } {
	return isRecord(value) && isStringArray(value.items)
}

export function isPendingFile(value: unknown): value is PendingFile {
	if (!isRecord(value) || !Array.isArray(value.items)) {
		return false
	}
	return value.items.every((item) => isRecord(item) && typeof item.torrentId === 'string' && typeof item.status === 'string' && typeof item.reason === 'string' && isRecord(item.item))
}

export function isDecisionsFile(value: unknown): value is DecisionsFile {
	if (!isRecord(value) || !Array.isArray(value.items)) {
		return false
	}
	return value.items.every((item) => isRecord(item) && typeof item.torrentId === 'string' && typeof item.status === 'string' && typeof item.reason === 'string' && typeof item.createdAtUtc === 'string' && isRecord(item.item))
}

export function isQbittorrentFailuresFile(value: unknown): value is QbittorrentFailuresFile {
	if (!isRecord(value) || !Array.isArray(value.items)) {
		return false
	}
	return value.items.every((item) => isRecord(item)
		&& typeof item.torrentId === 'string'
		&& typeof item.createdAtUtc === 'string'
		&& typeof item.source === 'string'
		&& typeof item.decisionStatus === 'string'
		&& typeof item.decisionReason === 'string'
		&& isRecord(item.item)
		&& typeof item.targetFolderPath === 'string'
		&& typeof item.torrentFilePath === 'string'
		&& typeof item.torrentFilename === 'string'
		&& typeof item.errorKind === 'string'
		&& typeof item.errorMessage === 'string')
}

export function isAliasMapFile(value: unknown): value is { aliases: Record<string, string> } {
	return isRecord(value) && isStringRecord(value.aliases)
}

export function isBootstrapDiscoveryFile(value: unknown): value is BootstrapDiscoveryFile {
	if (!isRecord(value)) {
		return false
	}
	if (value.result === undefined) {
		return true
	}
	if (!isRecord(value.result)) {
		return false
	}
	return typeof value.result.startedAtUtc === 'string'
		&& typeof value.result.finishedAtUtc === 'string'
		&& typeof value.result.pagesScanned === 'number'
		&& typeof value.result.inspectedCount === 'number'
		&& typeof value.result.found === 'boolean'
		&& typeof value.result.reason === 'string'
}

export function isLastProcessedFile(value: unknown): value is { lastRunAt: string; bootstrapMode: 'assisted' | 'checkpoint'; lastTorrentId?: string; lastSeenPage?: number } {
	if (!isRecord(value)) {
		return false
	}
	if (typeof value.lastRunAt !== 'string') {
		return false
	}
	if (value.bootstrapMode !== 'assisted' && value.bootstrapMode !== 'checkpoint') {
		return false
	}
	if (value.lastTorrentId !== undefined && typeof value.lastTorrentId !== 'string') {
		return false
	}
	if (value.lastSeenPage !== undefined && typeof value.lastSeenPage !== 'number') {
		return false
	}
	return true
}

export async function ensureDirectory(dirPath: string): Promise<void> {
	await mkdir(dirPath, { recursive: true })
}

export async function readJsonFile<T>(filePath: string, fallback: T, validator?: JsonValidator<T>): Promise<T> {
	try {
		const raw = await readFile(filePath, 'utf8')
		const parsed = JSON.parse(raw) as unknown
		if (validator && !validator(parsed)) {
			return fallback
		}
		return parsed as T
	} catch (error) {
		const code = error instanceof Error && 'code' in error ? String((error as NodeJS.ErrnoException).code ?? '') : ''
		if (code === 'ENOENT') {
			return fallback
		}
		return fallback
	}
}

export async function writeJsonFileAtomic<T>(filePath: string, value: T): Promise<void> {
	await ensureDirectory(path.dirname(filePath))
	const tempPath = `${filePath}.tmp`
	await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
	await rename(tempPath, filePath)
}

export async function removeFileIfExists(filePath: string): Promise<void> {
	try {
		await rm(filePath)
	} catch (error) {
		const code = error instanceof Error && 'code' in error ? String((error as NodeJS.ErrnoException).code ?? '') : ''
		if (code !== 'ENOENT') {
			throw error
		}
	}
}

export async function ensureJsonFile<T>(filePath: string, fallback: T, validator?: JsonValidator<T>): Promise<T> {
	const value = await readJsonFile(filePath, fallback, validator)
	await writeJsonFileAtomic(filePath, value)
	return value
}