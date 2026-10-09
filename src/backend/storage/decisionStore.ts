import { appendFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { DecisionRecord } from '@shared/types'
import { isDecisionRecord, writeJsonFileAtomic, writeTextFileAtomic } from './jsonStore'

// Decisions are append-only history, stored as one JSONL file per month
// (data/decisions/YYYY-MM.jsonl, month taken from createdAtUtc). Saving only
// appends records that were pushed since the last save, so the cost of a save
// no longer grows with the size of the history.

export interface DecisionStore {
	load(): Promise<DecisionRecord[]>
	save(items: DecisionRecord[]): Promise<void>
}

const monthFilePattern = /^(\d{4}-\d{2}|unknown)\.jsonl$/

export function decisionMonthKey(createdAtUtc: string): string {
	return /^\d{4}-\d{2}/.exec(createdAtUtc)?.[0] ?? 'unknown'
}

function serializeDecisions(records: DecisionRecord[]): string {
	return records.map((record) => `${JSON.stringify(record)}\n`).join('')
}

function groupConsecutiveByMonth(records: DecisionRecord[]): Array<{ month: string; records: DecisionRecord[] }> {
	const groups: Array<{ month: string; records: DecisionRecord[] }> = []
	for (const record of records) {
		const month = decisionMonthKey(record.createdAtUtc)
		const last = groups[groups.length - 1]
		if (last && last.month === month) {
			last.records.push(record)
		} else {
			groups.push({ month, records: [record] })
		}
	}
	return groups
}

async function pathExists(filePath: string): Promise<boolean> {
	return stat(filePath).then(() => true, () => false)
}

export function createDecisionStore(dirPath: string, legacyFilePath: string): DecisionStore {
	let persistedCount = 0
	let saveQueue: Promise<void> = Promise.resolve()

	function monthFilePath(month: string): string {
		return path.join(dirPath, `${month}.jsonl`)
	}

	async function migrateLegacyFile(): Promise<void> {
		if (await pathExists(dirPath) || !(await pathExists(legacyFilePath))) {
			return
		}
		let parsed: unknown
		try {
			parsed = JSON.parse(await readFile(legacyFilePath, 'utf8'))
		} catch (error) {
			throw new Error(`Cannot migrate ${legacyFilePath}: invalid JSON (${error instanceof Error ? error.message : String(error)}). Fix or remove the file and restart.`)
		}
		const items: unknown[] = typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { items?: unknown }).items)
			? (parsed as { items: unknown[] }).items
			: []
		const valid = items.filter(isDecisionRecord)
		const rejected = items.filter((item) => !isDecisionRecord(item))

		// Build the new layout in a sibling directory and rename it into place, so an
		// interrupted migration never leaves a half-populated decisions directory.
		const stagingPath = `${dirPath}.migrating`
		await rm(stagingPath, { recursive: true, force: true })
		await mkdir(stagingPath, { recursive: true })
		const byMonth = new Map<string, DecisionRecord[]>()
		for (const record of valid) {
			const month = decisionMonthKey(record.createdAtUtc)
			const monthRecords = byMonth.get(month) ?? []
			monthRecords.push(record)
			byMonth.set(month, monthRecords)
		}
		for (const [month, records] of byMonth) {
			await writeFile(path.join(stagingPath, `${month}.jsonl`), serializeDecisions(records), 'utf8')
		}
		if (rejected.length > 0) {
			await writeJsonFileAtomic(`${legacyFilePath}.rejected.json`, { items: rejected })
		}
		await rename(stagingPath, dirPath)
		await rename(legacyFilePath, `${legacyFilePath}.bak`)
		console.info(`Migrated ${valid.length} decisions from ${legacyFilePath} into ${byMonth.size} monthly files${rejected.length > 0 ? ` (${rejected.length} invalid records kept in ${legacyFilePath}.rejected.json)` : ''}`)
	}

	async function readMonthFile(filePath: string): Promise<DecisionRecord[]> {
		const raw = await readFile(filePath, 'utf8')
		const records: DecisionRecord[] = []
		const rejectedLines: string[] = []
		for (const line of raw.split('\n')) {
			if (!line.trim()) {
				continue
			}
			let parsed: unknown
			try {
				parsed = JSON.parse(line)
			} catch {
				parsed = undefined
			}
			if (isDecisionRecord(parsed)) {
				records.push(parsed)
			} else {
				rejectedLines.push(line)
			}
		}
		// A crash mid-append can leave a truncated last line (or a line without its
		// trailing newline). Rewrite the file with the valid records only, so the next
		// append starts on a clean line, and keep whatever was dropped for inspection.
		if (rejectedLines.length > 0 || (raw.length > 0 && !raw.endsWith('\n'))) {
			if (rejectedLines.length > 0) {
				await appendFile(`${filePath}.rejected`, rejectedLines.map((line) => `${line}\n`).join(''), 'utf8')
				console.warn(`Ignored ${rejectedLines.length} invalid decision line(s) in ${filePath} (kept in ${filePath}.rejected)`)
			}
			await writeTextFileAtomic(filePath, serializeDecisions(records))
		}
		return records
	}

	async function load(): Promise<DecisionRecord[]> {
		await migrateLegacyFile()
		await mkdir(dirPath, { recursive: true })
		const fileNames = (await readdir(dirPath)).filter((name) => monthFilePattern.test(name)).sort()
		const records: DecisionRecord[] = []
		for (const fileName of fileNames) {
			records.push(...await readMonthFile(path.join(dirPath, fileName)))
		}
		persistedCount = records.length
		return records
	}

	async function appendUnsaved(items: DecisionRecord[]): Promise<void> {
		if (items.length < persistedCount) {
			throw new Error(`Decisions are append-only: got ${items.length} records but ${persistedCount} are already persisted`)
		}
		const unsaved = items.slice(persistedCount)
		if (unsaved.length === 0) {
			return
		}
		await mkdir(dirPath, { recursive: true })
		for (const group of groupConsecutiveByMonth(unsaved)) {
			await appendFile(monthFilePath(group.month), serializeDecisions(group.records), 'utf8')
			persistedCount += group.records.length
		}
	}

	function save(items: DecisionRecord[]): Promise<void> {
		// Serialize saves so overlapping requests never append the same tail twice.
		const run = saveQueue.then(() => appendUnsaved(items))
		saveQueue = run.catch(() => undefined)
		return run
	}

	return { load, save }
}
