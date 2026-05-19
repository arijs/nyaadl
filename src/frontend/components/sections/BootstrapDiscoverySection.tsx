import { createSignal, For, Show } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { BootstrapDiscoveryResult } from '../../../shared/types'
import type { useBootstrapWorkflow } from '../../hooks/useBootstrapWorkflow'
import ActionButton from '../ui/ActionButton'

interface BootstrapDiscoverySectionProps {
	bootstrap: Accessor<BootstrapDiscoveryResult | undefined>
	resolveBootstrapAction: ReturnType<typeof useBootstrapWorkflow>['resolveBootstrapAction']
}

export default function BootstrapDiscoverySection(props: BootstrapDiscoverySectionProps) {
	const [showAllApproved, setShowAllApproved] = createSignal(false)
	const [showAllRejected, setShowAllRejected] = createSignal(false)
	const [showAllAlreadyDownloaded, setShowAllAlreadyDownloaded] = createSignal(false)
	const [showAllBackfilled, setShowAllBackfilled] = createSignal(false)
	const [autoApprovedCollapsed, setAutoApprovedCollapsed] = createSignal(false)
	const [autoRejectedCollapsed, setAutoRejectedCollapsed] = createSignal(false)
	const [alreadyDownloadedCollapsed, setAlreadyDownloadedCollapsed] = createSignal(false)
	const [backfilledCollapsed, setBackfilledCollapsed] = createSignal(false)
	const [collapsed, setCollapsed] = createSignal(false)
	const previewLimit = 5
	const shownCount = (total: number, expanded: boolean) => (expanded ? total : Math.min(total, previewLimit))
	const qbStatusCounts = () => {
		const entries = [
			...(props.bootstrap()?.autoApproved ?? []),
			...(props.bootstrap()?.backfilled ?? []),
		]
		let ok = 0
		let fail = 0
		for (const entry of entries) {
			const value = entry.qbResponseText?.trim()
			if (!value) {
				continue
			}
			if (value === 'Ok.') {
				ok += 1
			} else {
				fail += 1
			}
		}
		return { ok, fail }
	}

	return (
		<div class="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
			<div class="flex items-center justify-between mb-2">
				<h2 class="text-base font-semibold text-white">
					Scraping status
					<Show when={props.bootstrap()?.actionItem}>
						<span class="ml-2 text-xs font-normal text-amber-300">(Item pending)</span>
					</Show>
				</h2>
				<button
					type="button"
					class="rounded-full border border-slate-300/30 bg-slate-300/10 px-2 py-0.5 text-xs text-slate-100 ml-2"
					onClick={() => setCollapsed((c) => !c)}
				>
					{collapsed() ? 'Expand' : 'Collapse'}
				</button>
			</div>
			<Show when={collapsed()}>
				<Show when={props.bootstrap()}>
					<p class="text-xs text-slate-400 italic">{props.bootstrap()?.reason}</p>
				</Show>
			</Show>
			<Show when={!collapsed()}>
				<Show when={props.bootstrap()}>
					{(bootstrap) => (
						<div class="space-y-3">
							<p>Bootstrap discovery: {bootstrap().found ? 'checkpoint found' : 'not found yet'}</p>
							<p>Mode: {bootstrap().mode ?? 'n/a'}</p>
							<p>{bootstrap().reason}</p>
							<p>Pages scanned: {bootstrap().pagesScanned} · inspected torrents: {bootstrap().inspectedCount}</p>
							<p>Matched torrent: {bootstrap().title ?? 'n/a'}</p>
							<p>Next cursor: {typeof bootstrap().nextPage === 'number' ? `page ${bootstrap().nextPage} item ${bootstrap().nextItemIndex ?? 0}` : 'none'}</p>
							<Show when={bootstrap().actionItem}>
								{(actionItem) => (
									<div class="rounded-xl border border-white/10 bg-white/5 p-3">
										<p class="font-medium text-white">Needs review: {actionItem().item.title}</p>
										<p class="mt-1 text-xs text-slate-400">{actionItem().reason}</p>
										<div class="mt-3 flex flex-wrap gap-2">
											<ActionButton label="Approve" onClick={() => props.resolveBootstrapAction('approve')} compact />
											<ActionButton label="Blacklist" onClick={() => props.resolveBootstrapAction('blacklist')} compact />
											<ActionButton label="Skip" onClick={() => props.resolveBootstrapAction('skip')} compact />
										</div>
									</div>
								)}
							</Show>
							<p>
								Auto decisions: +{bootstrap().autoApproved?.length ?? 0} approved / +{bootstrap().autoRejected?.length ?? 0} rejected / +{bootstrap().alreadyDownloaded?.length ?? 0} already downloaded / +{bootstrap().backfilled?.length ?? 0} backfilled / +{qbStatusCounts().ok} qB Ok / +{qbStatusCounts().fail} qB Fail
							</p>
							<Show when={(bootstrap().backfilled?.length ?? 0) > 0}>
								<div class="rounded-xl border border-slate-400/20 bg-slate-400/10 p-3">
									<div class="flex items-center justify-between gap-2">
										<div>
											<p class="text-xs uppercase tracking-[0.2em] text-slate-200">Backfilled{backfilledCollapsed() ? ` (${bootstrap().backfilled?.length ?? 0})` : ''}</p>
											<Show when={!backfilledCollapsed()}>
												<p class="text-[11px] text-slate-100/90">Showing {shownCount(bootstrap().backfilled?.length ?? 0, showAllBackfilled())} of {bootstrap().backfilled?.length ?? 0}</p>
											</Show>
										</div>
										<div class="flex items-center gap-2">
											<Show when={!backfilledCollapsed() && (bootstrap().backfilled?.length ?? 0) > previewLimit}>
												<button type="button" class="rounded-full border border-slate-300/30 bg-slate-300/10 px-2 py-0.5 text-[11px] text-slate-100" onClick={() => setShowAllBackfilled((current) => !current)}>{showAllBackfilled() ? 'Show less' : 'Show all'}</button>
											</Show>
											<button type="button" class="rounded-full border border-slate-300/30 bg-slate-300/10 px-2 py-0.5 text-[11px] text-slate-100" onClick={() => setBackfilledCollapsed((current) => !current)}>{backfilledCollapsed() ? 'Expand' : 'Collapse'}</button>
										</div>
									</div>
									<Show when={!backfilledCollapsed()}>
										<For each={showAllBackfilled() ? (bootstrap().backfilled ?? []) : (bootstrap().backfilled?.slice(0, previewLimit) ?? [])}>
											{(entry) => (
												<div class="mt-1 rounded-lg border border-slate-300/15 bg-slate-900/20 px-2 py-1">
													<p class="text-xs text-slate-100">p{entry.page} #{entry.itemIndex}: {entry.title}<Show when={entry.qbResponseText}> / qB: {entry.qbResponseText}</Show></p>
													<Show when={entry.reason}><p class="mt-0.5 text-[11px] text-slate-200/85">{entry.reason}</p></Show>
												</div>
											)}
										</For>
									</Show>
								</div>
							</Show>
							<Show when={(bootstrap().autoApproved?.length ?? 0) > 0}>
								<div class="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3">
									<div class="flex items-center justify-between gap-2">
										<div>
											<p class="text-xs uppercase tracking-[0.2em] text-emerald-200">Auto approved{autoApprovedCollapsed() ? ` (${bootstrap().autoApproved?.length ?? 0})` : ''}</p>
											<Show when={!autoApprovedCollapsed()}>
												<p class="text-[11px] text-emerald-100/90">Showing {shownCount(bootstrap().autoApproved?.length ?? 0, showAllApproved())} of {bootstrap().autoApproved?.length ?? 0}</p>
											</Show>
										</div>
										<div class="flex items-center gap-2">
											<Show when={!autoApprovedCollapsed() && (bootstrap().autoApproved?.length ?? 0) > previewLimit}>
												<button type="button" class="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[11px] text-emerald-100" onClick={() => setShowAllApproved((current) => !current)}>{showAllApproved() ? 'Show less' : 'Show all'}</button>
											</Show>
											<button type="button" class="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[11px] text-emerald-100" onClick={() => setAutoApprovedCollapsed((current) => !current)}>{autoApprovedCollapsed() ? 'Expand' : 'Collapse'}</button>
										</div>
									</div>
									<Show when={!autoApprovedCollapsed()}>
										<For each={showAllApproved() ? (bootstrap().autoApproved ?? []) : (bootstrap().autoApproved?.slice(0, previewLimit) ?? [])}>
											{(entry) => (
												<div class="mt-1 rounded-lg border border-emerald-300/20 bg-emerald-900/20 px-2 py-1">
													<p class="text-xs text-emerald-100">p{entry.page} #{entry.itemIndex}: {entry.title}<Show when={entry.qbResponseText}> / qB: {entry.qbResponseText}</Show></p>
												</div>
											)}
										</For>
									</Show>
								</div>
							</Show>
							<Show when={(bootstrap().autoRejected?.length ?? 0) > 0}>
								<div class="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3">
									<div class="flex items-center justify-between gap-2">
										<div>
											<p class="text-xs uppercase tracking-[0.2em] text-rose-200">Auto rejected{autoRejectedCollapsed() ? ` (${bootstrap().autoRejected?.length ?? 0})` : ''}</p>
											<Show when={!autoRejectedCollapsed()}>
												<p class="text-[11px] text-rose-100/90">Showing {shownCount(bootstrap().autoRejected?.length ?? 0, showAllRejected())} of {bootstrap().autoRejected?.length ?? 0}</p>
											</Show>
										</div>
										<div class="flex items-center gap-2">
											<Show when={!autoRejectedCollapsed() && (bootstrap().autoRejected?.length ?? 0) > previewLimit}>
												<button type="button" class="rounded-full border border-rose-300/30 bg-rose-300/10 px-2 py-0.5 text-[11px] text-rose-100" onClick={() => setShowAllRejected((current) => !current)}>{showAllRejected() ? 'Show less' : 'Show all'}</button>
											</Show>
											<button type="button" class="rounded-full border border-rose-300/30 bg-rose-300/10 px-2 py-0.5 text-[11px] text-rose-100" onClick={() => setAutoRejectedCollapsed((current) => !current)}>{autoRejectedCollapsed() ? 'Expand' : 'Collapse'}</button>
										</div>
									</div>
									<Show when={!autoRejectedCollapsed()}>
										<For each={showAllRejected() ? (bootstrap().autoRejected ?? []) : (bootstrap().autoRejected?.slice(0, previewLimit) ?? [])}>
											{(entry) => <p class="mt-1 text-xs text-rose-100">p{entry.page} #{entry.itemIndex}: {entry.title}</p>}
										</For>
									</Show>
								</div>
							</Show>
							<Show when={(bootstrap().alreadyDownloaded?.length ?? 0) > 0}>
								<div class="rounded-xl border border-sky-400/20 bg-sky-400/10 p-3">
									<div class="flex items-center justify-between gap-2">
										<div>
											<p class="text-xs uppercase tracking-[0.2em] text-sky-200">Already downloaded{alreadyDownloadedCollapsed() ? ` (${bootstrap().alreadyDownloaded?.length ?? 0})` : ''}</p>
											<Show when={!alreadyDownloadedCollapsed()}>
												<p class="text-[11px] text-sky-100/90">Showing {shownCount(bootstrap().alreadyDownloaded?.length ?? 0, showAllAlreadyDownloaded())} of {bootstrap().alreadyDownloaded?.length ?? 0}</p>
											</Show>
										</div>
										<div class="flex items-center gap-2">
											<Show when={!alreadyDownloadedCollapsed() && (bootstrap().alreadyDownloaded?.length ?? 0) > previewLimit}>
												<button type="button" class="rounded-full border border-sky-300/30 bg-sky-300/10 px-2 py-0.5 text-[11px] text-sky-100" onClick={() => setShowAllAlreadyDownloaded((current) => !current)}>{showAllAlreadyDownloaded() ? 'Show less' : 'Show all'}</button>
											</Show>
											<button type="button" class="rounded-full border border-sky-300/30 bg-sky-300/10 px-2 py-0.5 text-[11px] text-sky-100" onClick={() => setAlreadyDownloadedCollapsed((current) => !current)}>{alreadyDownloadedCollapsed() ? 'Expand' : 'Collapse'}</button>
										</div>
									</div>
									<Show when={!alreadyDownloadedCollapsed()}>
										<For each={showAllAlreadyDownloaded() ? (bootstrap().alreadyDownloaded ?? []) : (bootstrap().alreadyDownloaded?.slice(0, previewLimit) ?? [])}>
											{(entry) => (
												<p class="mt-1 text-xs text-sky-100">
													p{entry.page} #{entry.itemIndex}: {entry.title}
													<Show when={entry.newlyFound}>
														<span class="ml-2 font-bold text-emerald-300">Newly found</span>
													</Show>
													<Show when={entry.fileMissing}>
														<span class="ml-2 font-bold text-rose-300">File missing</span>
													</Show>
												</p>
											)}
										</For>
									</Show>
								</div>
							</Show>
						</div>
					)}
				</Show>
			</Show>
		</div>
	)
}