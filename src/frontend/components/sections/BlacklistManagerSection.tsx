import { createSignal, For, Show } from 'solid-js'
import type { useBlacklistManager } from '../../hooks/useBlacklistManager'
import EmptyState from '../ui/EmptyState'

interface BlacklistManagerSectionProps {
	blacklistManager: ReturnType<typeof useBlacklistManager>
}

export default function BlacklistManagerSection(props: BlacklistManagerSectionProps) {
	const [collapsed, setCollapsed] = createSignal(false)

	return (
		<section class="rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-lg shadow-black/20 xl:col-span-2">
			<div class="flex items-center justify-between gap-4">
				<div>
					<h2 class="text-lg font-semibold text-white">Blacklist manager{collapsed() ? ` (${props.blacklistManager.totalItems()})` : ''}</h2>
					<Show when={!collapsed()}>
						<p class="mt-1 text-sm text-slate-400">Search and prune series + resolution blocks before the next scrape.</p>
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
							value={props.blacklistManager.titleQuery()}
							onInput={(event) => props.blacklistManager.setTitleQuery(event.currentTarget.value)}
							placeholder="Search series or blacklist key"
							class="min-w-56 flex-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-amber-300/40"
						/>
						<select
							value={props.blacklistManager.resolutionFilter()}
							onChange={(event) => props.blacklistManager.setResolutionFilter(event.currentTarget.value)}
							class="appearance-none rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200 outline-none transition focus:border-amber-300/40"
						>
							<For each={props.blacklistManager.resolutionOptions()}>
								{(resolution) => (
									<option class="bg-slate-950 text-slate-100" value={resolution}>
										{resolution === 'all'
											? `All resolutions (${props.blacklistManager.totalItems()})`
											: `${resolution} (${props.blacklistManager.resolutionCounts()[resolution] ?? 0})`}
									</option>
								)}
							</For>
						</select>
					</div>

					<div class="grid gap-3">
						<Show when={props.blacklistManager.isLoading()}>
							<div class="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">Loading blacklist...</div>
						</Show>
						<Show when={props.blacklistManager.error()}>
							<div class="rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-100">Failed to load blacklist entries.</div>
						</Show>

						<Show
							when={!props.blacklistManager.isLoading() && !props.blacklistManager.error() && props.blacklistManager.totalItems() > 0}
							fallback={<Show when={!props.blacklistManager.isLoading() && !props.blacklistManager.error()}><EmptyState title="Blacklist is empty" description="Blacklist entries from pending reviews will appear here." /></Show>}
						>
							<For each={props.blacklistManager.paginated()}>
								{(item) => (
									<div class="group max-w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2">
										<div class="flex items-center gap-2">
											<div class="min-w-0 flex items-center gap-2">
												<p class="truncate text-sm font-medium text-white">{item.seriesKey}</p>
												<span class="rounded-full border border-cyan-300/35 bg-cyan-300/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-100">
													{item.resolution}
												</span>
												<button
													type="button"
													class={
														(props.blacklistManager.deletingKey() === item.key
															? 'opacity-100 pointer-events-auto '
															: 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto '
														)
														+ 'rounded-full border border-rose-400/30 bg-rose-400/10 px-2.5 py-1 text-[11px] font-medium text-rose-200 transition-opacity duration-150 focus-visible:opacity-100 focus-visible:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-40'
													}
													onClick={() => void props.blacklistManager.removeItem(item.key)}
													disabled={props.blacklistManager.deletingKey() === item.key}
												>
													{props.blacklistManager.deletingKey() === item.key ? 'Removing...' : 'Remove'}
												</button>
											</div>
										</div>
									</div>
								)}
							</For>

							<div class="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
								<p>
									Page {props.blacklistManager.currentPage()} of {props.blacklistManager.totalPages()} · showing {props.blacklistManager.paginated().length} of {props.blacklistManager.totalItems()}
								</p>
								<div class="flex flex-wrap gap-2">
									<button
										type="button"
										class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
										onClick={props.blacklistManager.goFirstPage}
										disabled={props.blacklistManager.currentPage() <= 1}
									>
										first
									</button>
									<button
										type="button"
										class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
										onClick={props.blacklistManager.goPreviousPage}
										disabled={props.blacklistManager.currentPage() <= 1}
									>
										prev
									</button>
									<button
										type="button"
										class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
										onClick={props.blacklistManager.goNextPage}
										disabled={props.blacklistManager.currentPage() >= props.blacklistManager.totalPages()}
									>
										next
									</button>
									<button
										type="button"
										class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
										onClick={props.blacklistManager.goLastPage}
										disabled={props.blacklistManager.currentPage() >= props.blacklistManager.totalPages()}
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
