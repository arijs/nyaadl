import { createSignal, For, Show } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { StatusResponse } from '../../../shared/api'
import type { useDashboardActions } from '../../hooks/useDashboardActions'
import type { useBootstrapWorkflow } from '../../hooks/useBootstrapWorkflow'
import ActionButton from '../ui/ActionButton'
import EmptyState from '../ui/EmptyState'

interface PendingQueueSectionProps {
	status: Accessor<StatusResponse | undefined>
	dashboardActions: ReturnType<typeof useDashboardActions>
	bootstrapWorkflow: ReturnType<typeof useBootstrapWorkflow>
}

function splitErrorMessage(message: string): { main: string; context?: string } {
	const markerIndex = message.lastIndexOf(' (')
	if (markerIndex < 0 || !message.endsWith(')')) {
		return { main: message }
	}
	const contextCandidate = message.slice(markerIndex + 2, -1)
	if (!contextCandidate.includes('torrentId=')
		&& !contextCandidate.includes('page=')
		&& !contextCandidate.includes('title=')
		&& !contextCandidate.includes('|')) {
		return { main: message }
	}
	return {
		main: message.slice(0, markerIndex),
		context: contextCandidate,
	}
}

export default function PendingQueueSection(props: PendingQueueSectionProps) {
	const [collapsed, setCollapsed] = createSignal(false)

	return (
		<section class="rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-lg shadow-black/20">
			<div class="flex items-center justify-between gap-4">
				<div>
					<h2 class="text-lg font-semibold text-white">Pending queue{collapsed() ? ` (${(props.status()?.data.queue ?? []).length})` : ''}</h2>
					<Show when={!collapsed()}>
						<p class="mt-1 text-sm text-slate-400">This will later expose approve, blacklist, and skip actions.</p>
					</Show>
				</div>
				<div class="flex items-center gap-2">
					<ActionButton label="Approve all pending" onClick={props.dashboardActions.approveAllPending} />
					<button
						type="button"
						class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300"
						onClick={() => setCollapsed((current) => !current)}
					>
						{collapsed() ? 'Expand' : 'Collapse'}
					</button>
				</div>
			</div>
			<Show when={!collapsed()}>
			<div class="mt-5 grid gap-3">
				<Show when={props.status()?.data.queue.length} fallback={<EmptyState title="No queue items yet" description="Once scraping starts, ambiguous releases will appear here." />}>
					<For each={props.status()?.data.queue ?? []}>
						{(item) => (
							(() => {
								const pendingError = props.bootstrapWorkflow.getQueueActionError(item.torrentId)
								const errorParts = pendingError ? splitErrorMessage(pendingError) : undefined
								return (
							<div class="max-w-full rounded-2xl border border-white/10 bg-white/5 p-4">
								<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
									<div class="min-w-0 max-w-full">
										<p class="break-words text-wrap font-medium text-white">{item.item.title}</p>
										<p class="mt-1 break-words text-xs text-slate-400">{item.item.seriesBaseRaw} · {item.item.resolution} · page {item.item.page}</p>
										<p class="mt-1 break-words text-xs text-slate-400">{item.reason}</p>
										<Show when={errorParts}>
											<div class="mt-2 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">
												<p>{errorParts?.main}</p>
												<Show when={errorParts?.context}>
													<p class="mt-1 text-[11px] text-rose-100/90">{errorParts?.context}</p>
												</Show>
											</div>
										</Show>
									</div>
									<div class="flex flex-wrap items-center gap-2 shrink-0">
										<span class="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-200">{item.status}</span>
										<ActionButton label="Approve" onClick={() => props.bootstrapWorkflow.approveQueueItem(item.torrentId, item.item.title, item.item.page)} compact />
										<ActionButton label="Blacklist" onClick={() => props.bootstrapWorkflow.blacklistQueueItem(item.torrentId, item.item.title, item.item.page)} compact />
										<ActionButton label="Skip" onClick={() => props.bootstrapWorkflow.skipQueueItem(item.torrentId, item.item.title, item.item.page)} compact />
									</div>
								</div>
							</div>
								)
							})()
						)}
					</For>
				</Show>
			</div>
			</Show>
		</section>
	)
}
