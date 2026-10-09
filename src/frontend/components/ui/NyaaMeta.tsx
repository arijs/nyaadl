import { Show } from 'solid-js'
import { cachedDetailIds, openTorrentDetails } from '../../hooks/useTorrentDetails'

interface NyaaMetaProps {
	torrentId: string
	category?: string
	sizeText?: string
}

// Details button + Nyaa link + list info (category, size) shown next to every torrent.
export default function NyaaMeta(props: NyaaMetaProps) {
	const cached = () => cachedDetailIds().has(props.torrentId)
	return (
		<span class="inline-flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
			<button
				type="button"
				onClick={() => openTorrentDetails(props.torrentId)}
				title={cached() ? 'Details saved — open' : 'Details not downloaded yet — open to fetch'}
				aria-label={`Torrent ${props.torrentId} details`}
				class={`text-sm leading-none transition hover:text-white ${cached() ? 'text-emerald-300' : 'text-slate-500'}`}
			>
				ⓘ
			</button>
			<a href={`https://nyaa.si/view/${props.torrentId}`} target="_blank" rel="noopener noreferrer" class="text-sky-300 hover:underline">nyaa #{props.torrentId} ↗</a>
			<Show when={props.category}><span>· {props.category}</span></Show>
			<Show when={props.sizeText}><span>· {props.sizeText}</span></Show>
		</span>
	)
}
