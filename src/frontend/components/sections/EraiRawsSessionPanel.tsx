import { createSignal, Show } from 'solid-js'
import type { EraiRawsStatus } from '../../../shared/types'
import ActionButton from '../ui/ActionButton'

interface EraiRawsSessionPanelProps {
	status?: EraiRawsStatus
	onSave: (session: { cookie: string; userAgent: string }) => Promise<void>
}

function describe(status: EraiRawsStatus | undefined): string {
	if (!status?.configured) {
		return 'Not configured — erai-raws series pages are skipped.'
	}
	if (status.status === 'ok') {
		return `Logged in${status.loggedInAs ? ` as ${status.loggedInAs}` : ''}.`
	}
	if (status.status === 'expired') {
		return 'Session expired — paste a fresh cookie.'
	}
	return 'Cookie saved, not tested yet.'
}

export default function EraiRawsSessionPanel(props: EraiRawsSessionPanelProps) {
	const [cookie, setCookie] = createSignal('')
	const [error, setError] = createSignal('')
	// Collapsed by default: the status line stays visible, the instructions and form only when expanded.
	const [collapsed, setCollapsed] = createSignal(true)

	async function save() {
		setError('')
		try {
			// The backend replays the cookie with this browser's UA: DDoS-Guard ties the two together.
			await props.onSave({ cookie: cookie(), userAgent: navigator.userAgent })
			setCookie('')
		} catch (saveError) {
			setError(saveError instanceof Error ? saveError.message : String(saveError))
		}
	}

	return (
		<div class="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
			<div class="flex items-center justify-between gap-3">
				<p class="font-medium text-white">erai-raws.info session</p>
				<button
					type="button"
					class="rounded-full border border-slate-300/30 bg-slate-300/10 px-2 py-0.5 text-xs text-slate-100"
					onClick={() => setCollapsed((current) => !current)}
				>
					{collapsed() ? 'Expand' : 'Collapse'}
				</button>
			</div>
			<p class={`mt-1 text-xs ${props.status?.status === 'ok' ? 'text-emerald-300' : props.status?.status === 'expired' ? 'text-rose-300' : 'text-slate-400'}`}>
				{describe(props.status)}
			</p>
			<Show when={!collapsed()}>
				<ol class="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-slate-400">
					<li>Open erai-raws.info logged in, in this browser.</li>
					<li>DevTools → Network → reload → click the page document.</li>
					<li>Request Headers → copy the whole <code>Cookie</code> value and paste it below.</li>
				</ol>
				<textarea
					value={cookie()}
					onInput={(event) => setCookie(event.currentTarget.value)}
					rows={3}
					placeholder="wordpress_logged_in_…=…; __ddg1_=…"
					class="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-amber-300/40"
				/>
				<Show when={error()}>
					<p class="mt-2 text-xs text-rose-300">{error()}</p>
				</Show>
				<div class="mt-2 flex flex-wrap gap-2">
					<ActionButton label="Save and test" onClick={save} disabled={!cookie().trim()} compact />
				</div>
			</Show>
		</div>
	)
}
