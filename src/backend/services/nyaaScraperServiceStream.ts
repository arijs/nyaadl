import { TreeMatcher, getParser, treeWalk, nodeGetAttr, nodeExtractText, nodeFindFirstDescendant, nodeExtractNodeTexts } from '@arijs/stream-xml-parser'
import type { TorrentItem } from '@shared/types'
import { buildMatchCandidates, extractResolution, sanitizePathSegment } from './normalizeService'
import { withRetry } from './retryService'

const nyaaQueryUrl = (page: number) => `https://nyaa.si/?f=0&c=1_2&q=Erai-raws+-HEVC&p=${page}`

type UnknownRecord = Record<string, unknown>

type AdapterLike = {
	nameGet: (node: unknown) => string
	attrsEach: (node: unknown, handler: (name: string, value: string) => void) => void
	textValueGet: (node: unknown) => string | null
	childCount: (node: unknown) => number
	childIndexGet: (node: unknown, index: number) => unknown
}

type WalkPathEntry = {
	node: unknown
	parentNode: unknown | null
	childIndex: number | null
	childCount: number | null
}

type WalkEntry = {
	node: WalkPathEntry
	path: WalkPathEntry[]
	elAdapter: AdapterLike
}

function extractTorrentId(downloadUrl: string): string {
	const match = /\/download\/(\d+)\.torrent$/i.exec(downloadUrl)
	return match?.[1] ?? ''
}

function parseRow(rowNode: unknown, page: number, elAdapter: AdapterLike): TorrentItem | null {
	const viewLinkMatcher = new TreeMatcher(elAdapter as unknown as UnknownRecord)
	viewLinkMatcher.name('a')
	viewLinkMatcher.attr(['href', /^\/view\//i])
	viewLinkMatcher.attr(['class', /\bcomments\b/i, '<0>'])

	const downloadLinkMatcher = new TreeMatcher(elAdapter as unknown as UnknownRecord)
	downloadLinkMatcher.name('a')
	downloadLinkMatcher.attr(['href', /^\/download\/\d+\.torrent$/i])

	const timestampCellMatcher = new TreeMatcher(elAdapter as unknown as UnknownRecord)
	timestampCellMatcher.name('td')
	timestampCellMatcher.attr(['data-timestamp', null])

	const viewAnchor = nodeFindFirstDescendant({root: rowNode, elAdapter, matcher: viewLinkMatcher as unknown as UnknownRecord})
	const downloadAnchor = nodeFindFirstDescendant({root: rowNode, elAdapter, matcher: downloadLinkMatcher as unknown as UnknownRecord})
	if (!viewAnchor || !downloadAnchor) {
		return null
	}

	const viewUrl = nodeGetAttr({node: viewAnchor, elAdapter, targetName: 'href'}) ?? ''
	const downloadUrl = nodeGetAttr({node: downloadAnchor, elAdapter, targetName: 'href'}) ?? ''
	if (!viewUrl || !downloadUrl) {
		return null
	}

	const torrentId = extractTorrentId(downloadUrl)
	if (!torrentId) {
		return null
	}

	const titleValue = nodeGetAttr({node: viewAnchor, elAdapter, targetName: 'title'}) ?? nodeExtractText({node: viewAnchor, elAdapter})
	const title = sanitizePathSegment(titleValue)
	const texts = nodeExtractNodeTexts({node: rowNode, elAdapter}) as string[]
	const timestampCell = nodeFindFirstDescendant({root: rowNode, elAdapter, matcher: timestampCellMatcher as unknown as UnknownRecord})
	const publishedAt = timestampCell ? nodeGetAttr({node: timestampCell, elAdapter, targetName: 'data-timestamp'}) : undefined
	const publishedAtUtc = publishedAt ? new Date(Number(publishedAt) * 1000).toISOString() : undefined
	const sizeText = texts.find((text) => /[0-9]+(?:\.[0-9]+)?\s*(?:KiB|MiB|GiB|TiB)/i.test(text))
	const numericCells = texts.filter((text) => /^\d+$/.test(text))
	const seeders = numericCells.length > 0 ? Number(numericCells[0]) : undefined
	const leechers = numericCells.length > 1 ? Number(numericCells[1]) : undefined
	const downloads = numericCells.length > 2 ? Number(numericCells[2]) : undefined
	const resolution = extractResolution(title)
	const seriesBaseRaw = title
	return {
		torrentId,
		title,
		viewUrl,
		downloadUrl,
		page,
		publishedAtUtc,
		sizeText,
		seeders,
		leechers,
		downloads,
		seriesBaseRaw,
		resolution,
		matchCandidates: buildMatchCandidates(title, []),
	}
}

export async function fetchNyaaPage(page: number): Promise<string> {
	const response = await withRetry(async () => fetch(nyaaQueryUrl(page), {
		headers: {
			'user-agent': 'Mozilla/5.0 (compatible; NYAADL/1.0; +https://github.com)',
			'accept-language': 'en-US,en;q=0.9',
		},
	}))
	if (!response.ok) {
		throw new Error(`Failed to fetch Nyaa page ${page}: ${response.status} ${response.statusText}`)
	}
	return response.text()
}

export async function scrapeNyaaPage(pageNumber: number): Promise<{ html: string; items: TorrentItem[] }> {
	const html = await fetchNyaaPage(pageNumber)
	const { items } = await scrapeNyaaPageHtml({ pageNumber, html })
	return { html, items }
}

export async function scrapeNyaaPageHtml({ pageNumber, html }: { pageNumber: number, html: string }): Promise<{ items: TorrentItem[] }> {
	const parser = getParser()
	parser.end(html)
	const { tree, elAdapter } = parser.getResult()

	const rowNameMatcher = new TreeMatcher(elAdapter as unknown as UnknownRecord)
	rowNameMatcher.name('tr')

	const tbodyNameMatcher = new TreeMatcher(elAdapter as unknown as UnknownRecord)
	tbodyNameMatcher.name('tbody')

	const tableMatcher = new TreeMatcher(elAdapter as unknown as UnknownRecord)
	tableMatcher.name('table')
	tableMatcher.attr(['class', /\btorrent-list\b/i])

	const items: TorrentItem[] = []
	for (const rootNode of tree as unknown[]) {
		treeWalk({node: rootNode, elAdapter, walkFns: {
			onNode: ({ node, path }: WalkEntry) => {
				if (!rowNameMatcher.testNodeName(node.node).success) {
					return
				}
				if (!node.parentNode || !tbodyNameMatcher.testNodeName(node.parentNode).success) {
					return
				}
				const insideTorrentTable = path.some((ancestor, index) => tableMatcher.testAll(ancestor, path.slice(0, index)).success)
				if (!insideTorrentTable) {
					return
				}
				const rowItem = parseRow(node.node, pageNumber, elAdapter as unknown as AdapterLike)
				if (rowItem) {
					items.push(rowItem)
				}
			},
		}})
	}

	return { items }
}
