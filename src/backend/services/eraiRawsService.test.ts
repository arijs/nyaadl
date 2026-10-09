import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EraiRawsAuthError, eraiSeriesSlug, listArchivedEraiSeriesUrls, parseEraiSeriesHtml, readLoggedInUser } from './eraiRawsService'

const __dirname = dirname(fileURLToPath(import.meta.url))
const seriesUrl = 'https://www.erai-raws.info/anime-list/replica-datte-koi-wo-suru/'

test('parseEraiSeriesHtml extracts the series page without personal tokens', () => {
	const html = readFileSync(join(__dirname, 'fixtures/erai-series-sample.html'), 'utf8')
	assert.deepEqual(parseEraiSeriesHtml(seriesUrl, html, '2026-10-09T00:00:00.000Z'), {
		url: seriesUrl,
		slug: 'replica-datte-koi-wo-suru',
		fetchedAtUtc: '2026-10-09T00:00:00.000Z',
		title: 'Replica datte, Koi wo Suru',
		synopsis: 'When she doesn’t feel well, I take her place.',
		links: [
			{ label: 'UseNet(NZB)', url: 'https://www.erai-raws.info/nzbs/?dir=NZB/2026/Spring/Replica datte Koi wo Suru' },
			{ label: 'SUB', url: 'https://www.erai-raws.info/subs/?dir=Sub/2026/Spring/Replica datte Koi wo Suru' },
			{ label: 'AniDB', url: 'https://anidb.net/anime/19158' },
			{ label: 'MAL', url: 'https://myanimelist.net/anime/61013' },
		],
		releases: [
			{
				type: 'E',
				title: 'Replica datte, Koi wo Suru - 13 (HEVC)',
				url: 'https://www.erai-raws.info/encodes/replica-datte-koi-wo-suru-13-hevc/',
				releasedAt: 'Jun 30, 2026 15:21',
				subtitles: ['us', 'br'],
				variants: [{ resolution: '1080p', sizeText: '708.12MB', source: 'CR WEB-DL HEVC AAC' }],
			},
			{
				type: 'A',
				title: 'Replica datte, Koi wo Suru - 13',
				url: 'https://www.erai-raws.info/episodes/replica-datte-koi-wo-suru-13/',
				releasedAt: 'Jun 30, 2026 11:34',
				subtitles: ['us', 'de'],
				variants: [
					{ resolution: '1080p', sizeText: '1.38GB', source: 'CR WEB-DL AVC AAC' },
					{ resolution: 'SD', sizeText: '167.02MB', source: 'CR WEB-DL AVC AAC' },
				],
			},
		],
	})
	assert.deepEqual(readLoggedInUser(html), { loggedIn: true, user: 'someone' })
})

test('parseEraiSeriesHtml rejects the logged-out page', () => {
	const html = '<article><p><a href="/account-login/">Log in</a> to see the content of the website.</p></article>'
	assert.equal(readLoggedInUser(html).loggedIn, false)
	assert.throws(() => parseEraiSeriesHtml(seriesUrl, html), EraiRawsAuthError)
})

test('eraiSeriesSlug only accepts erai-raws series pages', () => {
	assert.equal(eraiSeriesSlug(seriesUrl), 'replica-datte-koi-wo-suru')
	assert.equal(eraiSeriesSlug('https://erai-raws.info/anime-list/chii-fuyo'), 'chii-fuyo')
	assert.equal(eraiSeriesSlug('https://www.erai-raws.info/episodes/chii-fuyo-01/'), null)
	assert.equal(eraiSeriesSlug('https://example.com/anime-list/chii-fuyo/'), null)
	assert.equal(eraiSeriesSlug(undefined), null)
})

test('listArchivedEraiSeriesUrls dedupes series referenced by saved Nyaa details', async () => {
	const root = mkdtempSync(join(tmpdir(), 'erai-'))
	mkdirSync(join(root, '2026-05'))
	mkdirSync(join(root, 'erai-raws'))
	writeFileSync(join(root, '2026-05', '1.json'), JSON.stringify({ information: seriesUrl }))
	writeFileSync(join(root, '2026-05', '2.json'), JSON.stringify({ information: seriesUrl }))
	writeFileSync(join(root, '2026-05', '3.json'), JSON.stringify({ information: 'https://example.com/' }))
	assert.deepEqual(await listArchivedEraiSeriesUrls(root), [seriesUrl])
})
