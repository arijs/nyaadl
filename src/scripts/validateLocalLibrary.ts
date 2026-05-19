import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildTorrentVideoFiles, extractReleaseFingerprint, findExistingLocalMatch } from '../backend/services/localLibraryService'
import type { WatchTarget } from '../shared/types'

async function main(): Promise<void> {
	const samples = [
		{ name: '[Erai-raws] Lastame 2 - 01 [480p ADN WEB-DL AVC AAC][MultiSub][06EE2206].mkv', episode: '01', source: 'adn' },
		{ name: '[Erai-raws] Lastame 2 - 01 [480p HIDIVE WEB-DL AVC AAC][7B884E24].mkv', episode: '01', source: 'hidive' },
		{ name: '[Erai-raws] Lastame 2 - 01 [720p ADN WEB-DL AVC AAC][MultiSub][AB7AB1DE].mkv', episode: '01', source: 'adn' },
		{ name: '[Erai-raws] Lastame 2 - 01 [720p HIDIVE WEB-DL AVC AAC][D1B70D52].mkv', episode: '01', source: 'hidive' },
		{ name: '[Erai-raws] Lastame 2 - 01 (REPACK) [480p ADN WEB-DL AVC AAC][MultiSub][12345678].mkv', episode: '01', source: 'adn', episodeTag: '(repack)', fileHash: '12345678' },
	] as const

	for (const sample of samples) {
		const fingerprint = extractReleaseFingerprint(sample.name)
		if (
			fingerprint.episode !== sample.episode
			|| fingerprint.source !== sample.source
			|| ('episodeTag' in sample && fingerprint.episodeTag !== sample.episodeTag)
			|| ('fileHash' in sample && fingerprint.fileHash !== sample.fileHash)
		) {
			throw new Error(`Fingerprint mismatch for ${sample.name}: got ${JSON.stringify(fingerprint)}`)
		}
	}

	const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'nyaadl-local-library-'))
	try {
		const targetFolder = path.join(tempRoot, '[Erai-raws] Lastame 2 [480p]')
		await mkdir(targetFolder, { recursive: true })

		const exactName = '[Erai-raws] Lastame 2 - 01 [480p ADN WEB-DL AVC AAC][MultiSub][06EE2206].mkv'
		await writeFile(path.join(targetFolder, exactName), Buffer.alloc(1234))

		const watchTarget: WatchTarget = {
			folderName: '[Erai-raws] Lastame 2 [480p]',
			folderPath: targetFolder,
			seriesKey: 'lastame 2',
			resolution: '480p',
			normalizedKey: 'lastame 2::480p',
			matchCandidates: ['lastame 2'],
		}

		const exactVideoFiles = buildTorrentVideoFiles([exactName], [{ path: [exactName], length: 1234 }])
		const exactMatch = await findExistingLocalMatch(watchTarget, exactName, exactVideoFiles)
		if (!exactMatch || exactMatch.status !== 'exact') {
			throw new Error(`Expected exact match, got ${JSON.stringify(exactMatch)}`)
		}

		const conflictName = '[Erai-raws] Lastame 2 - 01 [480p ADN WEB-DL AVC AAC][MultiSub][99999999].mkv'
		const conflictVideoFiles = buildTorrentVideoFiles([conflictName], [{ path: [conflictName], length: 9999 }])
		const conflictMatch = await findExistingLocalMatch(watchTarget, conflictName, conflictVideoFiles)
		if (conflictMatch) {
			throw new Error(`Expected no existing match for different hash, got ${JSON.stringify(conflictMatch)}`)
		}

		const repackName = '[Erai-raws] Lastame 2 - 01 (REPACK) [480p ADN WEB-DL AVC AAC][MultiSub][06EE2206].mkv'
		const repackVideoFiles = buildTorrentVideoFiles([repackName], [{ path: [repackName], length: 1234 }])
		const repackMatch = await findExistingLocalMatch(watchTarget, repackName, repackVideoFiles)
		if (repackMatch) {
			throw new Error(`Expected no existing match for REPACK/non-REPACK mismatch, got ${JSON.stringify(repackMatch)}`)
		}

		console.log('Local library validation passed for ADN/HIDIVE samples.')
	} finally {
		await rm(tempRoot, { recursive: true, force: true })
	}
}

void main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})