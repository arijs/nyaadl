import type { DailyReport, DecisionRecord, DecisionStatus } from '@shared/types'

const statusKeys: DecisionStatus[] = ['auto_downloaded', 'already_downloaded', 'blocked', 'pending', 'approved', 'skipped']

function isSameUtcDate(isoString: string, date: string): boolean {
	return isoString.slice(0, 10) === date
}

export function buildDailyReport(date: string, decisions: DecisionRecord[]): DailyReport {
	const items = decisions
		.filter((decision) => isSameUtcDate(decision.createdAtUtc, date))
		.map((decision) => ({
			torrentId: decision.torrentId,
			status: decision.status,
			reason: decision.reason,
			createdAtUtc: decision.createdAtUtc,
			title: decision.item.title,
			seriesBaseRaw: decision.item.seriesBaseRaw,
			resolution: decision.item.resolution,
			page: decision.item.page,
		}))

	const byStatus = statusKeys.reduce<Record<DecisionStatus, number>>((acc, status) => {
		acc[status] = items.filter((item) => item.status === status).length
		return acc
	}, {
		auto_downloaded: 0,
		already_downloaded: 0,
		blocked: 0,
		pending: 0,
		approved: 0,
		skipped: 0,
	})

	return {
		date,
		generatedAtUtc: new Date().toISOString(),
		total: items.length,
		byStatus,
		items,
	}
}