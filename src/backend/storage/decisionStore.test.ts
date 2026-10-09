import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { DecisionRecord } from '@shared/types'
import { createDecisionStore, decisionMonthKey, toPersistedDecision } from './decisionStore.js'

function decision(torrentId: string, createdAtUtc: string, extraItemFields: Record<string, unknown> = {}): DecisionRecord {
	return {
		torrentId,
		status: 'blocked',
		reason: 'series+resolution blacklisted',
		createdAtUtc,
		item: {
			torrentId,
			title: `Title ${torrentId}`,
			viewUrl: `/view/${torrentId}`,
			downloadUrl: `/download/${torrentId}.torrent`,
			page: 1,
			seriesBaseRaw: 'some series',
			resolution: '1080p',
			matchCandidates: ['some series'],
			...extraItemFields,
		},
	}
}

async function withTempDataRoot(run: (paths: { dataRoot: string; dirPath: string; legacyPath: string }) => Promise<void>): Promise<void> {
	const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'nyaadl-decisions-'))
	try {
		await run({ dataRoot, dirPath: path.join(dataRoot, 'decisions'), legacyPath: path.join(dataRoot, 'decisions.json') })
	} finally {
		await rm(dataRoot, { recursive: true, force: true })
	}
}

async function readLines(filePath: string): Promise<string[]> {
	return (await readFile(filePath, 'utf8')).split('\n').filter(Boolean)
}

test('decisionMonthKey uses the createdAtUtc month and falls back to unknown', () => {
	assert.equal(decisionMonthKey('2026-10-09T17:09:02.016Z'), '2026-10')
	assert.equal(decisionMonthKey('garbage'), 'unknown')
})

test('load on an empty data root returns no decisions and creates the decisions directory', async () => {
	await withTempDataRoot(async ({ dirPath, legacyPath }) => {
		const store = createDecisionStore(dirPath, legacyPath)
		assert.deepEqual(await store.load(), [])
		assert.deepEqual(await readdir(dirPath), [])
	})
})

test('save splits decisions into monthly JSONL files and a fresh store reloads them in order', async () => {
	await withTempDataRoot(async ({ dirPath, legacyPath }) => {
		const store = createDecisionStore(dirPath, legacyPath)
		const items = await store.load()
		items.push(decision('1', '2026-09-30T23:59:59.000Z'), decision('2', '2026-10-01T00:00:00.000Z'), decision('3', '2026-10-02T00:00:00.000Z'))
		await store.save(items)

		assert.deepEqual((await readdir(dirPath)).sort(), ['2026-09.jsonl', '2026-10.jsonl'])
		assert.equal((await readLines(path.join(dirPath, '2026-10.jsonl'))).length, 2)

		const reloaded = await createDecisionStore(dirPath, legacyPath).load()
		assert.deepEqual(reloaded.map((record) => record.torrentId), ['1', '2', '3'])
		assert.deepEqual(reloaded[1], items[1])
	})
})

test('save only appends records pushed since the previous save', async () => {
	await withTempDataRoot(async ({ dirPath, legacyPath }) => {
		const store = createDecisionStore(dirPath, legacyPath)
		const items = await store.load()
		items.push(decision('1', '2026-10-01T00:00:00.000Z'))
		await store.save(items)
		await store.save(items)
		items.push(decision('2', '2026-10-02T00:00:00.000Z'))
		await store.save(items)

		const lines = await readLines(path.join(dirPath, '2026-10.jsonl'))
		assert.deepEqual(lines.map((line) => (JSON.parse(line) as DecisionRecord).torrentId), ['1', '2'])
	})
})

test('concurrent saves never append the same record twice', async () => {
	await withTempDataRoot(async ({ dirPath, legacyPath }) => {
		const store = createDecisionStore(dirPath, legacyPath)
		const items = await store.load()
		items.push(decision('1', '2026-10-01T00:00:00.000Z'))
		const first = store.save(items)
		items.push(decision('2', '2026-10-01T00:00:01.000Z'))
		await Promise.all([first, store.save(items), store.save(items)])

		assert.equal((await readLines(path.join(dirPath, '2026-10.jsonl'))).length, 2)
	})
})

test('save rejects a history that shrank, since decisions are append-only', async () => {
	await withTempDataRoot(async ({ dirPath, legacyPath }) => {
		const store = createDecisionStore(dirPath, legacyPath)
		const items = await store.load()
		items.push(decision('1', '2026-10-01T00:00:00.000Z'), decision('2', '2026-10-01T00:00:01.000Z'))
		await store.save(items)
		await assert.rejects(store.save(items.slice(0, 1)), /append-only/)
	})
})

test('persisted items keep TorrentItem fields and internalNames but drop leaked runtime fields', () => {
	const record = decision('1', '2026-10-01T00:00:00.000Z', {
		status: 'pending',
		reason: 'requires approval',
		seriesKey: 'some series',
		matchedTarget: { folderPath: 'D:/anime/Some Series' },
		internalNames: ['Some Series - 01.mkv'],
		sizeText: '1.0 GiB',
	})
	const persisted = toPersistedDecision(record)
	assert.deepEqual(Object.keys(persisted.item).sort(), [
		'downloadUrl', 'internalNames', 'matchCandidates', 'page', 'resolution', 'seriesBaseRaw', 'sizeText', 'title', 'torrentId', 'viewUrl',
	])
	assert.equal(persisted.status, 'blocked')
	assert.equal(persisted.reason, 'series+resolution blacklisted')
	assert.ok('matchedTarget' in record.item, 'the in-memory record is not mutated')
})

