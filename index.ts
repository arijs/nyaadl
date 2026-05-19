
// console.log(`Let's add some numbers!`);
// console.write(`Count: 0\n> `);

// let count = 0;
// for await (const line of console) {
//   count += Number(line);
//   console.write(`Count: ${count}\n> `);
// }
// import { mkdir } from "node:fs/promises"
import { getParser, TreeMatcher, treeWalk, Printer } from '@arijs/stream-xml-parser'

function inspectObj(value: unknown, depth = 2, max = 32) {
	const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
	return text.length > max ? `${text.slice(0, max)}…` : text
}

const reTorrent = /\/download\/\d+\.torrent$/
const reView = /\/view\/\d+$/
const sanitizeFilename = (name: string) => name.replace(/[\/\\?%*:|"<>]/g, '-').trim()

let page: number | null = null
let pendingRows: any[] = []
let savePromises: Promise<void>[] = []
let saveJsonPromises: Promise<void>[] = []
const reRead = /^read\s+(\d+)$/

console.log(`Enter page number to fetch (or 'exit' to quit): `)

for await (const line of console) {
	const trimmed = line.trim()
	if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
		break
	}
	if (trimmed.toLowerCase() === 'skip') {
		page = null
		pendingRows = []
	} else {
		const readMatch = reRead.exec(trimmed)
		if (readMatch) {
			const pageNum = Number(readMatch[1])
			if (isNaN(pageNum) || pageNum < 1 || !Number.isFinite(pageNum)) {
				console.log(`Please enter a valid page number to read (1 or higher): `)
			} else {
				const { page: rPage, foundRows, rowsFound, rowsNoPath, nodeCount } = await loadLocalPage(pageNum)
				console.log(`Page ${rPage} readed. Rows found: ${rowsFound}, Rows no path match: ${rowsNoPath}, Node count: ${nodeCount}`)
				console.log(foundRows.map(({ title, url }) => ({ title, url })))
			}
		}
	}
	if (pendingRows.length > 0) {
		const lastRow = pendingRows.pop()
		if (trimmed.toLowerCase() === 'y') {
			await getTorrent(lastRow)
		}
		askNextRow()
		continue
	}
	if (null === page) {
		page = +trimmed
		if (isNaN(page) || page < 1 || !Number.isFinite(page)) {
			page = null
			console.log(`Please enter a valid page number (1 or higher): `)
		}
	}
	if (null !== page) {
		const { page: rPage, foundRows, rowsFound, rowsNoPath, nodeCount, savePromises: pageSavePromises, saveJsonPromises: pageSaveJsonPromises } = await getRemotePage()
		savePromises.push(...pageSavePromises)
		saveJsonPromises.push(...pageSaveJsonPromises)
		console.log(`Page ${rPage} processed. Rows found: ${rowsFound}, Rows no path match: ${rowsNoPath}, Node count: ${nodeCount}`)
		console.log(foundRows.map(({ title, url }) => ({ title, url })))
		pendingRows = foundRows
		askNextRow()
		continue
	}
}

Promise.all([
	Promise.all(savePromises).then(() => {
		const count = savePromises.length
		if (count > 0) {
			console.log(`${count} pages saved.`)
		}
	}).catch((err) => {
		console.error(`Error saving pages:`, err)
	}),
	Promise.all(saveJsonPromises).then(() => {
		const count = saveJsonPromises.length
		if (count > 0) {
			console.log(`${count} JSON files saved.`)
		}
	}).catch((err) => {
		console.error(`Error saving JSON files:`, err)
	}),
])

function askNextRow() {
	const lastRow = pendingRows.at(-1)
	if (lastRow) {
		console.log(`Download torrent for ${JSON.stringify(lastRow.title)}? (y/n): `)
	} else {
		page = null
		console.log(`Enter another page number to fetch (or 'exit' to quit): `)
	}
}

function getDateAsIsoString(date?: Date | null | undefined) {
	return (date ?? new Date()).toISOString().slice(0, 10)
}

function getUrl(path: string) {
	return `https://nyaa.si${path}`
}

function getPageUrl() {
	if (null === page) {
		throw new Error('Page number is not set')
	}
	return getUrl(`/?f=0&c=1_2&q=Erai-raws+-HEVC&p=${page}`)
}

function savePage(tableNode: any, elAdapter: any) {
	if (null === page) {
		throw new Error('Page number is not set')
	}
	return Bun.write(`torrents/page-${getDateAsIsoString()}-${page}.html`, new Blob([
		new Printer({ elAdapter, noFormat: true }).printTag(tableNode, 0, [])
	]))
}

async function getRemotePage() {
	const parser = getParser()
	const resp = await fetch(getPageUrl())
	if (!resp.ok) {
		throw new Error(`Failed to fetch page: ${resp.status} ${resp.statusText}`)
	}
	const stream = resp.body?.pipeThrough(new TextDecoderStream())
	for await (const chunk of stream!) {
		parser.write(chunk)
	}
	parser.end()
	const result = parser.getResult({ asNode: true })
	return parsePage({ ...result, page })
}

async function loadLocalPage(pageNum: number) {
	const parser = getParser()
	const data = await Bun.file(`torrents/page-${getDateAsIsoString()}-${pageNum}.html`).text()
	parser.end(data)
	const result = parser.getResult({ asNode: true })
	return parsePage({ ...result, page: pageNum, fromLocal: true })
}
	
function parsePage({ tree, elAdapter, page, fromLocal }: { tree: any; elAdapter: any, page: number, fromLocal: boolean }) {
	const foundRows: any[] = []
	let rowsFound = 0
	let rowsNoPath = 0
	let nodeCount = 0
	let lastTable: any = null
	let lastTableRow: any = null
	const tmTable = new TreeMatcher(elAdapter)
	tmTable.name('table')
	tmTable.attr(['class', /\btorrent-list\b/])
	const tmTableRow = new TreeMatcher(elAdapter)
	tmTableRow.name('tr')
	tmTableRow.path(['* <*>', tmTable, 'tbody'])
	const tmTorrent = new TreeMatcher(elAdapter)
	tmTorrent.name('a')
	tmTorrent.attr(['href', reTorrent])
	const tmView = new TreeMatcher(elAdapter)
	tmView.name('a')
	tmView.attr(['href', reView])
	tmView.attr(['class', /\bcomments\b/, '<0>']) // link must not have class 'comments'
	// this would be an interesting api
	// tmTableRow.child(['* <*>', ['td', [tmView]], ['td', [tmTorrent]]])
	// console.log(`tree result:`, tree)
	// const checkIfHasTorrentAndView = () => {
	// }
	const savePromises: Promise<void>[] = []
	const saveJsonPromises: Promise<void>[] = []
	treeWalk(tree, elAdapter, {
		onNode({node, path}: any) {
			// console.log(`Visiting node:`, inspectObj({node, path}, 2, 32))
			nodeCount++
			if (!lastTable) {
				const tableRes = tmTable.testAll(node, path)
				if (tableRes.success) {
					lastTable = node
					if (!fromLocal) {
						savePromises.push(savePage(node, elAdapter).then(() => {}))
					}
					console.log(`Table found:`, inspectObj(node.node.name, 2, 32))
				}
			} else if (lastTableRow) {
				if (path.includes(lastTableRow.node)) {
					const torrentRes = tmTorrent.testAll(node, path)
					if (torrentRes.success) {
						lastTableRow.nodeTorrent = node
						console.log(`  Torrent found:`, inspectObj(node.node.name, 2, 64))
						elAdapter.attrsEach(node.node, (name: string, value: string) => {
							if (name === 'href') {
								lastTableRow.url = value
							}
						})
						// checkIfHasTorrentAndView()
					}
					const viewRes = tmView.testAll(node, path)
					if (viewRes.success) {
						lastTableRow.nodeView = node
						lastTableRow.title = ''
						console.log(`  View found:`, inspectObj(node.node.name, 2, 64))
						treeWalk(node.node, elAdapter, {
							onText({node}: any) {
								lastTableRow.title += elAdapter.textValueGet(node.node)
							},
						})
					}
					// Skip nodes under the last matched table row
					return
				} else {
					lastTableRow = null
				}
			}
			const res = tmTableRow.testAll(node, path)
			if (res.success) {
				lastTableRow = {
					node,
					nodeTorrent: null,
					nodeView: null,
					title: null,
					url: null,
				}
				foundRows.push(lastTableRow)
				console.log(`Row found:`, inspectObj(node.name, 2, 32))
				rowsFound++
			} else if (res.name.success) {
				console.log(`Row found but path mismatch:`, {
					node: inspectObj(node, 2, 32),
					path: inspectObj(path, 2, 32),
					resPath: inspectObj(res.path, 3, 32),
				})
				rowsNoPath++
			}
		},
	})
	saveJsonPromises.push(Bun.write(
		`torrents/page-${getDateAsIsoString()}-${page}.json`,
		JSON.stringify(foundRows.map(({ title, url }) => ({ title, url })), null, '\t')
	).then(() => {}))
	return { page, foundRows, rowsFound, rowsNoPath, nodeCount, savePromises, saveJsonPromises }
}

async function getTorrent({ url, title }: { url: string; title: string }) {
	const resp = await fetch(getUrl(url))
	console.log(`Fetching torrent page ${url} for title ${JSON.stringify(title)}`)
	if (!resp.ok) {
		throw new Error(`Failed to fetch torrent: ${resp.status} ${resp.statusText}`)
	}
	const fileName = `torrents/${sanitizeFilename(title)}.torrent`
	// await mkdir('torrents')
	await Bun.write(fileName, resp)
	console.log(`Saved torrent to ${fileName}`)
}
