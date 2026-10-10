// Recorded instead of qBittorrent's answer when the add was refused (409) because the torrent is already in qBittorrent.
export const QBITTORRENT_ALREADY_PRESENT = 'Already in qBittorrent.'

// qBittorrent <= 5.1 answers torrents/add with plain "Ok." / "Fails.";
// 5.2+ answers JSON: {"added_torrent_ids":[],"failure_count":0,"pending_count":0,"success_count":1}
export function isQbittorrentAddSuccess(text: string | undefined): boolean {
	const value = text?.trim() ?? ''
	if (value === 'Ok.' || value === QBITTORRENT_ALREADY_PRESENT) {
		return true
	}
	if (!value.startsWith('{')) {
		return false
	}
	try {
		const parsed = JSON.parse(value) as { success_count?: number; pending_count?: number }
		// ponytail: pending = metadata still downloading, counts as accepted
		return (parsed.success_count ?? 0) > 0 || (parsed.pending_count ?? 0) > 0
	} catch {
		return false
	}
}
