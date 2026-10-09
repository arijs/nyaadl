import path from 'node:path'
import { readdir, readFile } from 'node:fs/promises'
import type { DecisionRecord, PendingItem, TorrentItem } from '@shared/types'
import { dataRoot } from '../storage/jsonStore'
import { decisionsState, pendingState } from './runtimeStateService'
import { markDecisionsDirty, saveDecisions, savePending } from './stateService'

// Static listing fields that older records may lack. seeders/leechers/downloads are
// left alone on purpose: they are a snapshot of the moment the decision was taken.
const backfillKeys = ['category', 'sizeText', 'publishedAtUtc'] as const

function fillMissing(target: TorrentItem, source: TorrentItem): boolean {
	let changed = false
	for (const key of backfillKeys) {
		if (target[key] === undefined && source[key] !== undefined) {
			target[key] = source[key]
			changed = true
		}
	}
	return changed
}

// Mutates matching records in place; returns the changed decisions and whether pending changed.
export function backfillTorrentItems(fresh: TorrentItem[], decisions: DecisionRecord[], pending: PendingItem[]): { decisions: DecisionRecord[]; pendingChanged: boolean } {
	const byId = new Map(fresh.map((item) => [item.torrentId, item]))
	const changedDecisions = decisions.filter((record) => {
		const source = byId.get(record.torrentId)
		return source ? fillMissing(record.item, source) : false
	})
	let pendingChanged = false
	for (const entry of pending) {
		const source = byId.get(entry.torrentId)
		if (source && fillMissing(entry.item, source)) {
			pendingChanged = true
		}
	}
	return { decisions: changedDecisions, pendingChanged }
}

// Decisions are written by the caller's next saveDecisions; pending is saved here.
export async function applyTorrentItemBackfill(fresh: TorrentItem[]): Promise<number> {
	const { decisions, pendingChanged } = backfillTorrentItems(fresh, decisionsState, pendingState)
	markDecisionsDirty(decisions)
	if (pendingChanged) {
		await savePending(pendingState)
	}
	return decisions.length
}

// ponytail: rescans every torrents/*/snapshot.json on each startup while some record still
// lacks a category (torrents absent from all snapshots never get one). Add an on-disk marker if this gets slow.
export async function backfillFromLocalSnapshots(): Promise<void> {
	if (!decisionsState.some((record) => record.item.category === undefined) && !pendingState.some((entry) => entry.item.category === undefined)) {
		return
	}
	const torrentsRoot = path.join(dataRoot, '..', 'torrents')
	const folders = (await readdir(torrentsRoot, { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isDirectory())
	const fresh: TorrentItem[] = []
	let snapshotCount = 0
	for (const folder of folders) {
		try {
			fresh.push(...JSON.parse(await readFile(path.join(torrentsRoot, folder.name, 'snapshot.json'), 'utf8')) as TorrentItem[])
			snapshotCount++
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				console.warn(`Skipping ${folder.name}/snapshot.json for backfill: ${error instanceof Error ? error.message : String(error)}`)
			}
		}
	}
	const changed = await applyTorrentItemBackfill(fresh)
	if (changed > 0) {
		await saveDecisions(decisionsState)
		console.info(`Backfilled ${changed} decision records from ${snapshotCount} local snapshots`)
	}
}
