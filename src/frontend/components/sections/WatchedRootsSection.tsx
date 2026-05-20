import { createEffect, createSignal, For, Show } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { StatusResponse } from '../../../shared/api'
import type { useWatchRoots } from '../../hooks/useWatchRoots'
import type { useWatchTargets } from '../../hooks/useWatchTargets'
import ActionButton from '../ui/ActionButton'
import EmptyState from '../ui/EmptyState'

interface WatchedRootsSectionProps {
	status: Accessor<StatusResponse | undefined>
	watchRoots: ReturnType<typeof useWatchRoots>
	watchTargets: ReturnType<typeof useWatchTargets>
}

interface RowExpanded {
	[key: string]: boolean
}

export default function WatchedRootsSection(props: WatchedRootsSectionProps) {
	const [watchedRootsCollapsed, setWatchedRootsCollapsed] = createSignal(true)
	const [watchedRootsCollapseInitialized, setWatchedRootsCollapseInitialized] = createSignal(false)
	const [watchTargetsCollapsed, setWatchTargetsCollapsed] = createSignal(true)
	const [expandedRows, setExpandedRows] = createSignal<RowExpanded>({})

	createEffect(() => {
		props.watchTargets.targetsQuery()
		props.watchTargets.resolutionFilter()
		props.watchTargets.rootFilter()
		props.watchTargets.goFirstPage()
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
											<p class="text-sm text-slate-100">
												<span class="">{root.path}</span>
												<span class="rounded-full border border-cyan-300/25 bg-cyan-300/10 mx-2 px-2 py-0 text-xs font-medium leading-2 text-cyan-100">
													{root.watchTargetsCount}
												</span>
											</p>
											<p class={root.exists && root.isDirectory ? 'mt-1 text-xs text-emerald-200' : 'mt-1 text-xs text-rose-200'}>
												{root.exists && root.isDirectory
													? `Available for scanning`
													: root.issue ?? 'Folder not available'}
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
							Watch targets{watchTargetsCollapsed() ? ` (${props.watchTargets.totalItems()})` : ''}
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
				<div class="flex flex-col gap-2">
					<input
						type="text"
						value={props.watchTargets.targetsQuery()}
						onInput={(event) => props.watchTargets.setTargetsQuery(event.currentTarget.value)}
						placeholder="Filter by folder, key or root"
						class="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-amber-300/40"
					/>
					<div class="flex flex-col gap-2 sm:flex-row">
						<select
							value={props.watchTargets.rootFilter()}
							onChange={(event) => props.watchTargets.setRootFilter(event.currentTarget.value)}
							class="flex-1 appearance-none rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-300/40"
						>
							<For each={props.watchTargets.rootOptions()}>
								{(root) => (
									<option class="bg-slate-950 text-slate-100" value={root}>
										{root === 'all'
											? `All roots (${props.watchTargets.totalItems()})`
											: `${root} (${props.watchTargets.rootCounts()[root] ?? 0})`}
									</option>
								)}
							</For>
						</select>
						<select
							value={props.watchTargets.resolutionFilter()}
							onChange={(event) => props.watchTargets.setResolutionFilter(event.currentTarget.value)}
							class="flex-1 appearance-none rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-amber-300/40"
						>
							<For each={props.watchTargets.resolutionOptions()}>
								{(resolution) => (
									<option class="bg-slate-950 text-slate-100" value={resolution}>
										{resolution === 'all'
											? `All resolutions (${props.watchTargets.totalItems()})`
											: `${resolution} (${props.watchTargets.resolutionCounts()[resolution] ?? 0})`}
									</option>
								)}
							</For>
						</select>
					</div>
				</div>
				<div class="flex items-center justify-between gap-3 text-xs text-slate-400">
					<p>Showing {props.watchTargets.paginatedWatchTargetRows().length} of {props.watchTargets.totalItems()} filtered</p>
					<p>Page {props.watchTargets.targetsPage()} of {props.watchTargets.totalPages()}</p>
				</div>
				<Show when={props.watchTargets.totalItems()} fallback={<EmptyState title="No watch targets match the current filters" description="Try clearing the search or selecting another resolution." />}>
					<For each={props.watchTargets.paginatedWatchTargetRows()}>
						{(row) => {
							const rowKey = row.target.folderPath
							const isExpanded = () => expandedRows()[rowKey] ?? false

							return (
								<div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
									<div class="flex items-center justify-between gap-4">
										<div class="flex-1 min-w-0">
											<div class="flex items-center gap-2">
												<p class="font-medium text-white">{row.target.folderName}</p>
												<Show when={(row.fingerprintCombos?.length ?? 0) > 1}>
													<button
														type="button"
														class="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-white/10 transition"
														onClick={() => setExpandedRows((prev) => ({ ...prev, [rowKey]: !isExpanded() }))}
													>
														<span class="text-xs text-slate-400">{isExpanded() ? '▼' : '▶'}</span>
													</button>
												</Show>
											</div>
											<p class="hidden mt-1 text-xs text-slate-400">{row.target.normalizedKey}</p>
											<Show when={(row.fingerprintCombos?.length ?? 0) === 1}>
												<p class="mt-1 text-xs text-slate-300">
													<span class="text-slate-500">{row.rootName}</span>
													<span class="text-slate-400">{' / '}</span>
													<Show when={row.fingerprintCombos?.[0]}>
														{(combo) => (
															<span class="text-slate-300">
																{combo().source ?? 'no-source'} {combo().episodeTag ? `/ ${combo().episodeTag}` : ''} / {combo().isMultisub ? 'multisub' : 'mono'} · {combo().count} ep{combo().count !== 1 ? 's' : ''} {combo().minEpisode && combo().maxEpisode ? `(${combo().minEpisode}–${combo().maxEpisode})` : ''}
															</span>
														)}
													</Show>
												</p>
											</Show>
											<Show when={(row.fingerprintCombos?.length ?? 0) !== 1}>
												<p class="mt-1 text-xs">
													<span class="text-slate-500">{row.rootName}</span>
													<span class="text-slate-400">{' / '}{row.matchingFilesCount ?? 0} files</span>
													<Show when={(row.fingerprintCombos?.length ?? 0) > 1}>
														<span class="text-slate-400">{' · '}{row.fingerprintCombos?.length ?? 0} combos</span>
													</Show>
												</p>
											</Show>
											<Show when={isExpanded() && (row.fingerprintCombos?.length ?? 0) > 1}>
												<div class="mt-3 space-y-2">
													<For each={row.fingerprintCombos ?? []}>
														{(combo) => (
															<div class="text-xs text-slate-300 bg-white/5 rounded px-2 py-1.5">
																<div class="font-medium">
																	{combo.source ?? 'no-source'} {combo.episodeTag ? `/ ${combo.episodeTag}` : ''} / {combo.isMultisub ? 'multisub' : 'mono'}
																</div>
																<div class="text-slate-400">
																	{combo.count} episode{combo.count !== 1 ? 's' : ''} {combo.minEpisode && combo.maxEpisode ? `(${combo.minEpisode}–${combo.maxEpisode})` : ''}
																</div>
															</div>
														)}
													</For>
												</div>
											</Show>
										</div>
										<span class="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
											{row.target.resolution}
										</span>
									</div>
								</div>
							)
						}}
					</For>
					<div class="mt-2 flex flex-wrap justify-end gap-2">
						<ActionButton label="Previous" onClick={props.watchTargets.goPreviousPage} compact disabled={props.watchTargets.targetsPage() <= 1} />
						<ActionButton label="Next" onClick={props.watchTargets.goNextPage} compact disabled={props.watchTargets.targetsPage() >= props.watchTargets.totalPages()} />
					</div>
				</Show>
				</Show>
			</div>
			</Show>
		</section>
	)
}
