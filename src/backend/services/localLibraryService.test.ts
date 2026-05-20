import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { WatchTarget } from '@shared/types'
import { analyzeFingerprintCombos, countMatchingLocalFiles, extractReleaseFingerprint } from './localLibraryService.js'
import { buildWatchTargetMatchCandidates } from './watchlistService.js'

const repoRoot = path.resolve(process.cwd())
const torrentsDir = path.join(repoRoot, 'torrents')

async function listSnapshotFiles(dirPath: string): Promise<string[]> {
	const entries = await readdir(dirPath, { withFileTypes: true }).catch(() => [])
	const files: string[] = []

	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name)
		if (entry.isDirectory()) {
			files.push(...await listSnapshotFiles(fullPath))
			continue
		}
		if (entry.isFile() && entry.name === 'snapshot.json') {
			files.push(fullPath)
		}
	}

	return files
}

async function readTitlesFromSnapshot(filePath: string): Promise<string[]> {
	const raw = await readFile(filePath, 'utf8')
	const parsed = JSON.parse(raw) as unknown
	if (!Array.isArray(parsed)) {
		return []
	}

	return parsed
		.map((item) => {
			if (!item || typeof item !== 'object') {
				return undefined
			}
			const record = item as Record<string, unknown>
			return typeof record.title === 'string' ? record.title : undefined
		})
		.filter((title): title is string => Boolean(title && title.trim()))
}

const providerMatchers: Array<{ pattern: RegExp; value: string }> = [
	{ pattern: /\bhidive\b/i, value: 'hidive' },
	{ pattern: /\badn\b/i, value: 'adn' },
	{ pattern: /\bcr\b|\bcrunchyroll\b/i, value: 'cr' },
	{ pattern: /\bnf\b|\bnetflix\b/i, value: 'nf' },
	{ pattern: /\bamzn\b|\bamazon\b/i, value: 'amzn' },
	{ pattern: /\bdsnp\b|\bdisney\+?\b/i, value: 'dsnp' },
	{ pattern: /\babema\b/i, value: 'abema' },
	{ pattern: /\bbglobal\b/i, value: 'bglobal' },
	{ pattern: /\baniplus\b/i, value: 'aniplus' },
	{ pattern: /\bbahamut\b|\bbaha\b/i, value: 'bahamut' },
	{ pattern: /\bunext\b|\bu-next\b/i, value: 'unext' },
]

function extractExpectedSource(value: string): string | undefined {
	const bracketContents = Array.from(value.matchAll(/\[([^\]]+)\]/g), (match) => match[1] ?? '')
	for (const segment of bracketContents) {
		for (const provider of providerMatchers) {
			if (provider.pattern.test(segment)) {
				return provider.value
			}
		}
	}

	for (const provider of providerMatchers) {
		if (provider.pattern.test(value)) {
			return provider.value
		}
	}

	return undefined
}

function extractExpectedEpisodeTag(value: string): string | undefined {
	const episodeTag = /\s-\s\d{1,4}(?:v\d+)?\s*(\([^)]+\))/i.exec(value)?.[1]
	return episodeTag?.trim().replace(/\s+/g, ' ').toLowerCase() || undefined
}

function extractExpectedIsMultisub(value: string): boolean {
	return /\[\s*multisub\s*\]/i.test(value)
}

function toComboKey(title: string): string {
	const fingerprint = extractReleaseFingerprint(title)
	return `${fingerprint.source ?? 'none'}|${fingerprint.episodeTag ?? 'none'}|${fingerprint.isMultisub ? 'multi' : 'mono'}`
}