test('a truncated trailing line is skipped, kept aside, and the file is repaired for further appends', async () => {
	await withTempDataRoot(async ({ dirPath, legacyPath }) => {
		await mkdir(dirPath, { recursive: true })
		const monthPath = path.join(dirPath, '2026-10.jsonl')
		await writeFile(monthPath, `${JSON.stringify(decision('1', '2026-10-01T00:00:00.000Z'))}\n{"torrentId":"2","sta`, 'utf8')

		const store = createDecisionStore(dirPath, legacyPath)
		const items = await store.load()
		assert.deepEqual(items.map((record) => record.torrentId), ['1'])
		assert.deepEqual(await readLines(`${monthPath}.rejected`), ['{"torrentId":"2","sta'])

		items.push(decision('3', '2026-10-03T00:00:00.000Z'))
		await store.save(items)
		const reloaded = await createDecisionStore(dirPath, legacyPath).load()
		assert.deepEqual(reloaded.map((record) => record.torrentId), ['1', '3'])
	})
})

test('a valid last line missing its newline is repaired before the next append', async () => {
	await withTempDataRoot(async ({ dirPath, legacyPath }) => {
		await mkdir(dirPath, { recursive: true })
		const monthPath = path.join(dirPath, '2026-10.jsonl')
		await writeFile(monthPath, JSON.stringify(decision('1', '2026-10-01T00:00:00.000Z')), 'utf8')

		const store = createDecisionStore(dirPath, legacyPath)
		const items = await store.load()
		items.push(decision('2', '2026-10-02T00:00:00.000Z'))
		await store.save(items)

		assert.equal((await readLines(monthPath)).length, 2)
	})
})

test('legacy decisions.json is migrated into monthly files, preserving order, and renamed to .bak', async () => {
	await withTempDataRoot(async ({ dataRoot, dirPath, legacyPath }) => {
		const legacyItems = [
			decision('1', '2026-05-10T00:00:00.000Z', { status: 'pending', matchedTarget: { folderPath: 'x' } }),
			decision('2', '2026-06-01T00:00:00.000Z'),
			decision('1', '2026-06-02T00:00:00.000Z'),
		]
		await writeFile(legacyPath, JSON.stringify({ items: legacyItems }, null, 2), 'utf8')

		const loaded = await createDecisionStore(dirPath, legacyPath).load()
		assert.deepEqual(loaded.map((record) => `${record.torrentId}@${record.createdAtUtc.slice(0, 10)}`), ['1@2026-05-10', '2@2026-06-01', '1@2026-06-02'])
		assert.equal('matchedTarget' in loaded[0]!.item, false)
		assert.deepEqual((await readdir(dirPath)).sort(), ['2026-05.jsonl', '2026-06.jsonl'])
		assert.deepEqual((await readdir(dataRoot)).sort(), ['decisions', 'decisions.json.bak'])

		const again = await createDecisionStore(dirPath, legacyPath).load()
		assert.equal(again.length, 3)
	})
})

test('migration keeps invalid legacy records in a .rejected.json file', async () => {
	await withTempDataRoot(async ({ dirPath, legacyPath }) => {
		await writeFile(legacyPath, JSON.stringify({ items: [decision('1', '2026-10-01T00:00:00.000Z'), { torrentId: 'broken' }] }), 'utf8')

		const loaded = await createDecisionStore(dirPath, legacyPath).load()
		assert.equal(loaded.length, 1)
		const rejected = JSON.parse(await readFile(`${legacyPath}.rejected.json`, 'utf8')) as { items: unknown[] }
		assert.deepEqual(rejected.items, [{ torrentId: 'broken' }])
	})
})

test('a leftover staging directory from an interrupted migration is discarded and the migration reruns', async () => {
	await withTempDataRoot(async ({ dirPath, legacyPath }) => {
		await mkdir(`${dirPath}.migrating`, { recursive: true })
		await writeFile(path.join(`${dirPath}.migrating`, '2026-01.jsonl'), 'stale\n', 'utf8')
		await writeFile(legacyPath, JSON.stringify({ items: [decision('1', '2026-10-01T00:00:00.000Z')] }), 'utf8')

		const loaded = await createDecisionStore(dirPath, legacyPath).load()
		assert.deepEqual(loaded.map((record) => record.torrentId), ['1'])
		assert.deepEqual(await readdir(dirPath), ['2026-10.jsonl'])
	})
})

test('a corrupt legacy file aborts loading instead of silently wiping history', async () => {
	await withTempDataRoot(async ({ dataRoot, dirPath, legacyPath }) => {
		await writeFile(legacyPath, '{"items": [', 'utf8')

		await assert.rejects(createDecisionStore(dirPath, legacyPath).load(), /invalid JSON/)
		assert.deepEqual(await readdir(dataRoot), ['decisions.json'])
	})
})
