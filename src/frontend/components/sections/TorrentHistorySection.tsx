import { createSignal, For, Show } from 'solid-js'
import type { useTorrentHistoryFilter } from '../../hooks/useTorrentHistoryFilter'
import type { TorrentFilter } from '../../types'
import EmptyState from '../ui/EmptyState'

interface TorrentHistorySectionProps {
	torrentHistoryFilter: ReturnType<typeof useTorrentHistoryFilter>
}

function statusTagClass(status: TorrentFilter): string {
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

export default function TorrentHistorySection(props: TorrentHistorySectionProps) {
	const [collapsed, setCollapsed] = createSignal(true)

	return (
		<section class="rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-lg shadow-black/20 xl:col-span-2">
			<div class="flex items-center justify-between gap-4">
				<div>
					<h2 class="text-lg font-semibold text-white">Torrent history{collapsed() ? ` (${props.torrentHistoryFilter.totalItems()})` : ''}</h2>
					<Show when={!collapsed()}>
						<p class="mt-1 text-sm text-slate-400">All decisions with the latest metadata, filterable by status.</p>
					</Show>
				</div>
				<button
					type="button"
					class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300"
					onClick={() => setCollapsed((current) => !current)}
				>
					{collapsed() ? 'Expand' : 'Collapse'}
				</button>
			</div>
			<Show when={!collapsed()}>
			<div class="mt-5 space-y-3">
				<div class="flex flex-wrap gap-3">
					<input
						type="text"
						value={props.torrentHistoryFilter.titleQuery()}
						onInput={(event) => props.torrentHistoryFilter.setTitleQuery(event.currentTarget.value)}
						placeholder="Filter by torrent title (include)"
						class="min-w-56 flex-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-amber-300/40"
					/>
					<input
						type="text"
						value={props.torrentHistoryFilter.excludeTitleQuery()}
						onInput={(event) => props.torrentHistoryFilter.setExcludeTitleQuery(event.currentTarget.value)}
						placeholder="Filter by torrent title (exclude)"
						class="min-w-56 flex-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-amber-300/40"
					/>
					<select
						value={props.torrentHistoryFilter.resolutionFilter()}
						onChange={(event) => props.torrentHistoryFilter.setResolutionFilter(event.currentTarget.value)}
						class="appearance-none rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 outline-none transition focus:border-amber-300/40"
					>
						<For each={props.torrentHistoryFilter.resolutionOptions()}>
							{(resolution) => (
								<option class="bg-slate-950 text-slate-100" value={resolution}>{resolution === 'all' ? 'All resolutions' : resolution}</option>
							)}
						</For>
					</select>
					<input
						type="date"
						value={props.torrentHistoryFilter.fromDate()}
						onInput={(event) => props.torrentHistoryFilter.setFromDate(event.currentTarget.value)}
						class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 outline-none transition focus:border-amber-300/40"
					/>
					<input
						type="date"
						value={props.torrentHistoryFilter.toDate()}
						onInput={(event) => props.torrentHistoryFilter.setToDate(event.currentTarget.value)}
						class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 outline-none transition focus:border-amber-300/40"
					/>
					<div class="flex flex-wrap gap-2">
						{(['all', 'auto_downloaded', 'already_downloaded', 'blocked', 'pending', 'approved', 'skipped'] as TorrentFilter[]).map((value) => (
							<button
								type="button"
								class={props.torrentHistoryFilter.filter() === value
									? 'rounded-full border border-amber-300/40 bg-amber-300/15 px-3 py-1 text-xs font-medium text-amber-100'
									: 'rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300'}
								onClick={() => props.torrentHistoryFilter.setFilter(value)}
							>
								{value === 'all' ? 'All' : value} ({props.torrentHistoryFilter.filterCounts()[value] ?? 0})
							</button>
						))}
					</div>
				</div>
			<div class="grid gap-3">
				<Show when={props.torrentHistoryFilter.totalItems()} fallback={<EmptyState title="No torrent history yet" description="Approved, matched, already downloaded, blocked, and pending items will appear here after a run." />}>
					<For each={props.torrentHistoryFilter.paginatedTorrents()}>
						{(torrent) => (
							<div class="max-w-full rounded-2xl border border-white/10 bg-white/5 p-4">
								<div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
									<div class="min-w-0 max-w-full space-y-1">
										<div class="flex flex-wrap items-center gap-2">
												<p class="wrap-break-word text-wrap font-medium text-white">{torrent.item.title}</p>
											<span class={statusTagClass(torrent.status)}>{torrent.status}</span>
										</div>
												<p class="wrap-break-word text-xs text-slate-400">{torrent.item.seriesBaseRaw} · {torrent.item.resolution} · page {torrent.item.page}</p>
												<p class="wrap-break-word text-xs text-slate-400">{torrent.reason}</p>
												<p class="wrap-break-word text-xs text-slate-400">
											{torrent.item.publishedAtUtc ?? 'n/a'} · seeders {torrent.item.seeders ?? 'n/a'} · leechers {torrent.item.leechers ?? 'n/a'} · downloads {torrent.item.downloads ?? 'n/a'}
										</p>
									</div>
									<span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">{torrent.torrentId}</span>
								</div>
							</div>
						)}
					</For>
					<div class="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
						<p>
							Page {props.torrentHistoryFilter.currentPage()} of {props.torrentHistoryFilter.totalPages()} · showing {props.torrentHistoryFilter.paginatedTorrents().length} of {props.torrentHistoryFilter.totalItems()}
						</p>
						<div class="flex flex-wrap gap-2">
							<button
								type="button"
								class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
								onClick={props.torrentHistoryFilter.goFirstPage}
								disabled={props.torrentHistoryFilter.currentPage() <= 1}
							>
								first
							</button>
							<button
								type="button"
								class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
								onClick={props.torrentHistoryFilter.goPreviousPage}
								disabled={props.torrentHistoryFilter.currentPage() <= 1}
							>
								prev
							</button>
							<button
								type="button"
								class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
								onClick={props.torrentHistoryFilter.goNextPage}
								disabled={props.torrentHistoryFilter.currentPage() >= props.torrentHistoryFilter.totalPages()}
							>
								next
							</button>
							<button
								type="button"
								class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
								onClick={props.torrentHistoryFilter.goLastPage}
								disabled={props.torrentHistoryFilter.currentPage() >= props.torrentHistoryFilter.totalPages()}
							>
								last
							</button>
						</div>
					</div>
				</Show>
			</div>
			</div>
			</Show>
		</section>
	)
}
