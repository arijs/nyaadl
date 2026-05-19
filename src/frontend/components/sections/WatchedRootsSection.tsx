import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { StatusResponse } from '../../../shared/api'
import type { useWatchRoots } from '../../hooks/useWatchRoots'
import ActionButton from '../ui/ActionButton'
import EmptyState from '../ui/EmptyState'

interface WatchedRootsSectionProps {
	status: Accessor<StatusResponse | undefined>
	watchRoots: ReturnType<typeof useWatchRoots>
}

const WATCH_TARGETS_PAGE_SIZE = 10

export default function WatchedRootsSection(props: WatchedRootsSectionProps) {
	const [targetsQuery, setTargetsQuery] = createSignal('')
	const [resolutionFilter, setResolutionFilter] = createSignal('all')
	const [targetsPage, setTargetsPage] = createSignal(1)
	const [watchedRootsCollapsed, setWatchedRootsCollapsed] = createSignal(true)
	const [watchedRootsCollapseInitialized, setWatchedRootsCollapseInitialized] = createSignal(false)
	const [watchTargetsCollapsed, setWatchTargetsCollapsed] = createSignal(true)

	const resolutionOptions = createMemo(() => {
		const options = new Set<string>()
		for (const target of props.status()?.data.watchTargets ?? []) {
			options.add(target.resolution)
		}
		return ['all', ...Array.from(options).sort((a, b) => a.localeCompare(b))]
	})

	const watchTargetRows = createMemo(() => {
		const watchRoots = props.status()?.data.status.watchRoots ?? []
		return (props.status()?.data.watchTargets ?? []).map((target) => {
			const matchingRoot = watchRoots
				.filter((rootPath) => target.folderPath.toLowerCase().startsWith(rootPath.toLowerCase()))
				.sort((left, right) => right.length - left.length)[0]
			const rootName = matchingRoot
				? matchingRoot.split(/[\\/]/).filter(Boolean).pop() ?? matchingRoot
				: 'Unknown root'
			return {
				target,
				rootPath: matchingRoot,
				rootName,
			}
		})
	})

	const filteredWatchTargetRows = createMemo(() => {
		const query = targetsQuery().trim().toLowerCase()
		const selectedResolution = resolutionFilter()
		return watchTargetRows().filter((row) => {
			if (selectedResolution !== 'all' && row.target.resolution !== selectedResolution) {
				return false
			}
			if (!query) {
				return true
			}
			const haystack = `${row.target.folderName} ${row.target.normalizedKey} ${row.rootName}`.toLowerCase()
			return haystack.includes(query)
		})
	})

	const totalTargetsPages = createMemo(() => Math.max(1, Math.ceil(filteredWatchTargetRows().length / WATCH_TARGETS_PAGE_SIZE)))

	const paginatedWatchTargetRows = createMemo(() => {
		const start = (targetsPage() - 1) * WATCH_TARGETS_PAGE_SIZE
		const end = start + WATCH_TARGETS_PAGE_SIZE
		return filteredWatchTargetRows().slice(start, end)
	})

	createEffect(() => {
		targetsQuery()
		resolutionFilter()
		setTargetsPage(1)
	})

	createEffect(() => {
		const currentPage = targetsPage()
		const maxPage = totalTargetsPages()
		if (currentPage > maxPage) {
			setTargetsPage(maxPage)
		}
	})

	createEffect(() => {
		const statuses = props.status()?.data.status.watchRootStatuses
		if (!statuses || watchedRootsCollapseInitialized()) {
			return
		}
		setWatchedRootsCollapsed(statuses.length > 0)
		setWatchedRootsCollapseInitialized(true)
	})

	return (
		<section class="rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-lg shadow-black/20">
			<div class="flex items-center justify-between gap-4">
				<div>
					<h2 class="text-lg font-semibold text-white">
						Watched roots{watchedRootsCollapsed() ? ` (${(props.status()?.data.status.watchRootStatuses ?? []).length})` : ''}
					</h2>
					<Show when={!watchedRootsCollapsed()}>
						<p class="mt-1 text-sm text-slate-400">Manage watched folders here. The config starts empty and can be edited at any time.</p>
					</Show>
				</div>
				<div class="flex items-center gap-2">
					<ActionButton label="Reload roots" onClick={props.watchRoots.refreshRootsOnly} />
					<button
						type="button"
						class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300"
						onClick={() => setWatchedRootsCollapsed((current) => !current)}
					>
						{watchedRootsCollapsed() ? 'Expand' : 'Collapse'}
					</button>
				</div>
			</div>
			<Show when={!watchedRootsCollapsed()}>
			<div class="mt-5 space-y-4">
				<div class="flex flex-col gap-3 sm:flex-row">
					<input
						type="text"
						value={props.watchRoots.newRootPath()}
						onInput={(event) => props.watchRoots.setNewRootPath(event.currentTarget.value)}
						placeholder="Q:\\2026.2 PRIMAVERA"
						class="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-amber-300/40"
					/>
					<ActionButton label="Add folder" onClick={props.watchRoots.addWatchRoot} />
				</div>
				<Show when={props.watchRoots.rootMessage()}>
					<p class="text-sm text-rose-300">{props.watchRoots.rootMessage()}</p>
				</Show>
				<div class="space-y-2">
					<Show when={(props.status()?.data.status.watchRootStatuses ?? []).length} fallback={<EmptyState title="No watched roots configured" description="Add a folder above to start building watch targets." />}>
						<For each={props.status()?.data.status.watchRootStatuses ?? []}>
							{(root) => (
								<div class={root.exists && root.isDirectory ? 'rounded-2xl border border-emerald-400/15 bg-emerald-400/5 px-4 py-3' : 'rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3'}>
									<div class="flex items-center justify-between gap-4">
										<div class="min-w-0">
											<p class="truncate text-sm text-slate-100">{root.path}</p>
											<p class={root.exists && root.isDirectory ? 'mt-1 text-xs text-emerald-200' : 'mt-1 text-xs text-rose-200'}>
												{root.exists && root.isDirectory ? 'Available for scanning' : root.issue ?? 'Folder not available'}
											</p>
										</div>
										<div class="flex items-center gap-2">
											<span class={root.exists && root.isDirectory ? 'rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200' : 'rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-xs font-medium text-rose-200'}>
												{root.exists && root.isDirectory ? 'OK' : 'Missing'}
											</span>
											<ActionButton label="Remove" onClick={() => props.watchRoots.removeWatchRoot(root.path)} compact />
										</div>
									</div>
								</div>
							)}
						</For>
					</Show>
					<Show when={(props.status()?.data.status.watchRootStatuses ?? []).some((root) => !root.exists || !root.isDirectory)}>
						<div class="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
							<p class="font-medium">One or more watched roots need attention.</p>
							<p class="mt-1 text-rose-200/80">Missing or invalid folders will be flagged below.</p>
						</div>
					</Show>
				</div>
				<div class="border-t border-white/10 pt-4">
					<div class="flex items-center justify-between gap-3">
						<h3 class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
							Watch targets{watchTargetsCollapsed() ? ` (${watchTargetRows().length})` : ''}
						</h3>
						<button
							type="button"
							class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300"
							onClick={() => setWatchTargetsCollapsed((current) => !current)}
						>
							{watchTargetsCollapsed() ? 'Expand' : 'Collapse'}
						</button>
					</div>
					<Show when={!watchTargetsCollapsed()}>
						<p class="mt-1 text-sm text-slate-400">First-level folders only, with aliases and resolution normalization.</p>
					</Show>
				</div>
				<Show when={!watchTargetsCollapsed()}>
				<div class="flex flex-col gap-3 sm:flex-row">
					<input
						type="text"
						value={targetsQuery()}
						onInput={(event) => setTargetsQuery(event.currentTarget.value)}
						placeholder="Filter by folder, key or root"
						class="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-amber-300/40"
					/>
					<select
						value={resolutionFilter()}
						onChange={(event) => setResolutionFilter(event.currentTarget.value)}
						class="appearance-none rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-300/40"
					>
						<For each={resolutionOptions()}>
							{(resolution) => (
								<option class="bg-slate-950 text-slate-100" value={resolution}>{resolution === 'all' ? 'All resolutions' : resolution}</option>
							)}
						</For>
					</select>
				</div>
				<div class="flex items-center justify-between gap-3 text-xs text-slate-400">
					<p>Showing {paginatedWatchTargetRows().length} of {filteredWatchTargetRows().length} filtered · total {watchTargetRows().length}</p>
					<p>Page {targetsPage()} of {totalTargetsPages()}</p>
				</div>
				<Show when={filteredWatchTargetRows().length} fallback={<EmptyState title="No watch targets match the current filters" description="Try clearing the search or selecting another resolution." />}>
					<For each={paginatedWatchTargetRows()}>
						{(row) => (
							<div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
								<div class="flex items-center justify-between gap-4">
									<div>
										<p class="font-medium text-white">{row.target.folderName}</p>
										<p class="mt-1 text-xs text-slate-400">{row.target.normalizedKey}</p>
										<p class="mt-1 text-xs text-slate-500">Root: {row.rootName}</p>
									</div>
									<span class="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
										{row.target.resolution}
									</span>
								</div>
							</div>
						)}
					</For>
					<div class="mt-2 flex flex-wrap justify-end gap-2">
						<ActionButton label="Previous" onClick={() => { setTargetsPage((current) => Math.max(1, current - 1)) }} compact disabled={targetsPage() <= 1} />
						<ActionButton label="Next" onClick={() => { setTargetsPage((current) => Math.min(totalTargetsPages(), current + 1)) }} compact disabled={targetsPage() >= totalTargetsPages()} />
					</div>
				</Show>
				</Show>
			</div>
			</Show>
		</section>
	)
}
