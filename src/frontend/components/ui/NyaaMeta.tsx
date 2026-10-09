import { Show } from 'solid-js'
import { cachedDetailIds, openTorrentDetails } from '../../hooks/useTorrentDetails'

interface NyaaMetaProps {
	torrentId: string
	category?: string
	sizeText?: string
}

// Details button (opens the modal, which also links to Nyaa) + list info (category, size) shown next to every torrent.
export default function NyaaMeta(props: NyaaMetaProps) {
	const cached = () => cachedDetailIds().has(props.torrentId)
	return (
		<span class="inline-flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
			<button
				type="button"
				onClick={() => openTorrentDetails(props.torrentId)}
				title={cached() ? 'Details saved — open' : 'Details not downloaded yet — open to fetch'}
				class={`rounded-full border px-2 py-0.5 transition hover:border-sky-300/50 hover:text-white ${cached() ? 'border-sky-300/30 bg-sky-300/10 text-sky-200' : 'border-white/10 bg-white/5 text-slate-300'}`}
			>
				{cached() ? '📖' : '🔍'} #{props.torrentId}
			</button>
			<Show when={props.category}><span>· {props.category}</span></Show>
			<Show when={props.sizeText}><span>· {props.sizeText}</span></Show>
		</span>
	)
}
