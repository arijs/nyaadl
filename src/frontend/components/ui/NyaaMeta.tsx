import { Show } from 'solid-js'

interface NyaaMetaProps {
	torrentId: string
	category?: string
	sizeText?: string
}

// Nyaa link + list info (category, size) shown next to every torrent.
export default function NyaaMeta(props: NyaaMetaProps) {
	return (
		<span class="inline-flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
			<a href={`https://nyaa.si/view/${props.torrentId}`} target="_blank" rel="noopener noreferrer" class="text-sky-300 hover:underline">nyaa #{props.torrentId} ↗</a>
			<Show when={props.category}><span>· {props.category}</span></Show>
			<Show when={props.sizeText}><span>· {props.sizeText}</span></Show>
		</span>
	)
}
