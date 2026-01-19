
// console.log(`Let's add some numbers!`);
// console.write(`Count: 0\n> `);

// let count = 0;
// for await (const line of console) {
//   count += Number(line);
//   console.write(`Count: ${count}\n> `);
// }
import { mkdir } from "node:fs/promises"
import { getParser, TreeMatcher, treeWalk } from '@arijs/stream-xml-parser'
import { inspectObj } from '@arijs/frontend/isomorphic/utils/inspect'

const reTorrent = /\/download\/\d+\.torrent$/
const reView = /\/view\/\d+$/
const sanitizeFilename = (name: string) => name.replace(/[\/\\?%*:|"<>]/g, '-').trim()

let page: number | null = null
let pendingRows: any[] = []

console.log(`Enter page number to fetch (or 'exit' to quit): `)

for await (const line of console) {
	const trimmed = line.trim()
	if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
		break
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
		if (isNaN(page) || page < 1) {
			page = null
			console.log(`Please enter a valid page number (1 or higher): `)
		}
	}
	if (null !== page) {
		const { page: rPage, foundRows, rowsFound, rowsNoPath, nodeCount } = await getPage()
		console.log(`Page ${rPage} processed. Rows found: ${rowsFound}, Rows no path match: ${rowsNoPath}, Node count: ${nodeCount}`)
		console.log(foundRows.map(({ title, url }) => ({ title, url })))
		pendingRows = foundRows
		askNextRow()
		continue
	}
}

function askNextRow() {
	const lastRow = pendingRows.at(-1)
	if (lastRow) {
		console.log(`Download torrent for ${JSON.stringify(lastRow.title)}? (y/n): `)
	} else {
		page = null
		console.log(`Enter another page number to fetch (or 'exit' to quit): `)
	}
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

async function getPage() {
	const foundRows: any[] = []
	let rowsFound = 0
	let rowsNoPath = 0
	let nodeCount = 0
	let lastTableRow: any = null
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
	const {tree, elAdapter} = parser.getResult({ asNode: true })
	const tmTableRow = new TreeMatcher(elAdapter)
	tmTableRow.name('tr')
	tmTableRow.path(['* <*>', ['table', [['class', /\btorrent-list\b/]]], 'tbody'])
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
	treeWalk(tree, elAdapter, {
		onNode(node: any, path: any) {
			// console.log(`Visiting node:`, inspectObj({node, path}, 2, 32))
			nodeCount++
			if (lastTableRow) {
				if (path.includes(lastTableRow.node)) {
					const torrentRes = tmTorrent.testAll(node, path)
					if (torrentRes.success) {
						lastTableRow.nodeTorrent = node
						console.log(`  Torrent found:`, inspectObj(node.name, 2, 64))
						elAdapter.attrsEach(node, (name: string, value: string) => {
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
						console.log(`  View found:`, inspectObj(node.name, 2, 64))
						treeWalk(node, elAdapter, {
							onText(tnode: any) {
								lastTableRow.title += elAdapter.textValueGet(tnode)
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
	return { page, foundRows, rowsFound, rowsNoPath, nodeCount }
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
