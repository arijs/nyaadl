import { createSignal, For, Show } from 'solid-js'
import { parseReleaseTitle, releaseIdentityTitle, releaseTagLabels } from '../../../shared/releaseTitle'
import type { ReleaseTagKey, ReleaseTags } from '../../../shared/releaseTitle'
import NyaaMeta from './NyaaMeta'

export interface BlacklistConfirmState {
	torrentId: string
	series: string
	resolution: string
	title: string
	// Blocks through another endpoint (e.g. the pending queue); the history posts /api/blacklist by default.
	submit?: (tags: ReleaseTags) => Promise<void>
}

interface BlacklistConfirmModalProps {
	state: BlacklistConfirmState
	pending: boolean
	error?: string
	onConfirm: (tags: ReleaseTags) => void
	onCancel: () => void
}

export default function BlacklistConfirmModal(props: BlacklistConfirmModalProps) {
	const parsed = () => parseReleaseTitle(props.state.title)
	const tagEntries = () => Object.entries(parsed()?.tags ?? {}) as Array<[ReleaseTagKey, string]>
	// Parsed groups are keyed "[group] title" by the backend; show that instead of the stored series text.
	const series = () => {
		const release = parsed()
		const title = release && release.group !== 'Erai-raws' ? releaseIdentityTitle(release, release.englishTitle ? 'english' : 'romaji') : undefined
		return release && title ? `[${release.group}] ${title}` : props.state.series
	}
	const [selected, setSelected] = createSignal<ReleaseTagKey[]>([])
	const selectedTags = (): ReleaseTags => Object.fromEntries(tagEntries().filter(([key]) => selected().includes(key)))
	function toggle(key: ReleaseTagKey) {
		setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
	}

	return (
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
			<div class="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-black/40">
				<h2 class="text-base font-semibold text-white">{selected().length > 0 ? 'Bloquear variante' : 'Bloquear série + resolução'}</h2>
				<p class="mt-1 text-sm text-slate-400">Novos episódios nessa resolução deixarão de ser baixados automaticamente.</p>
				<p class="mt-2 break-words text-xs font-medium text-slate-300">{props.state.title}</p>
				<NyaaMeta torrentId={props.state.torrentId} />

				<div class="mt-5 space-y-4">
					<div>
						<label class="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">Bloqueio</label>
						<div class="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
							<span class="break-all text-sm text-slate-100">{series()}</span>
							<span class="rounded-full border border-cyan-300/35 bg-cyan-300/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-100">
								{props.state.resolution}
							</span>
						</div>
					</div>

					<Show when={tagEntries().length > 0}>
						<div>
							<label class="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">Só esta variante (opcional)</label>
							<div class="flex flex-wrap gap-2">
								<For each={tagEntries()}>
									{([key, value]) => (
										<label class={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${selected().includes(key) ? 'border-rose-400/40 bg-rose-400/15 text-rose-100' : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'}`}>
											<input type="checkbox" class="accent-rose-400" checked={selected().includes(key)} onChange={() => toggle(key)} />
											<span class="text-slate-400">{releaseTagLabels[key]}:</span> {value}
										</label>
									)}
								</For>
							</div>
						</div>
					</Show>

					<ul class="space-y-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
						<li>• Episódios futuros nessa resolução serão classificados como <span class="text-rose-200">blocked</span>.</li>
						<li>• Itens pendentes que casam esse bloqueio saem da fila.</li>
						<li>• Downloads já enviados ao qBittorrent <span class="text-slate-100">não</span> são removidos.</li>
						<li>• Outras resoluções da mesma série continuam normais.</li>
						<li>• Com tags marcadas, só torrents que tenham <span class="text-slate-100">todas</span> essas tags são bloqueados.</li>
					</ul>

					<Show when={props.error}>
						<p class="rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">{props.error}</p>
					</Show>
				</div>

				<div class="mt-5 flex justify-end gap-2">
					<button
						type="button"
						onClick={props.onCancel}
						disabled={props.pending}
						class="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-slate-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
					>
						Cancelar
					</button>
					<button
						type="button"
						onClick={() => props.onConfirm(selectedTags())}
						disabled={props.pending}
						class="rounded-full bg-rose-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
					>
						{props.pending ? 'Bloqueando...' : 'Bloquear'}
					</button>
				</div>
			</div>
		</div>
	)
}
