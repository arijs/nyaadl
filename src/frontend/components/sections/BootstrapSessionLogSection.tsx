import { createSignal, For, Show } from 'solid-js'
import { BOOTSTRAP_SESSION_LOG_PAGE_SIZE, type useBootstrapSessionLog } from '../../hooks/useBootstrapSessionLog'
import type { BootstrapLogFilter } from '../../types'
import ActionButton from '../ui/ActionButton'

interface BootstrapSessionLogSectionProps {
	bootstrapLog: ReturnType<typeof useBootstrapSessionLog>
}

export default function BootstrapSessionLogSection(props: BootstrapSessionLogSectionProps) {
	const [collapsed, setCollapsed] = createSignal(true)

	return (
		<section class="rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-lg shadow-black/20 xl:col-span-2">
			<div class="flex items-center justify-between gap-3">
				<p class="text-lg font-semibold text-white">
					Bootstrap session log{collapsed() ? ` (${props.bootstrapLog.entries().length})` : ''}
				</p>
				<button
					type="button"
					class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300"
					onClick={() => setCollapsed((current) => !current)}
				>
					{collapsed() ? 'Expand' : 'Collapse'}
				</button>
			</div>
			<Show when={!collapsed()}>
				<div class="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
					<div class="flex items-center justify-between gap-3">
						<p class="font-medium text-white">Session events</p>
						<div class="flex flex-wrap gap-2">
							<ActionButton label="Export JSON" onClick={props.bootstrapLog.exportLog} compact />
							<ActionButton label="Clear session" onClick={props.bootstrapLog.clearEntries} compact />
						</div>
					</div>
					<div class="mt-3 flex flex-wrap items-center justify-between gap-3">
						<div class="flex flex-wrap gap-2">
							{(['all', 'step', 'action', 'error'] as BootstrapLogFilter[]).map((value) => (
								<button
									type="button"
									class={props.bootstrapLog.filter() === value
										? 'rounded-full border border-amber-300/40 bg-amber-300/15 px-3 py-1 text-xs font-medium text-amber-100'
										: 'rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300'}
									onClick={() => props.bootstrapLog.setFilter(value)}
								>
									{value}
								</button>
							))}
						</div>
						<p class="text-xs text-slate-400">
							Showing {props.bootstrapLog.paginatedEntries().length} of {props.bootstrapLog.filteredEntries().length} filtered · total {props.bootstrapLog.entries().length}
						</p>
					</div>
					<input
						type="text"
						value={props.bootstrapLog.query()}
						onInput={(event) => props.bootstrapLog.setQuery(event.currentTarget.value)}
						placeholder="Search by title, reason, page..."
						class="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-amber-300/40"
					/>
					<Show when={props.bootstrapLog.filteredEntries().length} fallback={<p class="mt-3 text-slate-400">No events for this filter in current session.</p>}>
						<div class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
							<p class="text-xs text-slate-300">Page {props.bootstrapLog.page()} of {props.bootstrapLog.totalPages()} · {BOOTSTRAP_SESSION_LOG_PAGE_SIZE} entries per page</p>
							<div class="flex flex-wrap gap-2">
								<ActionButton label="First" onClick={props.bootstrapLog.firstPage} compact disabled={props.bootstrapLog.page() <= 1} />
								<ActionButton label="Previous" onClick={props.bootstrapLog.previousPage} compact disabled={props.bootstrapLog.page() <= 1} />
								<ActionButton label="Next" onClick={props.bootstrapLog.nextPage} compact disabled={props.bootstrapLog.page() >= props.bootstrapLog.totalPages()} />
								<ActionButton label="Last" onClick={props.bootstrapLog.lastPage} compact disabled={props.bootstrapLog.page() >= props.bootstrapLog.totalPages()} />
							</div>
						</div>
						<div class="mt-3 space-y-2">
							<For each={props.bootstrapLog.paginatedEntries()}>
								{(entry) => (
									<div class="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
										<p class="text-xs text-slate-400">{entry.timestampUtc}</p>
										<p class="text-xs text-slate-100">[{entry.kind}] {entry.message}</p>
										<Show when={typeof entry.page === 'number'}>
											<p class="text-xs text-slate-400">page {entry.page}{typeof entry.itemIndex === 'number' ? ` · item ${entry.itemIndex}` : ''}</p>
										</Show>
									</div>
								)}
							</For>
						</div>
					</Show>
				</div>
			</Show>
		</section>
	)
}
