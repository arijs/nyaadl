import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { dataRoot, isAliasMapFile, isFolderConfigFile, readJsonFile, writeJsonFileAtomic } from '../storage/jsonStore'
import { buildCanonicalSeriesKey, buildMatchCandidates, buildNormalizedKey, deriveSeriesBase, extractResolution, normalizeText, sanitizePathSegment } from './normalizeService'
import type { AliasMapFile, FolderConfigFile, WatchTarget } from '@shared/types'

const folderConfigPath = path.join(dataRoot, 'folders-config.json')
const aliasesPath = path.join(dataRoot, 'aliases.json')

function isValidAliasToken(value: string): boolean {
	return Boolean(value) && value !== 'unknown'
}

export interface WatchRootStatus {
	path: string
	exists: boolean
	isDirectory: boolean
	watchTargetsCount: number
	issue?: string
}

function normalizeConfiguredPaths(config: FolderConfigFile): string[] {
	const rawPaths = config.folders ?? config.paths ?? config.watchRoots ?? []
	return Array.from(new Set(rawPaths.map((candidate) => path.resolve(candidate).trim()).filter(Boolean)))
}

export async function validateWatchRootPath(root: string): Promise<string> {
	const candidate = root.trim()
	if (!candidate) {
		throw new Error('Missing folder path')
	}

	const normalizedRoot = path.resolve(candidate)
	if (!normalizedRoot) {
		throw new Error('Missing folder path')
	}

	try {
		const info = await stat(normalizedRoot)
		if (!info.isDirectory()) {
			throw new Error('Folder path must point to a directory')
		}
	} catch (error) {
		if (error instanceof Error && error.message === 'Folder path must point to a directory') {
			throw error
		}
		if (error instanceof Error && error.message === 'Missing folder path') {
			throw error
		}
		if (error instanceof Error && error.message.startsWith('Folder path does not exist:')) {
			throw new Error(`Folder path does not exist: ${normalizedRoot}`)
		}
		throw error
	}

	return normalizedRoot
}

export async function inspectWatchRoots(roots: string[]): Promise<WatchRootStatus[]> {
	const statuses: WatchRootStatus[] = []
	for (const root of roots) {
		const normalizedRoot = path.resolve(root).trim()
		if (!normalizedRoot) {
			continue
		}
		try {
			const info = await stat(normalizedRoot)
			statuses.push({
				path: normalizedRoot,
				exists: true,
				isDirectory: info.isDirectory(),
				watchTargetsCount: 0,
				issue: info.isDirectory() ? undefined : 'Not a directory',
			})
		} catch {
			statuses.push({
				path: normalizedRoot,
				exists: false,
				isDirectory: false,
				watchTargetsCount: 0,
				issue: 'Folder does not exist',
			})
		}
	}
	return statuses
}

export async function loadFolderConfig(): Promise<FolderConfigFile> {
	return readJsonFile<FolderConfigFile>(folderConfigPath, { folders: [] }, isFolderConfigFile)
}

export async function saveFolderConfig(config: FolderConfigFile): Promise<string[]> {
	const folders = normalizeConfiguredPaths(config)
	await writeJsonFileAtomic<FolderConfigFile>(folderConfigPath, { folders })
	return folders
}

export async function loadAliases(): Promise<Record<string, string>> {
	const file = await readJsonFile<AliasMapFile>(aliasesPath, { aliases: {} }, isAliasMapFile)
	return Object.fromEntries(
		Object.entries(file.aliases)
			.map(([key, value]) => [normalizeText(key), normalizeText(value)] as const)
			.filter(([key, value]) => isValidAliasToken(key) && isValidAliasToken(value)),
	)
}

export async function upsertAliases(entries: Array<[string, string]>): Promise<Record<string, string>> {
	const file = await readJsonFile<AliasMapFile>(aliasesPath, { aliases: {} }, isAliasMapFile)
	const aliases = Object.fromEntries(
		Object.entries(file.aliases)
			.map(([key, value]) => [normalizeText(key), normalizeText(value)] as const)
			.filter(([key, value]) => isValidAliasToken(key) && isValidAliasToken(value)),
	) as Record<string, string>
	for (const [source, target] of entries) {
		const normalizedSource = normalizeText(source)
		const normalizedTarget = normalizeText(target)
		if (isValidAliasToken(normalizedSource) && isValidAliasToken(normalizedTarget)) {
			aliases[normalizedSource] = normalizedTarget
		}
	}
	await writeJsonFileAtomic<AliasMapFile>(aliasesPath, { aliases })
	return Object.fromEntries(
		Object.entries(aliases)
			.map(([key, value]) => [normalizeText(key), normalizeText(value)] as const)
			.filter(([key, value]) => isValidAliasToken(key) && isValidAliasToken(value)),
	)
}

export async function loadWatchRoots(): Promise<string[]> {
	const config = await loadFolderConfig()
	return normalizeConfiguredPaths(config)
}

export async function setWatchRoots(roots: string[]): Promise<string[]> {
	return saveFolderConfig({ folders: roots })
}

export async function addWatchRoot(root: string): Promise<string[]> {
	const current = await loadWatchRoots()
	return saveFolderConfig({ folders: [...current, root] })
}

export async function removeWatchRoot(root: string): Promise<string[]> {
	const target = path.resolve(root).trim()
	const current = await loadWatchRoots()
	return saveFolderConfig({ folders: current.filter((candidate) => candidate !== target) })
}

export function buildWatchTargetMatchCandidates(
	folderName: string,
	seriesBase: string,
	seriesKey: string,
	aliases: Record<string, string>,
): string[] {
	const aliasCandidates = Object.entries(aliases)
		.filter(([, target]) => target === seriesKey)
		.map(([source]) => source)

	return buildMatchCandidates(folderName, [seriesBase, seriesKey, sanitizePathSegment(folderName), ...aliasCandidates])
}

export async function scanWatchTargets(): Promise<WatchTarget[]> {
	const aliases = await loadAliases()
	const roots = await loadWatchRoots()
	const targets: WatchTarget[] = []

	for (const rootPath of roots) {
		const entries = await readdir(rootPath, { withFileTypes: true }).catch(() => [])
		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue
			}
			const folderName = entry.name
			const folderPath = path.join(rootPath, folderName)
			const seriesBase = deriveSeriesBase(folderName)
			const resolution = extractResolution(folderName)
			const seriesKey = buildCanonicalSeriesKey(seriesBase, aliases)
			const normalizedKey = buildNormalizedKey(seriesKey, resolution)
			const matchCandidates = buildWatchTargetMatchCandidates(folderName, seriesBase, seriesKey, aliases)

			targets.push({
				folderName,
				folderPath,
				seriesKey,
				resolution,
				normalizedKey,
				matchCandidates,
			})
		}
	}

	return targets.sort((left, right) => left.folderName.localeCompare(right.folderName))
}
