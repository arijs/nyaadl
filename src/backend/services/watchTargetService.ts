import path from 'node:path'
import type { WatchTarget } from '@shared/types'
import type { WatchTargetResponse } from '@shared/api'

export interface WatchTargetQuery {
	page?: number
	pageSize?: number
	query?: string
	resolutionFilter?: string
	rootFilter?: string
}

export interface WatchTargetRow {
	target: WatchTarget
	rootPath?: string
	rootName: string
}

export interface WatchTargetPage extends WatchTargetResponse {
	items: WatchTargetRow[]
}

function normalizeQuery(value: string | undefined): string {
	return value?.trim().toLowerCase() ?? ''
}

function getRootMatch(folderPath: string, roots: string[]): string | undefined {
	return roots
		.filter((rootPath) => folderPath.toLowerCase().startsWith(rootPath.toLowerCase()))
		.sort((left, right) => right.length - left.length)[0]
}

function toRow(target: WatchTarget, roots: string[]): WatchTargetRow {
	const rootPath = getRootMatch(target.folderPath, roots)
	return {
		target,
		rootPath,
		rootName: rootPath ? path.basename(rootPath) || rootPath : 'Unknown root',
	}
}

export function buildWatchTargetPage(targets: WatchTarget[], roots: string[], query: WatchTargetQuery = {}): WatchTargetPage {
	const pageSize = Math.max(1, Math.floor(query.pageSize ?? 10))
	const selectedResolution = query.resolutionFilter?.trim() ?? 'all'
	const selectedRoot = query.rootFilter?.trim() ?? 'all'
	const searchQuery = normalizeQuery(query.query)
	const rows = targets.map((target) => toRow(target, roots))
	const searchFiltered = rows.filter((row) => {
		if (!searchQuery) {
			return true
		}
		const haystack = `${row.target.folderName} ${row.target.normalizedKey} ${row.rootName}`.toLowerCase()
		return haystack.includes(searchQuery)
	})
	const rootFiltered = selectedRoot === 'all'
		? searchFiltered
		: searchFiltered.filter((row) => row.rootName === selectedRoot)
	const filtered = selectedResolution === 'all'
		? rootFiltered
		: rootFiltered.filter((row) => row.target.resolution === selectedResolution)

	const rootCounts = searchFiltered.reduce<Record<string, number>>((acc, row) => {
		acc[row.rootName] = (acc[row.rootName] ?? 0) + 1
		return acc
	}, {})
	const rootOptions = ['all', ...Array.from(new Set(searchFiltered.map((row) => row.rootName))).sort((left, right) => left.localeCompare(right))]
	const resolutionCounts = rootFiltered.reduce<Record<string, number>>((acc, row) => {
		acc[row.target.resolution] = (acc[row.target.resolution] ?? 0) + 1
		return acc
	}, {})
	const resolutionOptions = ['all', ...Array.from(new Set(rootFiltered.map((row) => row.target.resolution))).sort((left, right) => left.localeCompare(right))]
	const totalItems = filtered.length
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
	const currentPage = Math.min(Math.max(1, Math.floor(query.page ?? 1)), totalPages)
	const start = (currentPage - 1) * pageSize

	return {
		items: filtered.slice(start, start + pageSize),
		currentPage,
		pageSize,
		totalItems,
		totalPages,
		resolutionCounts,
		resolutionOptions,
		rootCounts,
		rootOptions,
	}
}