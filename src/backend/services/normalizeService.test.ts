import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deriveSeriesBase, deriveFolderNameFromTitle } from './normalizeService.js'

test('deriveSeriesBase collapses labelled special episodes onto the base series key', () => {
	const titles = [
		'[Erai-raws] Lord of Mysteries - Special 03 (CA) [480p CR WEB-DL AVC AAC][MultiSub][77D5AF7A]',
		'[Erai-raws] Lord of Mysteries - Special 01 [1080p][MultiSub][AABBCCDD]',
		'[Erai-raws] Lord of Mysteries - OVA 02 (CA) [720p][MultiSub][ABCDEF12]',
		'[Erai-raws] Lord of Mysteries - 03 [1080p][MultiSub][ABCDEF12]',
		'[Erai-raws] Lord of Mysteries - 03v2 [1080p][ABCDEF12]',
	]
	for (const title of titles) {
		assert.equal(deriveSeriesBase(title), 'lord of mysteries', `failed for: ${title}`)
	}
})

test('deriveSeriesBase absorbs trailing finale and batch markers', () => {
	assert.equal(deriveSeriesBase('[Erai-raws] Kaiju No.8 - 12 END [1080p][ABCDEF12]'), 'kaiju no.8')
	assert.equal(deriveSeriesBase('[Erai-raws] Kaiju No.8 - 11 [1080p][ABCDEF12]'), 'kaiju no.8')
	assert.equal(deriveSeriesBase('[Erai-raws] Some Show - 13 FINAL [720p][ABCDEF12]'), 'some show')
	assert.equal(deriveSeriesBase('[Erai-raws] Some Show - 12 BATCH [1080p][ABCDEF12]'), 'some show')
})

test('deriveSeriesBase keeps real title words and high episode numbers intact', () => {
	// The episode number is stripped, not the title.
	assert.equal(deriveSeriesBase('[Erai-raws] One Piece - 1080 [1080p][AABBCCDD]'), 'one piece')
	// Multi-segment titles keep their inner words; only the trailing episode is removed.
	assert.equal(deriveSeriesBase('[Erai-raws] Dr. Stone - New World - 11 [1080p][12AB34CD]'), 'dr. stone-new world')
})

test('deriveFolderNameFromTitle lands specials in the same folder as regular episodes', () => {
	const special = deriveFolderNameFromTitle('[Erai-raws] Lord of Mysteries - Special 03 (CA) [480p CR WEB-DL AVC AAC][MultiSub][77D5AF7A]')
	const regular = deriveFolderNameFromTitle('[Erai-raws] Lord of Mysteries - 03 [1080p][MultiSub][ABCDEF12]')
	assert.equal(special.onlyRes, '[Erai-raws] Lord of Mysteries [480p]')
	assert.equal(regular.onlyRes, '[Erai-raws] Lord of Mysteries [1080p]')
})

test('deriveFolderNameFromTitle strips trailing finale markers from the folder name', () => {
	const folder = deriveFolderNameFromTitle('[Erai-raws] Kaiju No.8 - 12 END [1080p][ABCDEF12]')
	assert.equal(folder.onlyRes, '[Erai-raws] Kaiju No.8 [1080p]')
})
