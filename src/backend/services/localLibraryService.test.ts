import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { extractReleaseFingerprint } from './localLibraryService.js'

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

	const mono = extractReleaseFingerprint(monoTitle)
	const multi = extractReleaseFingerprint(multiTitle)

	assert.equal(mono.source, 'cr')
	assert.equal(multi.source, 'cr')
	assert.equal(mono.episodeTag, undefined)
	assert.equal(multi.episodeTag, undefined)
	assert.equal(mono.isMultisub, false)
	assert.equal(multi.isMultisub, true)
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