test('extractReleaseFingerprint differentiates MultiSub from mono-sub releases', () => {
	const monoTitle = '[Erai-raws] Meitantei Precure - 01 [480p CR WEB-DL AVC AAC][A936C40F].mkv'
	const multiTitle = '[Erai-raws] Meitantei Precure - 01 [480p CR WEB-DL AVC AAC][MultiSub][C1E5CAC5].mkv'
	const revisionTitle = '[Erai-raws] Fate Strange Fake - 04v2 [480p CR WEB-DL AVC AAC][MultiSub][6C1B061D].mkv'

	const mono = extractReleaseFingerprint(monoTitle)
	const multi = extractReleaseFingerprint(multiTitle)
	const revision = extractReleaseFingerprint(revisionTitle)

	assert.equal(mono.source, 'cr')
	assert.equal(multi.source, 'cr')
	assert.equal(revision.source, 'cr')
	assert.equal(mono.episodeTag, undefined)
	assert.equal(multi.episodeTag, undefined)
	assert.equal(revision.episodeTag, undefined)
	assert.equal(mono.isMultisub, false)
	assert.equal(multi.isMultisub, true)
	assert.equal(revision.isMultisub, true)
	assert.equal(revision.episode, '04v2')
})

test('countMatchingLocalFiles matches abbreviated local filenames through watch target aliases', async () => {
	const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'nyaadl-megami-'))
	const folderName = '[Erai-raws] Megami ~Isekai Tensei Nani ni Naritai Desu ka~ Ore ~Yuusha no Rokkotsu de~ [480p]'
	const targetFolder = path.join(tempRoot, folderName)
	const seriesKey = 'megami ~isekai tensei nani ni naritai desu ka~ ore ~yuusha no rokkotsu de~'

	try {
		await mkdir(targetFolder, { recursive: true })

		for (const episode of ['01', '02', '03', '04', '05', '06', '07']) {
			const fileName = `[Erai-raws] Megami - ${episode} [480p CR WEB-DL AVC AAC][MultiSub].mkv`
			await writeFile(path.join(targetFolder, fileName), '')
		}

		const watchTarget: WatchTarget = {
			folderName,
			folderPath: targetFolder,
			seriesKey,
			resolution: '480p',
			normalizedKey: `${seriesKey}::480p`,
			matchCandidates: buildWatchTargetMatchCandidates(folderName, seriesKey, seriesKey, {
				megami: seriesKey,
			}),
		}

		assert.equal(await countMatchingLocalFiles(watchTarget), 7)
	} finally {
		await rm(tempRoot, { recursive: true, force: true })
	}
})

test('analyzeFingerprintCombos reports missing episode numbers for a gap in the range', async () => {
	const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'nyaadl-jingai-'))
	const folderName = '[Erai-raws] Jingai Kyoushitsu no Ningengirai Kyoushi [480p]'
	const targetFolder = path.join(tempRoot, folderName)
	const seriesKey = 'jingai kyoushitsu no ningengirai kyoushi'

	try {
		await mkdir(targetFolder, { recursive: true })

		for (const episode of ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '13']) {
			const fileName = `[Erai-raws] Jingai Kyoushitsu no Ningengirai Kyoushi - ${episode} [480p CR WEB-DL AVC AAC][MultiSub][FD972D85].mkv`
			await writeFile(path.join(targetFolder, fileName), '')
		}

		const watchTarget: WatchTarget = {
			folderName,
			folderPath: targetFolder,
			seriesKey,
			resolution: '480p',
			normalizedKey: `${seriesKey}::480p`,
			matchCandidates: buildWatchTargetMatchCandidates(folderName, seriesKey, seriesKey, {}),
		}

		const combos = await analyzeFingerprintCombos(watchTarget)
		assert.equal(combos.length, 1)
		assert.equal(combos[0]?.count, 12)
		assert.deepEqual(combos[0]?.missingEpisodes, ['12'])
		assert.equal(combos[0]?.minEpisode, '1')
		assert.equal(combos[0]?.maxEpisode, '13')
	} finally {
		await rm(tempRoot, { recursive: true, force: true })
	}
})

