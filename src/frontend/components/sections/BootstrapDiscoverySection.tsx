import { createSignal, For, Show } from 'solid-js'
import type { Accessor, JSX } from 'solid-js'
import type { StatusResponse } from '../../../shared/api'
import type { BootstrapAutoDecisionSummary, BootstrapDiscoveryResult, DecisionStatus, PendingItem } from '../../../shared/types'
import { isQbittorrentAddSuccess } from '../../../shared/qbittorrent'
import type { useDashboardActions } from '../../hooks/useDashboardActions'
import type { useBootstrapWorkflow } from '../../hooks/useBootstrapWorkflow'
import ActionButton from '../ui/ActionButton'
import NyaaMeta from '../ui/NyaaMeta'

interface BootstrapDiscoverySectionProps {
	status: Accessor<StatusResponse | undefined>
	bootstrap: Accessor<BootstrapDiscoveryResult | undefined>
	bootstrapWorkflow: ReturnType<typeof useBootstrapWorkflow>
	dashboardActions: ReturnType<typeof useDashboardActions>
}

// Literal class strings so Tailwind picks them up.
const tones = {
	amber: { box: 'border-amber-400/20 bg-amber-400/10', title: 'text-amber-200', sub: 'text-amber-100/90', button: 'border-amber-300/30 bg-amber-300/10 text-amber-100' },
	teal: { box: 'border-teal-400/20 bg-teal-400/10', title: 'text-teal-200', sub: 'text-teal-100/90', button: 'border-teal-300/30 bg-teal-300/10 text-teal-100' },
	orange: { box: 'border-orange-400/20 bg-orange-400/10', title: 'text-orange-200', sub: 'text-orange-100/90', button: 'border-orange-300/30 bg-orange-300/10 text-orange-100' },
	violet: { box: 'border-violet-400/20 bg-violet-400/10', title: 'text-violet-200', sub: 'text-violet-100/90', button: 'border-violet-300/30 bg-violet-300/10 text-violet-100' },
	red: { box: 'border-red-500/30 bg-red-500/10', title: 'text-red-200', sub: 'text-red-100/90', button: 'border-red-300/30 bg-red-300/10 text-red-100' },
	slate: { box: 'border-slate-400/20 bg-slate-400/10', title: 'text-slate-200', sub: 'text-slate-100/90', button: 'border-slate-300/30 bg-slate-300/10 text-slate-100' },
	emerald: { box: 'border-emerald-400/20 bg-emerald-400/10', title: 'text-emerald-200', sub: 'text-emerald-100/90', button: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100' },
	rose: { box: 'border-rose-400/20 bg-rose-400/10', title: 'text-rose-200', sub: 'text-rose-100/90', button: 'border-rose-300/30 bg-rose-300/10 text-rose-100' },
	sky: { box: 'border-sky-400/20 bg-sky-400/10', title: 'text-sky-200', sub: 'text-sky-100/90', button: 'border-sky-300/30 bg-sky-300/10 text-sky-100' },
}

const previewLimit = 5

function SummaryBox(props: {
	label: string
	entries: BootstrapAutoDecisionSummary[]
	tone: (typeof tones)[keyof typeof tones]
	children: (entry: BootstrapAutoDecisionSummary) => JSX.Element
}) {
	const [showAll, setShowAll] = createSignal(false)
	const [collapsed, setCollapsed] = createSignal(false)
	const buttonClass = () => `rounded-full border px-2 py-0.5 text-[11px] ${props.tone.button}`
	return (
		<Show when={props.entries.length > 0}>
			<div class={`rounded-xl border p-3 ${props.tone.box}`}>
				<div class="flex items-center justify-between gap-2">
					<div>
						<p class={`text-xs uppercase tracking-[0.2em] ${props.tone.title}`}>{props.label}{collapsed() ? ` (${props.entries.length})` : ''}</p>
						<Show when={!collapsed()}>
							<p class={`text-[11px] ${props.tone.sub}`}>Showing {showAll() ? props.entries.length : Math.min(props.entries.length, previewLimit)} of {props.entries.length}</p>
						</Show>
					</div>
					<div class="flex items-center gap-2">
						<Show when={!collapsed() && props.entries.length > previewLimit}>
							<button type="button" class={buttonClass()} onClick={() => setShowAll((current) => !current)}>{showAll() ? 'Show less' : 'Show all'}</button>
						</Show>
						<button type="button" class={buttonClass()} onClick={() => setCollapsed((current) => !current)}>{collapsed() ? 'Expand' : 'Collapse'}</button>
					</div>
				</div>
				<Show when={!collapsed()}>
					<For each={showAll() ? props.entries : props.entries.slice(0, previewLimit)}>{props.children}</For>
				</Show>
			</div>
		</Show>
	)
}

function ManualEntry(props: { entry: BootstrapAutoDecisionSummary; textClass: string }) {
	return (
		<div class={`mt-1 text-xs ${props.textClass}`}>
			<p>p{props.entry.page} #{props.entry.itemIndex}: {props.entry.title} <NyaaMeta torrentId={props.entry.torrentId} category={props.entry.category} sizeText={props.entry.sizeText} /></p>
			<Show when={props.entry.reason}><p class="mt-0.5 text-[11px] opacity-85">{props.entry.reason}</p></Show>
		</div>
	)
}

export default function BootstrapDiscoverySection(props: BootstrapDiscoverySectionProps) {
	const [collapsed, setCollapsed] = createSignal(false)
	const currentDiscoveryPage = () => props.bootstrap()?.currentPage ?? props.bootstrapWorkflow.bootstrapCursor()?.page ?? 1
	// In whole-page mode the whole page was queued at once, so the review spotlight tracks the
	// head of the live queue and advances as items get resolved. Single-item mode keeps using the
	// static actionItem returned by the last discovery step.
	const reviewItem = (): PendingItem | undefined => {
		const bootstrap = props.bootstrap()
		if (bootstrap?.wholePage) {
			return props.status()?.data.queue?.[0]
		}
		return bootstrap?.actionItem
	}
	const resolveReviewItem = (action: 'approve' | 'blacklist' | 'skip') => {
		const item = reviewItem()
		if (!item) {
			return
		}
		if (props.bootstrap()?.wholePage) {
			if (action === 'approve') {
				void props.bootstrapWorkflow.approveQueueItem(item.torrentId, item.item.title, item.item.page)
			} else if (action === 'blacklist') {
				void props.bootstrapWorkflow.blacklistQueueItem(item.torrentId, item.item.title, item.item.page)
			} else {
				void props.bootstrapWorkflow.skipQueueItem(item.torrentId, item.item.title, item.item.page)
			}
			return
		}
		void props.bootstrapWorkflow.resolveBootstrapAction(action)
	}
	const manualEntries = (status: DecisionStatus) => props.bootstrap()?.manual?.filter((entry) => entry.status === status) ?? []
	// An item can sit in two lists (a replayed approval that was also backfilled), so count page slots.
	const listedCount = () => {
		const bootstrap = props.bootstrap()
		const entries = [
			...(bootstrap?.manual ?? []),
			...(bootstrap?.qbFailed ?? []),
			...(bootstrap?.backfilled ?? []),
			...(bootstrap?.autoApproved ?? []),
			...(bootstrap?.autoRejected ?? []),
			...(bootstrap?.alreadyDownloaded ?? []),
		]
		return new Set(entries.map((entry) => `${entry.page}:${entry.itemIndex}`)).size
	}
	// ponytail: full qB body only on failure, for debugging
	const qbLabel = (text: string | undefined) => (isQbittorrentAddSuccess(text) ? 'Ok' : text)
	const qbStatusCounts = () => {
		const entries = [
			...(props.bootstrap()?.autoApproved ?? []),
			...(props.bootstrap()?.backfilled ?? []),
		]
		let ok = 0
		let fail = props.bootstrap()?.qbFailed?.length ?? 0
		for (const entry of entries) {
			const value = entry.qbResponseText?.trim()
			if (!value) {
				continue
			}
			if (isQbittorrentAddSuccess(value)) {
				ok += 1
			} else {
				fail += 1
			}
		}
		return { ok, fail }
	}

	return (
		<div class="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
			<div class={`flex items-center justify-between ${props.bootstrap() ? 'mb-2' : 'mb-0'}`}>
				<h2 class="text-base font-semibold text-white">
					Scraping status
					<Show when={reviewItem()}>
						<span class="ml-2 text-xs font-normal text-amber-300">(Item pending)</span>
					</Show>
				</h2>
				<div class="ml-2 flex flex-wrap items-center gap-2">
					<label class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200">
						<span class="text-slate-300">Query</span>
						<input
							type="text"
							value={props.bootstrapWorkflow.bootstrapQueryDraft()}
							onInput={(event) => props.bootstrapWorkflow.setBootstrapQueryDraft(event.currentTarget.value)}
							placeholder="e.g. Erai-raws -HEVC"
							class="min-w-56 border-none bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-400"
						/>
					</label>
					<ActionButton
						label="Search"
						onClick={props.bootstrapWorkflow.submitBootstrapQuery}
						disabled={props.bootstrapWorkflow.isBootstrapQuerySubmitDisabled()}
						compact
					/>
					<label class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200">
						<input
							type="checkbox"
							checked={props.bootstrapWorkflow.processWholePage()}
							onChange={(event) => props.bootstrapWorkflow.setProcessWholePage(event.currentTarget.checked)}
							class="h-3.5 w-3.5 accent-amber-300"
						/>
						<span>process whole page</span>
					</label>
					<Show
						when={props.bootstrap()}
						fallback={(
							<>
								<ActionButton label="Start scraping" onClick={props.bootstrapWorkflow.runDefaultBootstrapDiscovery} compact />
							</>
						)}
					>
						<button
							type="button"
							class="rounded-full border border-slate-300/30 bg-slate-300/10 px-2 py-0.5 text-xs text-slate-100"
							onClick={() => setCollapsed((c) => !c)}
						>
							{collapsed() ? 'Expand' : 'Collapse'}
						</button>
					</Show>
				</div>
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
							<div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
								<div class="space-y-1">
									<p>Bootstrap discovery: {bootstrap().found ? 'checkpoint found' : 'not found yet'}</p>
									<p>Query: {bootstrap().customQuery ?? 'default'}</p>
									<p>Mode: {bootstrap().mode ?? 'n/a'}</p>
									<p>{bootstrap().reason}</p>
									<p>Pages scanned: {bootstrap().pagesScanned} · inspected torrents: {bootstrap().inspectedCount}</p>
									<Show when={bootstrap().nyaaResultsText}>
										<p>{bootstrap().nyaaResultsText}</p>
									</Show>
									<p>Matched torrent: {bootstrap().title ?? 'n/a'} <Show when={bootstrap().torrentId}>{(torrentId) => <NyaaMeta torrentId={torrentId()} />}</Show></p>
									<Show when={bootstrap().hasNextPage !== false}>
										<p>Next cursor: {typeof bootstrap().nextPage === 'number' ? `page ${bootstrap().nextPage} item ${bootstrap().nextItemIndex ?? 0}` : 'none'}</p>
									</Show>
								</div>
								<div class="flex w-full flex-col gap-2 lg:w-auto lg:min-w-60">
									<div class="flex w-full items-center gap-2">
										<ActionButton
											label="Prev page"
											onClick={() => props.bootstrapWorkflow.runBootstrapDiscoveryForPage(currentDiscoveryPage() - 1)}
											disabled={currentDiscoveryPage() <= 1}
											compact
											class="flex-1"
										/>
										<ActionButton label="Next page" onClick={props.bootstrapWorkflow.runBootstrapDiscoveryStep} disabled={bootstrap().hasNextPage === false} compact class="flex-1" />
									</div>
									<Show when={props.bootstrapWorkflow.bootstrapCursor()}>
										<ActionButton label="Reset scraping status" onClick={props.bootstrapWorkflow.clearBootstrapDiscoveryStatus} compact />
									</Show>
									<label class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200">
										<input
											type="checkbox"
											checked={props.bootstrapWorkflow.qbForceResubmit()}
											onChange={(event) => props.bootstrapWorkflow.setQbForceResubmit(event.currentTarget.checked)}
											class="h-3.5 w-3.5 accent-amber-300"
										/>
										<span>force resubmit to qBittorrent</span>
									</label>
								</div>
							</div>
							<Show when={reviewItem()}>
								{(actionItem) => (
									<div class="rounded-xl border border-white/10 bg-white/5 p-3">
										<p class="font-medium text-white">Needs review: {actionItem().item.title}</p>
										<NyaaMeta torrentId={actionItem().torrentId} category={actionItem().item.category} sizeText={actionItem().item.sizeText} />
										<p class="mt-1 text-xs text-slate-400">{actionItem().reason}</p>
										<div class="mt-3 flex flex-wrap gap-2">
											<ActionButton label="Approve" onClick={() => resolveReviewItem('approve')} compact />
											<ActionButton label="Blacklist" onClick={() => resolveReviewItem('blacklist')} compact />
											<ActionButton label="Skip" onClick={() => resolveReviewItem('skip')} compact />
										</div>
									</div>
								)}
							</Show>
							<p>
								Auto decisions: +{bootstrap().autoApproved?.length ?? 0} approved / +{bootstrap().autoRejected?.length ?? 0} rejected / +{bootstrap().alreadyDownloaded?.length ?? 0} already downloaded / +{bootstrap().backfilled?.length ?? 0} backfilled / +{qbStatusCounts().ok} qB Ok / +{qbStatusCounts().fail} qB Fail
							</p>
							<p>
								Manual decisions: {manualEntries('pending').length} pending / {manualEntries('approved').length} approved / {manualEntries('blocked').length} rejected / {manualEntries('skipped').length} skipped
								<Show when={bootstrap().pageItemCount}>
									{(pageItemCount) => <> · listed {listedCount()} of {pageItemCount()} page items</>}
								</Show>
							</p>
							<SummaryBox label="Pending" entries={manualEntries('pending')} tone={tones.amber}>
								{(entry) => <ManualEntry entry={entry} textClass="text-amber-100" />}
							</SummaryBox>
							<SummaryBox label="Manual approved" entries={manualEntries('approved')} tone={tones.teal}>
								{(entry) => <ManualEntry entry={entry} textClass="text-teal-100" />}
							</SummaryBox>
							<SummaryBox label="Manual rejected" entries={manualEntries('blocked')} tone={tones.orange}>
								{(entry) => <ManualEntry entry={entry} textClass="text-orange-100" />}
							</SummaryBox>
							<SummaryBox label="Manual skipped" entries={manualEntries('skipped')} tone={tones.violet}>
								{(entry) => <ManualEntry entry={entry} textClass="text-violet-100" />}
							</SummaryBox>
							<SummaryBox label="qB failed" entries={bootstrap().qbFailed ?? []} tone={tones.red}>
								{(entry) => <ManualEntry entry={entry} textClass="text-red-100" />}
							</SummaryBox>
							<SummaryBox label="Backfilled" entries={bootstrap().backfilled ?? []} tone={tones.slate}>
								{(entry) => (
									<div class="mt-1 rounded-lg border border-slate-300/15 bg-slate-900/20 px-2 py-1">
										<p class="text-xs text-slate-100">
											p{entry.page} #{entry.itemIndex}: {entry.title} <NyaaMeta torrentId={entry.torrentId} category={entry.category} sizeText={entry.sizeText} />
											<Show when={entry.resubmittedFromNyaa}>
												<span class="ml-2 font-bold text-emerald-300">Resubmitted from Nyaa</span>
											</Show>
											<Show when={entry.fileMissing}>
												<span class="ml-2 font-bold text-rose-300">File missing</span>
											</Show>
											<Show when={entry.qbResponseText}> / qB: {qbLabel(entry.qbResponseText)}</Show>
										</p>
										<Show when={entry.reason}><p class="mt-0.5 text-[11px] text-slate-200/85">{entry.reason}</p></Show>
									</div>
								)}
							</SummaryBox>
							<SummaryBox label="Auto approved" entries={bootstrap().autoApproved ?? []} tone={tones.emerald}>
								{(entry) => (
									<div class="mt-1 rounded-lg border border-emerald-300/20 bg-emerald-900/20 px-2 py-1">
										<p class="text-xs text-emerald-100">p{entry.page} #{entry.itemIndex}: {entry.title} <NyaaMeta torrentId={entry.torrentId} category={entry.category} sizeText={entry.sizeText} /><Show when={entry.qbResponseText}> / qB: {qbLabel(entry.qbResponseText)}</Show></p>
									</div>
								)}
							</SummaryBox>
							<SummaryBox label="Auto rejected" entries={bootstrap().autoRejected ?? []} tone={tones.rose}>
								{(entry) => <p class="mt-1 text-xs text-rose-100">p{entry.page} #{entry.itemIndex}: {entry.title} <NyaaMeta torrentId={entry.torrentId} category={entry.category} sizeText={entry.sizeText} /></p>}
							</SummaryBox>
							<SummaryBox label="Already downloaded" entries={bootstrap().alreadyDownloaded ?? []} tone={tones.sky}>
								{(entry) => (
									<p class="mt-1 text-xs text-sky-100">
										p{entry.page} #{entry.itemIndex}: {entry.title} <NyaaMeta torrentId={entry.torrentId} category={entry.category} sizeText={entry.sizeText} />
										<Show when={entry.newlyFound}>
											<span class="ml-2 font-bold text-emerald-300">Newly found</span>
										</Show>
										<Show when={entry.fileMissing}>
											<span class="ml-2 font-bold text-rose-300">File missing</span>
										</Show>
									</p>
								)}
							</SummaryBox>
						</div>
					)}
				</Show>
			</Show>
		</div>
	)
}