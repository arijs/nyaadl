import { fetchTorrentBuffer } from '../backend/services/nyaaScraperService'
import { buildMatchCandidates } from '../backend/services/normalizeService'
import { parseTorrentMetainfo } from '../backend/services/torrentMetainfoService'

async function main(): Promise<void> {
	const torrentId = process.argv[2]
	const title = process.argv.slice(3).join(' ').trim()
	if (!torrentId || !title) {
		throw new Error('Usage: tsx src/scripts/debugTorrentMetainfo.ts <torrentId> <title>')
	}

	const buffer = await fetchTorrentBuffer(`https://nyaa.si/download/${torrentId}.torrent`)
	const metainfo = await parseTorrentMetainfo(buffer)
	const internalNames = metainfo.videoNames.length > 0 ? metainfo.videoNames : [metainfo.name]
	const matchCandidates = buildMatchCandidates(title, internalNames)

	console.log(JSON.stringify({
		torrentId,
		name: metainfo.name,
		videoNames: metainfo.videoNames,
		internalNames,
		matchCandidates,
	}, null, 2))
}

void main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})