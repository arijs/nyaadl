import type { LastProcessed } from '@shared/types'

export interface ScrapePlan {
	pages: number[]
	bootstrapMode: LastProcessed['bootstrapMode']
}

export function determineScrapePages(lastProcessed: LastProcessed | undefined, requestedPages?: number[]): ScrapePlan {
	if (requestedPages && requestedPages.length > 0) {
		const normalizedPages = Array.from(new Set(requestedPages.filter((page) => Number.isInteger(page) && page > 0))).sort((left, right) => right - left)
		return { pages: normalizedPages, bootstrapMode: 'checkpoint' }
	}

	if (lastProcessed?.lastSeenPage && Number.isInteger(lastProcessed.lastSeenPage) && lastProcessed.lastSeenPage > 0) {
		const pages: number[] = []
		for (let page = lastProcessed.lastSeenPage; page >= 1; page -= 1) {
			pages.push(page)
		}
		return { pages, bootstrapMode: 'checkpoint' }
	}

	return { pages: [1], bootstrapMode: 'assisted' }
}

export function advanceCheckpoint(lastProcessed: LastProcessed | undefined, torrentId: string, page: number, bootstrapMode: LastProcessed['bootstrapMode']): LastProcessed {
	return {
		lastTorrentId: torrentId,
		lastSeenPage: page,
		lastRunAt: new Date().toISOString(),
		bootstrapMode: bootstrapMode ?? lastProcessed?.bootstrapMode ?? 'assisted',
	}
}