import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findNyaaDetailFile, getNyaaDetail, listCachedNyaaDetailIds, nyaaDetailFilePath, parseNyaaDetailHtml } from './nyaaDetailService'
import { scrapeNyaaPageHtml } from './nyaaScraperServiceStream'

const __dirname = dirname(fileURLToPath(import.meta.url))

test('parseNyaaDetailHtml extracts every field of the /view page', () => {
	const html = readFileSync(join(__dirname, 'fixtures/nyaa-view-2170558.html'), 'utf8')
	const detail = parseNyaaDetailHtml('2170558', html, '2026-10-09T00:00:00.000Z')
	const { descriptionMarkdown, magnet, ...rest } = detail
	assert.deepEqual(rest, {
		torrentId: '2170558',
		url: 'https://nyaa.si/view/2170558',
		fetchedAtUtc: '2026-10-09T00:00:00.000Z',
		title: '[Erai-raws] Chii Fuyo - 01 [1080p CR WEB-DL AVC AAC][MultiSub][8B2F23EF]',
		category: 'Anime - English-translated',
		categoryIds: ['1_0', '1_2'],
		publishedAtUtc: '2026-10-06T15:31:27.000Z',
		submitter: 'Erai-raws',
		submitterRank: 'Trusted',
		information: 'https://www.erai-raws.info/anime-list/chii-fuyo/',
		sizeText: '1.3 GiB',
		seeders: 342,
		leechers: 3,
		completed: 2263,
		infoHash: 'df838f58650234670861a867bc68248e1cbae768',
		files: [{ path: '[Erai-raws] Chii Fuyo - 01 [1080p CR WEB-DL AVC AAC][MultiSub][8B2F23EF].mkv', sizeText: '1.3 GiB' }],
		comments: [{ user: 'FlowerPower', postedAtUtc: '2026-10-07T13:20:05.000Z', text: 'thanks' }],
	})
	assert.match(magnet ?? '', /^magnet:\?xt=urn:btih:df838f58/)
	assert.match(descriptionMarkdown ?? '', /Subtitles Info:/)
})

test('parseNyaaDetailHtml flattens nested folders in the file list', () => {
	const html = `<div class="torrent-file-list panel-body"><ul>
		<li><a href="" class="folder"><i class="fa fa-folder-open"></i>Show</a><ul>
			<li><i class="fa fa-file"></i>ep01.mkv <span class="file-size">(1.0 GiB)</span></li>
			<li><a href="" class="folder"><i class="fa fa-folder-open"></i>Extras</a><ul>
				<li><i class="fa fa-file"></i>nc.mkv <span class="file-size">(100 MiB)</span></li>
			</ul></li>
		</ul></li>
	</ul></div>`
	assert.deepEqual(parseNyaaDetailHtml('1', html).files, [
		{ path: 'Show/ep01.mkv', sizeText: '1.0 GiB' },
		{ path: 'Show/Extras/nc.mkv', sizeText: '100 MiB' },
	])
})

test('nyaaDetailFilePath groups details by processing month', () => {
	assert.match(nyaaDetailFilePath('42', '2026-10-09T12:00:00.000Z'), /[\\/]data[\\/]2026-10[\\/]42\.json$/)
})

test('getNyaaDetail fetches once, then reads the saved file from any month', async () => {
	const root = mkdtempSync(join(tmpdir(), 'nyaa-detail-'))
	let fetches = 0
	const fetchDetail = async (torrentId: string) => {
		fetches += 1
		return { torrentId, url: '', fetchedAtUtc: `fetch-${fetches}`, title: 'X', categoryIds: [], files: [], comments: [] }
	}
	const first = await getNyaaDetail('42', { root, fetchDetail, processedAtUtc: '2026-05-20T00:00:00.000Z' })
	assert.equal(first.fetchedAtUtc, 'fetch-1')
	assert.equal(await findNyaaDetailFile('42', root), join(root, '2026-05', '42.json'))
	// No processedAtUtc now: still found in 2026-05, no second fetch.
	assert.equal((await getNyaaDetail('42', { root, fetchDetail })).fetchedAtUtc, 'fetch-1')
	assert.deepEqual(await listCachedNyaaDetailIds(root), ['42'])
	// refresh rewrites the same file.
	assert.equal((await getNyaaDetail('42', { root, fetchDetail, refresh: true })).fetchedAtUtc, 'fetch-2')
	assert.equal((await getNyaaDetail('42', { root, fetchDetail })).fetchedAtUtc, 'fetch-2')
	assert.equal(fetches, 2)
})

test('scrapeNyaaPageHtml reads the category of each list row', async () => {
	const html = `<table class="torrent-list"><tbody><tr>
		<td><a href="/?c=1_2" title="Anime - English-translated"><img alt="Anime - English-translated"></a></td>
		<td colspan="2"><a href="/view/7" title="[Erai-raws] X - 01 [1080p]">x</a></td>
		<td><a href="/download/7.torrent">d</a></td>
		<td>1.3 GiB</td><td data-timestamp="1791300687">2026-10-06</td><td>1</td><td>2</td><td>3</td>
	</tr></tbody></table>`
	const { items } = await scrapeNyaaPageHtml({ pageNumber: 1, html })
	assert.equal(items[0]?.category, 'Anime - English-translated')
	assert.equal(items[0]?.sizeText, '1.3 GiB')
})

test('scrapeNyaaPageHtml decodes HTML entities in the title', async () => {
	const html = `<table class="torrent-list"><tbody><tr>
		<td colspan="2"><a href="/view/8" title="[AOmundson] X + Specials &amp; Extras &#39;BD&#39;">x</a></td>
		<td><a href="/download/8.torrent">d</a></td>
	</tr></tbody></table>`
	const { items } = await scrapeNyaaPageHtml({ pageNumber: 1, html })
	assert.equal(items[0]?.title, `[AOmundson] X + Specials & Extras 'BD'`)
})
