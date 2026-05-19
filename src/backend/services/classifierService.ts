import type { ClassifiedTorrent } from './nyaaScraperService'

export function summarizeClassification(item: ClassifiedTorrent): string {
	return `${item.status}: ${item.reason}`
}