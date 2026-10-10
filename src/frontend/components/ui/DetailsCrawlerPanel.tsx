import { createEffect, createResource, createSignal, For, on, onCleanup, Show } from 'solid-js'
import type { DetailsCrawlerSource, DetailsCrawlerStatus, DetailsCrawlerStepResult } from '../../../shared/api'
import { getJson, postJson } from '../../lib/httpClient'
import { loadCachedDetailIds } from '../../hooks/useTorrentDetails'
import ActionButton from './ActionButton'
import NyaaMeta from './NyaaMeta'

const sources: Array<{ id: DetailsCrawlerSource; label: string }> = [
	{ id: 'nyaa', label: 'Nyaa' },
	{ id: 'erai', label: 'Erai-raws' },
	{ id: 'mal', label: 'MAL' },
	{ id: 'anidb', label: 'AniDB' },
]

const stepClass: Record<DetailsCrawlerStepResult, string> = {
	fetched: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
	cached: 'border-white/10 bg-white/5 text-slate-300',
	'no-link': 'border-white/5 bg-transparent text-slate-500',
	'no-torrent': 'border-amber-400/30 bg-amber-400/10 text-amber-200',
	skipped: 'border-white/5 bg-transparent text-slate-500',
	error: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
}

const isActive = (status: DetailsCrawlerStatus | undefined) => status?.state === 'running' || status?.state === 'stopping'

function formatDuration(fromUtc: string | undefined, toMs: number): string {
	if (!fromUtc) {
		return ''
	}
	const seconds = Math.max(0, Math.round((toMs - Date.parse(fromUtc)) / 1000))
	return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

// Controls and report of the details downloader (backend service that saves Nyaa/Erai/MAL/AniDB data for the watch targets).
export default function DetailsCrawlerPanel() {
	const [collapsed, setCollapsed] = createSignal(true)
	const [actionError, setActionError] = createSignal<string>()
	const [status, { refetch, mutate }] = createResource(async () => (await getJson<DetailsCrawlerStatus>('/api/details-crawler')).data)

	// Poll while it runs.
	createEffect(() => {
		if (!isActive(status())) {
			return
		}
		const timer = setInterval(() => void refetch(), 2000)
		onCleanup(() => clearInterval(timer))
	})
	// When a run ends, refresh the 📖/🔍 markers of the Nyaa buttons.
	createEffect(on(() => status()?.state, (state, previous) => {
		if ((previous === 'running' || previous === 'stopping') && state !== 'running' && state !== 'stopping') {
			void loadCachedDetailIds()
		}
	}))

	const act = async (action: 'start' | 'stop') => {
		setActionError(undefined)
		try {
			mutate((await postJson<DetailsCrawlerStatus>(`/api/details-crawler/${action}`)).data)
		} catch (error) {
			setActionError(error instanceof Error ? error.message : `Failed to ${action} the details downloader`)
		}
	}

	return (
		<div class="border-t border-white/10 pt-4">
			<div class="flex items-center justify-between gap-3">
				<h3 class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
					Details downloader
					<Show when={status()?.state && status()?.state !== 'idle'}>
						<span class="ml-2 text-xs font-normal normal-case tracking-normal text-slate-300">({status()?.state}{isActive(status()) ? ` ${status()?.position}/${status()?.total}` : ''})</span>
					</Show>
				</h3>
				<button
					type="button"
					class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300"
					onClick={() => setCollapsed((current) => !current)}
				>
					{collapsed() ? 'Expand' : 'Collapse'}
				</button>
			</div>
			<Show when={!collapsed()}>
				<p class="mt-1 text-sm text-slate-400">
					Saves Nyaa (first file of each target), Erai-raws, MyAnimeList and AniDB data, newest season first and targets alphabetically, at most one series every 3s. Data already saved is skipped.
				</p>
				<div class="mt-3 flex flex-wrap items-center gap-2">
					<ActionButton label="Start" onClick={() => act('start')} disabled={isActive(status())} compact />
					<ActionButton label="Stop" onClick={() => act('stop')} disabled={status()?.state !== 'running'} compact />
					<Show when={actionError()}>{(error) => <span class="text-xs text-rose-300">{error()}</span>}</Show>
				</div>
				<Show when={status()?.state !== 'idle' ? status() : undefined}>
					{(current) => (
						<div class="mt-3 space-y-2 text-xs text-slate-300">
							<p>
								{current().state}
								{' · started '}{current().startedAtUtc ? new Date(current().startedAtUtc!).toLocaleTimeString() : 'n/a'}
								{' · '}{formatDuration(current().startedAtUtc, current().finishedAtUtc ? Date.parse(current().finishedAtUtc!) : Date.now())}
								{' · '}{current().position} of {current().total} targets
							</p>
							<Show when={current().current}>
								{(target) => <p class="wrap-break-word text-slate-400">Now: {target().rootName} / {target().folderName}</p>}
							</Show>
							<Show when={current().stopReason}>{(reason) => <p class="text-amber-200">{reason()}</p>}</Show>
							<div class="grid grid-cols-1 gap-1 sm:grid-cols-2">
								<For each={sources}>
									{(source) => {
										const counts = () => current().counts[source.id]
										return (
											<p>
												<span class="font-medium text-slate-200">{source.label}:</span>
												{' '}{counts().fetched} fetched · {counts().cached} saved · {counts()['no-link']} no link · {counts().error} errors
												<Show when={source.id === 'nyaa' && counts()['no-torrent'] > 0}> · {counts()['no-torrent']} no torrent</Show>
												<Show when={counts().skipped > 0 && source.id !== 'nyaa'}> · {counts().skipped} skipped</Show>
											</p>
										)
									}}
								</For>
							</div>
							<Show when={current().recent.length > 0}>
								<div class="space-y-1">
									<For each={current().recent}>
										{(entry) => (
											<div class="rounded-lg border border-white/10 bg-slate-900/40 px-2 py-1.5">
												<p class="wrap-break-word text-slate-100">
													<span class="text-slate-500">{entry.rootName} / </span>{entry.folderName}
													<span class="ml-2 text-[11px] text-slate-500">{new Date(entry.atUtc).toLocaleTimeString()}</span>
												</p>
												<div class="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
													<Show when={entry.torrentId}>{(torrentId) => <NyaaMeta torrentId={torrentId()} />}</Show>
													<For each={sources}>
														{(source) => <span class={`rounded-full border px-2 py-0.5 ${stepClass[entry.steps[source.id]]}`}>{source.label}: {entry.steps[source.id]}</span>}
													</For>
												</div>
												<Show when={entry.error}>{(error) => <p class="mt-1 wrap-break-word text-[11px] text-rose-300">{error()}</p>}</Show>
											</div>
										)}
									</For>
								</div>
							</Show>
						</div>
					)}
				</Show>
			</Show>
		</div>
	)
}