test('countMatchingLocalFiles treats internal title hyphens as a post-processed fallback candidate', async () => {
	const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'nyaadl-fate-strange-fake-'))
	const folderName = '[Erai-raws] Fate-Strange Fake [480p]'
	const targetFolder = path.join(tempRoot, folderName)
	const seriesKey = 'fate-strange fake'

	try {
		await mkdir(targetFolder, { recursive: true })

		for (const episode of ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']) {
			const fileName = `[Erai-raws] Fate Strange Fake - ${episode} [480p CR WEB-DL AVC EAC3][MultiSub][FD972D85].mkv`
			await writeFile(path.join(targetFolder, fileName), '')
		}

		const watchTarget: WatchTarget = {
			folderName,
			folderPath: targetFolder,
			seriesKey,
			resolution: '480p',
			normalizedKey: `${seriesKey}::480p`,
			matchCandidates: buildWatchTargetMatchCandidates(folderName, seriesKey, seriesKey, {}),
		}

		assert.equal(await countMatchingLocalFiles(watchTarget), 12)
	} finally {
		await rm(tempRoot, { recursive: true, force: true })
	}
})

test('analyzeFingerprintCombos counts episode revisions like 04v2 as distinct entries', async () => {
	const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'nyaadl-fate-strange-fake-v2-'))
	const folderName = '[Erai-raws] Fate-Strange Fake [480p]'
	const targetFolder = path.join(tempRoot, folderName)
	const seriesKey = 'fate-strange fake'

	try {
		await mkdir(targetFolder, { recursive: true })

		for (const episode of ['01', '02', '03', '04', '04v2', '05', '06', '07', '08', '09', '10', '11']) {
			const hash = episode === '04v2' ? '6C1B061D' : 'FD972D85'
			const fileName = `[Erai-raws] Fate Strange Fake - ${episode} [480p CR WEB-DL AVC AAC][MultiSub][${hash}].mkv`
			await writeFile(path.join(targetFolder, fileName), '')
		}

		const watchTarget: WatchTarget = {
			folderName,
			folderPath: targetFolder,
			seriesKey,
			resolution: '480p',
			normalizedKey: `${seriesKey}::480p`,
			matchCandidates: buildWatchTargetMatchCandidates(folderName, seriesKey, seriesKey, {}),
		}

		const combos = await analyzeFingerprintCombos(watchTarget)
		assert.equal(combos.length, 1)
		assert.equal(combos[0]?.count, 12)
		assert.equal(combos[0]?.minEpisode, '1')
		assert.equal(combos[0]?.maxEpisode, '11')
	} finally {
		await rm(tempRoot, { recursive: true, force: true })
	}
})

test('extractReleaseFingerprint covers all existing source/tag/multisub combinations from snapshot.json titles', async () => {
	const snapshotFiles = await listSnapshotFiles(torrentsDir)
	assert.ok(snapshotFiles.length > 0, 'expected at least one snapshot.json file in torrents/')

	const firstTitleByCombo = new Map<string, string>()
	for (const filePath of snapshotFiles) {
		const titles = await readTitlesFromSnapshot(filePath)
		for (const title of titles) {
			const comboKey = toComboKey(title)
			if (!firstTitleByCombo.has(comboKey)) {
				firstTitleByCombo.set(comboKey, title)
			}
		}
	}

	assert.ok(firstTitleByCombo.size > 0, 'expected at least one title combination from snapshot.json files')

	for (const [comboKey, title] of firstTitleByCombo) {
		const fingerprint = extractReleaseFingerprint(title)
		assert.equal(fingerprint.source, extractExpectedSource(title), `source mismatch for ${comboKey}: ${title}`)
		assert.equal(fingerprint.episodeTag, extractExpectedEpisodeTag(title), `episodeTag mismatch for ${comboKey}: ${title}`)
		assert.equal(fingerprint.isMultisub, extractExpectedIsMultisub(title), `isMultisub mismatch for ${comboKey}: ${title}`)
	}
})
