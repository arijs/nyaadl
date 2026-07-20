import { For, Show } from 'solid-js'
import type { WatchTargetsIssue } from '../../../shared/types'

interface WatchTargetsIssueModalProps {
	issue: WatchTargetsIssue
	onClose: () => void
}

const TITLES: Record<WatchTargetsIssue['kind'], string> = {
	no_roots_configured: 'Nenhuma pasta de watch configurada',
	roots_offline: 'Pastas de watch offline ou inacessíveis',
	no_series_found: 'Nenhuma série encontrada nas pastas de watch',
}

const DESCRIPTIONS: Record<WatchTargetsIssue['kind'], string> = {
	no_roots_configured: 'O scan não tem onde procurar. Cadastre ao menos uma pasta raiz de watch antes de escanear.',
	roots_offline:
		'As pastas raiz abaixo não puderam ser lidas. Provavelmente o drive está offline ou desconectado — reconecte-o e tente novamente.',
	no_series_found: 'As pastas raiz estão acessíveis, mas nenhuma subpasta de série foi encontrada dentro delas.',
}

export default function WatchTargetsIssueModal(props: WatchTargetsIssueModalProps) {
	return (
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
			<div class="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-black/40">
				<div class="flex items-start gap-3">
					<span class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/12 text-lg text-amber-200">
						⚠
					</span>
					<div class="min-w-0">
						<h2 class="text-base font-semibold text-white">{TITLES[props.issue.kind]}</h2>
						<p class="mt-1 text-sm text-slate-400">{DESCRIPTIONS[props.issue.kind]}</p>
					</div>
				</div>

				<Show when={props.issue.offlineRoots.length > 0}>
					<ul class="mt-4 space-y-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
						<For each={props.issue.offlineRoots}>
							{(root) => <li class="break-all">• <span class="text-rose-200">{root}</span></li>}
						</For>
					</ul>
				</Show>

				<Show when={props.issue.kind === 'no_roots_configured'}>
					<p class="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
						Use a seção <span class="text-slate-100">Watched roots</span> para adicionar as pastas onde suas séries ficam salvas.
					</p>
				</Show>

				<div class="mt-5 flex justify-end">
					<button
						type="button"
						onClick={props.onClose}
						class="rounded-full bg-sky-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-400"
					>
						Entendi
					</button>
				</div>
			</div>
		</div>
	)
}
