import { Show } from 'solid-js'

export interface BlacklistConfirmState {
	torrentId: string
	series: string
	resolution: string
	title: string
}

interface BlacklistConfirmModalProps {
	state: BlacklistConfirmState
	pending: boolean
	error?: string
	onConfirm: () => void
	onCancel: () => void
}

export default function BlacklistConfirmModal(props: BlacklistConfirmModalProps) {
	return (
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
			<div class="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-black/40">
				<h2 class="text-base font-semibold text-white">Bloquear série + resolução</h2>
				<p class="mt-1 text-sm text-slate-400">Novos episódios nessa resolução deixarão de ser baixados automaticamente.</p>
				<p class="mt-2 break-words text-xs font-medium text-slate-300">{props.state.title}</p>

				<div class="mt-5 space-y-4">
					<div>
						<label class="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">Bloqueio</label>
						<div class="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
							<span class="break-all text-sm text-slate-100">{props.state.series}</span>
							<span class="rounded-full border border-cyan-300/35 bg-cyan-300/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-100">
								{props.state.resolution}
							</span>
						</div>
					</div>

					<ul class="space-y-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
						<li>• Episódios futuros nessa resolução serão classificados como <span class="text-rose-200">blocked</span>.</li>
						<li>• Itens pendentes que casam esse bloqueio saem da fila.</li>
						<li>• Downloads já enviados ao qBittorrent <span class="text-slate-100">não</span> são removidos.</li>
						<li>• Outras resoluções da mesma série continuam normais.</li>
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
						onClick={props.onConfirm}
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
