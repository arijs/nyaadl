import { For, Show } from 'solid-js'
import { parseReleaseTitle, releaseTagLabels } from '../../../shared/releaseTitle'
import type { ReleaseTagKey } from '../../../shared/releaseTitle'

interface ReleaseTagsProps {
	title: string
}

const chipClass = 'rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300'

// What the title parser understood of a release: group, both titles, episode and tags.
export default function ReleaseTags(props: ReleaseTagsProps) {
	const parsed = () => parseReleaseTitle(props.title)
	const episode = () => {
		const release = parsed()
		if (!release) return undefined
		if (release.batch) return 'batch'
		const season = release.season ? `S${String(release.season).padStart(2, '0')}` : ''
		return release.episode ? `${season}E${release.episode}${release.version ?? ''}` : season || undefined
	}
	return (
		<Show when={parsed()}>
			{(release) => (
				<div class="mt-1 flex flex-wrap items-center gap-1">
					<span class="rounded-full border border-violet-300/30 bg-violet-300/10 px-2 py-0.5 text-[10px] font-medium text-violet-100">{release().group}</span>
					<Show when={release().englishTitle}><span class={chipClass} title="English title">EN: {release().englishTitle}</span></Show>
					<Show when={release().romajiTitle}><span class={chipClass} title="Romaji title">RO: {release().romajiTitle}</span></Show>
					<Show when={episode()}><span class={chipClass}>{episode()}</span></Show>
					<Show when={release().episodeTitle}><span class={`${chipClass} italic`}>“{release().episodeTitle}”</span></Show>
					<For each={Object.entries(release().tags)}>
						{([key, value]) => <span class={chipClass} title={releaseTagLabels[key as ReleaseTagKey]}>{value}</span>}
					</For>
				</div>
			)}
		</Show>
	)
}
