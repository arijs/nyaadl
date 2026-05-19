import type { ClassifiedTorrent } from './nyaaTorrentService'

export function summarizeClassification(item: ClassifiedTorrent): string {
	return `${item.status}: ${item.reason}`
}