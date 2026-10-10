import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { DecisionRecord, TorrentItem, WatchTarget } from '@shared/types'
import { analyzeFingerprintCombos } from './localLibraryService'
import { buildLocalFileTorrentIndex, listWatchTargetFiles } from './watchTargetFilesService'

function decision(torrentId: string, title: string, status: DecisionRecord['status'], internalNames?: string[]): DecisionRecord {
	const item = { torrentId, title, page: 1, seriesBaseRaw: 'aiomodarkelf', resolution: '480p', matchCandidates: ['aiomodarkelf'] } as TorrentItem
	return { torrentId, status, reason: '', createdAtUtc: '', item, ...(internalNames ? { internalNames } : {}) } as DecisionRecord
}

const adn01 = '[Erai-raws] aiomodarkelf - 01 [480p ADN WEB-DL AVC AAC][MultiSub][F1600001].mkv'
const adn02 = '[Erai-raws] aiomodarkelf - 02 [480p ADN WEB-DL AVC AAC][MultiSub][F1600002].mkv'
const hidive01 = '[Erai-raws] aiomodarkelf - 01 [480p HIDIVE WEB-DL AVC AAC][3C062332].mkv'
const hidive02 = '[Erai-raws] aiomodarkelf - 02 [480p HIDIVE WEB-DL AVC AAC][B7A0581A].mkv'

test('buildLocalFileTorrentIndex matches by internal name, by title and by CRC32 hash, latest decision first', () => {
	const find = buildLocalFileTorrentIndex([
		decision('1', 'batch title', 'approved', [adn01]),
		decision('2', adn02.replace(/\.mkv$/, ''), 'pending'),
		decision('2', adn02.replace(/\.mkv$/, ''), 'approved'),
		decision('3', 'Dr. Stone renamed release [3C062332]', 'auto_downloaded'),
	])
	assert.equal(find(adn01)?.torrentId, '1')
	assert.equal(find(adn02)?.status, 'approved')
	assert.equal(find(hidive01)?.torrentId, '3')
	assert.equal(find(hidive02), undefined)
})

test('listWatchTargetFiles lists only the requested combo, sorted by episode, with the torrent when known', async () => {
	const folderPath = await mkdtemp(path.join(os.tmpdir(), 'nyaadl-target-'))
	for (const name of [adn02, hidive01, adn01, hidive02, 'notes.txt']) {
		await writeFile(path.join(folderPath, name), 'x')
	}
	const target: WatchTarget = { folderName: 'aiomodarkelf [480p]', folderPath, seriesKey: 'aiomodarkelf', resolution: '480p', normalizedKey: 'aiomodarkelf::480p', matchCandidates: ['aiomodarkelf'] }
	const decisions = [decision('2', adn02.replace(/\.mkv$/, ''), 'approved')]

	const combos = await analyzeFingerprintCombos(target)
	assert.deepEqual(combos.map((combo) => combo.key).sort(), ['adn|none|true', 'hidive|none|false'])

	const adnFiles = await listWatchTargetFiles(target, decisions, 'adn|none|true')
	assert.deepEqual(adnFiles.map((file) => file.name), [adn01, adn02])
	assert.equal(adnFiles[0]?.torrent, undefined)
	assert.equal(adnFiles[1]?.torrent?.torrentId, '2')
	assert.equal(adnFiles[1]?.sizeBytes, 1)

	const allFiles = await listWatchTargetFiles(target, decisions)
	assert.equal(allFiles.length, 4)
})
