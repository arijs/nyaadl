import { createEffect, createSignal, For, Show } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { StatusResponse } from '../../../shared/api'
import type { useBootstrapWorkflow } from '../../hooks/useBootstrapWorkflow'
import type { useDashboardActions } from '../../hooks/useDashboardActions'
import ActionButton from '../ui/ActionButton'

interface ExecutionStateSectionProps {
	status: Accessor<StatusResponse | undefined>
	bootstrapWorkflow: ReturnType<typeof useBootstrapWorkflow>
	dashboardActions: ReturnType<typeof useDashboardActions>
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

export default function ExecutionStateSection(props: ExecutionStateSectionProps) {
	const [showAllApproved, setShowAllApproved] = createSignal(false)
	const [showAllRejected, setShowAllRejected] = createSignal(false)
	const [showAllAlreadyDownloaded, setShowAllAlreadyDownloaded] = createSignal(false)
	const [showAllBackfilled, setShowAllBackfilled] = createSignal(false)
	const [qbBaseUrl, setQbBaseUrl] = createSignal('')
	const [qbUsername, setQbUsername] = createSignal('')
	const [qbPassword, setQbPassword] = createSignal('')
	const bootstrapErrorParts = () => splitErrorMessage(props.bootstrapWorkflow.bootstrapMessage())

	const [collapsed, setCollapsed] = createSignal(false)

	createEffect(() => {
		const config = props.status()?.data.qbittorrentConfig
		if (!config) {
			return
		}
		if (!qbBaseUrl()) {
			setQbBaseUrl(config.baseUrl)
		}
		if (!qbUsername()) {
			setQbUsername(config.username)
		}
	})

	return (
		<section class="rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-lg shadow-black/20">
			<div class="flex items-center justify-between mb-2">
				<h2 class="text-lg font-semibold text-white">Execution state</h2>
				<button
					type="button"
					class="rounded-full border border-slate-300/30 bg-slate-300/10 px-2 py-0.5 text-xs text-slate-100 ml-2"
					onClick={() => setCollapsed((c) => !c)}
				>
					{collapsed() ? 'Expand' : 'Collapse'}
				</button>
			</div>
			<Show when={!collapsed()}>
				<div class="mt-4 space-y-3 text-sm text-slate-300">
					<p>Backend: running on localhost:8787</p>
					<p>Client: Vite + Solid + Tailwind</p>
					<div style="display: none;">
						<p>Checkpoint mode: {props.status()?.data.status.lastProcessed?.bootstrapMode ?? 'assisted'}</p>
						<p>Next pages: {props.status()?.data.status.nextPages.length ? props.status()?.data.status.nextPages.join(', ') : 'n/a'}</p>
					</div>
				</div>
				<div class="mt-5 flex flex-wrap gap-3">
					<ActionButton label="Export today's report" onClick={props.dashboardActions.exportReportForToday} />
				</div>
				<Show when={props.status()?.data.qbittorrentFailures.length}>
					<div class="mt-5 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
						<div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
							<div>
								<p class="font-medium text-white">qBittorrent submission recovery</p>
								<p class="mt-1 text-xs text-rose-100/80">
									Failed submissions stay in the backend retry queue; the backend retries the exact torrent file and destination folder, without needing the frontend to resend page/item indexes.
								</p>
							</div>
							<div class="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs text-rose-100/90">
								<p>Base URL: {props.status()?.data.qbittorrentConfig.baseUrl}</p>
								<p>User: {props.status()?.data.qbittorrentConfig.username}</p>
							</div>
						</div>
						<div class="mt-4 grid gap-3 md:grid-cols-3">
							<input
								type="text"
								value={qbBaseUrl()}
								onInput={(event) => setQbBaseUrl(event.currentTarget.value)}
								placeholder="http://localhost:7055"
								class="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-amber-300/40"
							/>
							<input
								type="text"
								value={qbUsername()}
								onInput={(event) => setQbUsername(event.currentTarget.value)}
								placeholder="qBittorrent username"
								class="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-amber-300/40"
							/>
							<input
								type="password"
								value={qbPassword()}
								onInput={(event) => setQbPassword(event.currentTarget.value)}
								placeholder="qBittorrent password"
								class="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-amber-300/40"
							/>
						</div>
						<div class="mt-3 flex flex-wrap gap-2">
							<ActionButton
								label="Save qBittorrent settings"
								onClick={() => props.dashboardActions.saveQbittorrentConfig({ baseUrl: qbBaseUrl(), username: qbUsername(), password: qbPassword() })}
								compact
							/>
						</div>
						<div class="mt-4 space-y-3">
							<For each={props.status()?.data.qbittorrentFailures ?? []}>
								{(failure) => {
									const failureMessage = splitErrorMessage(failure.errorMessage)
									return (
									<div class="rounded-2xl border border-white/10 bg-black/10 p-4">
										<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
											<div class="min-w-0">
												<div class="flex flex-wrap items-center gap-2">
													<p class="truncate font-medium text-white">{failure.item.title}</p>
													<span class="rounded-full border border-slate-300/30 bg-slate-300/10 px-2 py-0.5 text-[11px] text-slate-100">
														ID {failure.torrentId}
													</span>
												</div>
												<p class="mt-1 text-xs text-slate-300">page {failure.item.page} · target {failure.targetFolderPath}</p>
												<p class="mt-2 text-xs text-rose-100">{failureMessage.main}</p>
												<Show when={failureMessage.context}>
													<p class="mt-1 text-[11px] text-rose-100/90">{failureMessage.context}</p>
												</Show>
												<Show when={failure.errorKind === 'timeout' || failure.errorKind === 'unreachable'}>
													<p class="mt-1 text-xs text-amber-100">Verify that qBittorrent is running and that the Web UI base URL above is correct.</p>
												</Show>
												<Show when={failure.suggestion}>
													<p class="mt-1 text-xs text-slate-300">{failure.suggestion}</p>
												</Show>
											</div>
											<div class="flex flex-wrap gap-2">
												<ActionButton
													label="Retry add to qBittorrent"
													onClick={() => props.dashboardActions.retryQbittorrentFailure(failure.torrentId, { baseUrl: qbBaseUrl(), username: qbUsername(), password: qbPassword() })}
													compact
												/>
												<ActionButton
													label="Do not add torrent to queue"
													onClick={() => props.dashboardActions.suppressQbittorrentFailure(failure.torrentId)}
													compact
												/>
											</div>
										</div>
									</div>
									)
								}}
							</For>
						</div>
					</div>
				</Show>
				<div class="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
					<Show when={props.status()?.data.status.lastProcessed} fallback={<p>No checkpoint yet.</p>}>
						{(lastProcessed) => (
							<div class="space-y-1">
								<p>Last torrent: {lastProcessed().lastTorrentId ?? 'n/a'}</p>
								<p>Last page: {lastProcessed().lastSeenPage ?? 'n/a'}</p>
								<p class="hidden">Mode: {lastProcessed().bootstrapMode}</p>
								<p>Last run at: {lastProcessed().lastRunAt ?? 'n/a'}</p>
							</div>
						)}
					</Show>
				</div>
				<Show when={props.bootstrapWorkflow.bootstrapMessage()}>
					<div class="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
						<p>{bootstrapErrorParts().main}</p>
						<Show when={bootstrapErrorParts().context}>
							<p class="mt-1 text-xs text-rose-100/90">{bootstrapErrorParts().context}</p>
						</Show>
					</div>
				</Show>
				<Show when={props.bootstrapWorkflow.bootstrapRetryPage()}>
					<div class="mt-3">
						<ActionButton label="Retry this page" onClick={props.bootstrapWorkflow.retryBootstrapCurrentPage} />
					</div>
				</Show>
			</Show>
		</section>
	)
}
