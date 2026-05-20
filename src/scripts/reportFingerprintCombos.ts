import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { extractReleaseFingerprint } from '../backend/services/localLibraryService'

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

function toComboKey(title: string): string {
	const fingerprint = extractReleaseFingerprint(title)
	return `${fingerprint.source ?? 'none'}|${fingerprint.episodeTag ?? 'none'}|${fingerprint.isMultisub ? 'multi' : 'mono'}`
}

async function main(): Promise<void> {
	const snapshotFiles = await listSnapshotFiles(torrentsDir)
	if (snapshotFiles.length === 0) {
		console.log('No snapshot.json files found under torrents/.')
		return
	}

	const firstTitleByCombo = new Map<string, string>()
	const countByCombo = new Map<string, number>()
	for (const filePath of snapshotFiles) {
		const titles = await readTitlesFromSnapshot(filePath)
		for (const title of titles) {
			const comboKey = toComboKey(title)
			if (!firstTitleByCombo.has(comboKey)) {
				firstTitleByCombo.set(comboKey, title)
			}
			countByCombo.set(comboKey, (countByCombo.get(comboKey) ?? 0) + 1)
		}
	}

	const sorted = Array.from(firstTitleByCombo.entries())
		.sort(([left], [right]) => left.localeCompare(right))

	console.log(`Found ${sorted.length} unique source/tag/multisub combinations.`)
	for (const [combo, title] of sorted) {
		const count = countByCombo.get(combo) ?? 0
		console.log(`- ${combo} (${count} episodes)`)
		console.log(`  ${title}`)
	}
}

void main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
