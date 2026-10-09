import { createSignal } from 'solid-js'
import { getJson } from '../lib/httpClient'

// Module-level state: NyaaMeta (rendered in ~10 places) opens the one details modal mounted in App.
const [detailsTorrentId, setDetailsTorrentId] = createSignal<string | null>(null)
// Torrents whose Nyaa details are already saved on disk (drives the icon color).
const [cachedDetailIds, setCachedDetailIds] = createSignal<ReadonlySet<string>>(new Set())

export { detailsTorrentId, cachedDetailIds }

export const openTorrentDetails = (torrentId: string) => setDetailsTorrentId(torrentId)
export const closeTorrentDetails = () => setDetailsTorrentId(null)

export function markDetailsCached(torrentId: string) {
	setCachedDetailIds((previous) => new Set(previous).add(torrentId))
}

export async function loadCachedDetailIds() {
	try {
		setCachedDetailIds(new Set((await getJson<string[]>('/api/details/cached')).data))
	} catch {
		// Icons just stay "not downloaded"; opening the modal still works.
	}
}
