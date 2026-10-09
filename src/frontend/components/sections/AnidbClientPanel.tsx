import { createSignal, Show } from 'solid-js'
import type { AnidbClientStatus } from '../../../shared/types'
import ActionButton from '../ui/ActionButton'

interface AnidbClientPanelProps {
	status?: AnidbClientStatus
	onSave: (client: { client: string; clientver: string }) => Promise<void>
}

const inputClass = 'rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-amber-300/40'

export default function AnidbClientPanel(props: AnidbClientPanelProps) {
	const [client, setClient] = createSignal('')
	const [clientver, setClientver] = createSignal('')
	const [error, setError] = createSignal('')
	// Collapsed by default: the status line stays visible, the instructions and form only when expanded.
	const [collapsed, setCollapsed] = createSignal(true)

	async function save() {
		setError('')
		try {
			await props.onSave({ client: client(), clientver: clientver() })
			setClient('')
			setClientver('')
		} catch (saveError) {
			setError(saveError instanceof Error ? saveError.message : String(saveError))
		}
	}

	return (
		<div class="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
			<div class="flex items-center justify-between gap-3">
				<p class="font-medium text-white">AniDB HTTP API client</p>
				<button
					type="button"
					class="rounded-full border border-slate-300/30 bg-slate-300/10 px-2 py-0.5 text-xs text-slate-100"
					onClick={() => setCollapsed((current) => !current)}
				>
					{collapsed() ? 'Expand' : 'Collapse'}
				</button>
			</div>
			<p class={`mt-1 text-xs ${props.status?.configured ? 'text-emerald-300' : 'text-slate-400'}`}>
				{props.status?.configured ? `Using client "${props.status.client}" v${props.status.clientver}.` : 'Not configured — the AniDB tab stays empty.'}
			</p>
			<Show when={!collapsed()}>
				<p class="mt-2 text-xs text-slate-400">
					Register an HTTP API client (any name, version 1) on AniDB while logged in — see{' '}
					<a href="https://wiki.anidb.net/HTTP_API_Definition" target="_blank" rel="noopener noreferrer" class="text-sky-300 hover:underline">the API wiki ↗</a>
					{' '}— then save it here. AniDB allows one request every 2 seconds; details are fetched only when you open the tab.
				</p>
				<div class="mt-3 grid gap-2 sm:grid-cols-[1fr_8rem]">
					<input type="text" value={client()} onInput={(event) => setClient(event.currentTarget.value)} placeholder="client name" class={inputClass} />
					<input type="text" inputmode="numeric" value={clientver()} onInput={(event) => setClientver(event.currentTarget.value)} placeholder="version" class={inputClass} />
				</div>
				<Show when={error()}>
					<p class="mt-2 text-xs text-rose-300">{error()}</p>
				</Show>
				<div class="mt-2 flex flex-wrap gap-2">
					<ActionButton label="Save AniDB client" onClick={save} disabled={!client().trim() || !clientver().trim()} compact />
				</div>
			</Show>
		</div>
	)
}
