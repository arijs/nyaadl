import type { TorrentFilter } from '../types'

// Pill classes per decision status, shared by the torrent lists.
export function statusTagClass(status: TorrentFilter): string {
	if (status === 'approved') {
		return 'rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200'
	}
	if (status === 'pending') {
		return 'rounded-full border border-amber-400/25 bg-amber-400/12 px-3 py-1 text-xs font-medium text-amber-200'
	}
	if (status === 'blocked') {
		return 'rounded-full border border-rose-400/25 bg-rose-400/12 px-3 py-1 text-xs font-medium text-rose-200'
	}
	if (status === 'auto_downloaded') {
		return 'rounded-full border border-cyan-400/25 bg-cyan-400/12 px-3 py-1 text-xs font-medium text-cyan-200'
	}
	if (status === 'already_downloaded') {
		return 'rounded-full border border-indigo-400/30 bg-indigo-400/14 px-3 py-1 text-xs font-medium text-indigo-200'
	}
	if (status === 'skipped') {
		return 'rounded-full border border-slate-300/25 bg-slate-300/12 px-3 py-1 text-xs font-medium text-slate-200'
	}
	return 'rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-medium text-slate-200'
}
