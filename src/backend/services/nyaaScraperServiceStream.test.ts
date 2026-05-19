import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TorrentItem } from '@shared/types'
import { scrapeNyaaPageHtml } from './nyaaScraperServiceStream.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const torrentsDir = join(__dirname, '../../../torrents')
const shouldAccept =
	process.argv.includes('--accept') ||
	process.env.npm_config_accept === 'true' ||
	process.env.NYAADL_ACCEPT === '1'

function nextArchiveJsonPath(folderPath: string): string {
	for (let index = 1; ; index += 1) {
		const archivePath = join(folderPath, `snapshot.${index}.json`)
		if (!existsSync(archivePath)) {
			return archivePath
		}
	}
}

const pageFolders = readdirSync(torrentsDir)
	.filter((name) => /^page-\d{4}-\d{2}-\d{2}-\d+$/.test(name))
	.sort((a, b) => a.localeCompare(b))

for (const folderName of pageFolders) {
	test(`scrapeNyaaPageHtml: ${folderName}`, async () => {
		const match = /^page-\d{4}-\d{2}-\d{2}-(\d+)$/.exec(folderName)!
		const pageNumber = Number(match[1])
		const folderPath = join(torrentsDir, folderName)
		const snapshotJsonPath = join(folderPath, 'snapshot.json')
		const html = readFileSync(join(folderPath, 'snapshot.html'), 'utf8')
		const { items } = await scrapeNyaaPageHtml({ pageNumber, html })

		if (shouldAccept) {
			const archivePath = nextArchiveJsonPath(folderPath)
			renameSync(snapshotJsonPath, archivePath)
			writeFileSync(snapshotJsonPath, `${JSON.stringify(items, null, 2)}\n`, 'utf8')
			return
		}

		const expected = JSON.parse(readFileSync(snapshotJsonPath, 'utf8')) as TorrentItem[]
		assert.deepEqual(items, expected)
	})
}
