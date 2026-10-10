import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findSeriesImage, isSafeSeriesKey, listSavedSeriesSources, readSeriesJson, saveSeriesImage, writeSeriesJson } from './seriesStore'

const imageResponse = (contentType: string) => (async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': contentType } })) as unknown as typeof fetch

test('series JSON files round-trip inside data/series/<slug>/', async () => {
	const root = mkdtempSync(join(tmpdir(), 'series-'))
	assert.equal(await readSeriesJson('chii-fuyo', 'mal', root), undefined)
	await writeSeriesJson('chii-fuyo', 'mal', { title: 'Chii Fuyo' }, root)
	assert.deepEqual(await readSeriesJson('chii-fuyo', 'mal', root), { title: 'Chii Fuyo' })
})

test('listSavedSeriesSources reports which source files exist', async () => {
	const root = mkdtempSync(join(tmpdir(), 'series-'))
	const sources = ['erai', 'mal', 'anidb'] as const
	assert.deepEqual(await listSavedSeriesSources('chii-fuyo', sources, root), [])
	await writeSeriesJson('chii-fuyo', 'erai', {}, root)
	await writeSeriesJson('chii-fuyo', 'anidb', {}, root)
	assert.deepEqual(await listSavedSeriesSources('chii-fuyo', sources, root), ['erai', 'anidb'])
})

test('saveSeriesImage names the file by content-type and replaces the previous one', async () => {
	const root = mkdtempSync(join(tmpdir(), 'series-'))
	await saveSeriesImage('chii-fuyo', 'mal', 'https://cdn/x', imageResponse('image/jpeg'), root)
	assert.deepEqual(await findSeriesImage('chii-fuyo', 'mal', root), { filePath: join(root, 'chii-fuyo', 'mal.jpg'), contentType: 'image/jpeg' })
	await saveSeriesImage('chii-fuyo', 'mal', 'https://cdn/x', imageResponse('image/webp; charset=binary'), root)
	assert.deepEqual(readdirSync(join(root, 'chii-fuyo')), ['mal.webp'])
	// Not an image: keep the old file, don't throw.
	await saveSeriesImage('chii-fuyo', 'mal', 'https://cdn/x', imageResponse('text/html'), root)
	assert.deepEqual(readdirSync(join(root, 'chii-fuyo')), ['mal.webp'])
})

test('isSafeSeriesKey rejects path traversal', async () => {
	assert.equal(isSafeSeriesKey('replica-datte-koi-wo-suru'), true)
	assert.equal(isSafeSeriesKey('29_sai-dokushin-chuuken-boukensha-no-nichijou'), true)
	assert.equal(isSafeSeriesKey('_hidden'), false)
	assert.equal(isSafeSeriesKey('../secrets'), false)
	assert.equal(isSafeSeriesKey('a/b'), false)
	assert.equal(isSafeSeriesKey(''), false)
	await assert.rejects(writeSeriesJson('..', 'erai', {}), /Invalid series slug/)
})
