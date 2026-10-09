import { createEffect, createMemo, createResource, createSignal, For, Match, onCleanup, onMount, Show, Switch } from 'solid-js'
import type { Accessor, JSX, Resource } from 'solid-js'
import type { AnidbDetails, EraiRawsSeriesDetails, MalDetails, SeriesSource, SeriesSourcePayload, TorrentDetailsPayload } from '../../../shared/types'
import { getJson } from '../../lib/httpClient'
import { markDetailsCached } from '../../hooks/useTorrentDetails'
import { featuredReviews, sortByReactions } from '../../lib/featuredReviews'

interface TorrentDetailsModalProps {
	torrentId: string
	onClose: () => void
}

type Tab = 'nyaa' | SeriesSource

const tabs: Array<{ id: Tab; label: string }> = [
	{ id: 'nyaa', label: 'Nyaa' },
	{ id: 'erai', label: 'Erai-raws' },
	{ id: 'mal', label: 'MyAnimeList' },
	{ id: 'anidb', label: 'AniDB' },
]

// A resource that only fetches once its source is truthy (tab opened), with a "refresh=1" re-fetch.
function lazyResource<S, T>(source: Accessor<S | false | undefined>, url: (key: S) => string): [Resource<T | undefined>, () => void] {
	let forceRefresh = false
	const [resource, { refetch }] = createResource(source, async (key) => {
		const query = forceRefresh ? '?refresh=1' : ''
		forceRefresh = false
		return (await getJson<T>(`${url(key)}${query}`)).data
	})
	return [resource, () => {
		forceRefresh = true
		void refetch()
	}]
}

// Reading an errored resource throws: use this outside the Switch that renders the error.
const settled = <T,>(resource: Resource<T | undefined>): T | undefined => (resource.error || resource.loading ? undefined : resource())

const formatDate = (iso: string | undefined) => (iso ? new Date(iso).toLocaleString() : undefined)

function Field(props: { label: string; children: JSX.Element }) {
	return (
		<div class="min-w-0">
			<dt class="text-[11px] uppercase tracking-wide text-slate-500">{props.label}</dt>
			<dd class="break-words text-sm text-slate-200">{props.children}</dd>
		</div>
	)
}

function Section(props: { title: string; action?: JSX.Element; children: JSX.Element }) {
	return (
		<section class="mt-5">
			<div class="mb-2 flex items-center justify-between gap-3">
				<h4 class="text-xs font-semibold uppercase tracking-wide text-slate-400">{props.title}</h4>
				{props.action}
			</div>
			{props.children}
		</section>
	)
}

// Opens a featured image in the modal-wide preview.
type ImagePreview = (src: string) => void

function SeriesImage(props: { slug: string; site: SeriesSource; version?: string; onPreview: ImagePreview }) {
	const [failed, setFailed] = createSignal(false)
	const src = () => `/api/series/${props.slug}/images/${props.site}?v=${encodeURIComponent(props.version ?? '')}`
	return (
		<Show when={!failed()}>
			<img
				src={src()}
				alt=""
				title="Click to preview"
				onError={() => setFailed(true)}
				onClick={() => props.onPreview(src())}
				class="w-36 shrink-0 cursor-zoom-in self-start rounded-2xl border border-white/10 object-cover transition hover:border-white/30"
			/>
		</Show>
	)
}

// Loading / error / empty states shared by every tab, plus the refresh button.
function TabState<T>(props: { resource: Resource<T | undefined>; onRefresh: () => void; fetchedAtUtc?: string; children: (data: T) => JSX.Element }) {
	return (
		<>
			<div class="mb-3 flex items-center justify-end gap-3 text-xs text-slate-500">
				<Show when={props.fetchedAtUtc}>
					<span>Saved {formatDate(props.fetchedAtUtc)}</span>
				</Show>
				<button type="button" disabled={props.resource.loading} onClick={() => props.onRefresh()} class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200 transition hover:border-amber-300/40 disabled:opacity-50">
					Refresh
				</button>
			</div>
			<Switch>
				<Match when={props.resource.loading}>
					<p class="py-10 text-center text-sm text-slate-400">Fetching…</p>
				</Match>
				<Match when={props.resource.error}>
					<p class="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
						{props.resource.error instanceof Error ? props.resource.error.message : String(props.resource.error)}
					</p>
				</Match>
				<Match when={settled(props.resource)}>
					{(data) => props.children(data())}
				</Match>
			</Switch>
		</>
	)
}

function NyaaTab(props: { detail: TorrentDetailsPayload['nyaa'] }) {
	const d = () => props.detail
	return (
		<>
			<h3 class="text-base font-semibold text-white">{d().title}</h3>
			<dl class="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
				<Field label="Category">{d().category ?? '—'}</Field>
				<Field label="Published">{formatDate(d().publishedAtUtc) ?? '—'}</Field>
				<Field label="Submitter">{d().submitter ?? '—'}{d().submitterRank ? ` (${d().submitterRank})` : ''}</Field>
				<Field label="Size">{d().sizeText ?? '—'}</Field>
				<Field label="Seeders / Leechers">{d().seeders ?? '—'} / {d().leechers ?? '—'}</Field>
				<Field label="Completed">{d().completed ?? '—'}</Field>
				<Field label="Info hash"><span class="font-mono text-xs">{d().infoHash ?? '—'}</span></Field>
				<Field label="Links">
					<span class="flex flex-wrap gap-2">
						<a href={d().url} target="_blank" rel="noopener noreferrer" class="text-sky-300 hover:underline">Nyaa ↗</a>
						<Show when={d().magnet}><a href={d().magnet} class="text-sky-300 hover:underline">Magnet</a></Show>
						<Show when={d().information}><a href={d().information} target="_blank" rel="noopener noreferrer" class="text-sky-300 hover:underline">Information ↗</a></Show>
					</span>
				</Field>
			</dl>
			<Show when={d().descriptionMarkdown}>
				<Section title="Description">
					<pre class="max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300">{d().descriptionMarkdown}</pre>
				</Section>
			</Show>
			<Section title={`Files (${d().files.length})`}>
				<ul class="max-h-48 space-y-1 overflow-auto text-xs text-slate-300">
					<For each={d().files}>{(file) => <li class="flex justify-between gap-3"><span class="break-all">{file.path}</span><span class="shrink-0 text-slate-500">{file.sizeText}</span></li>}</For>
				</ul>
			</Section>
			<Show when={d().comments.length}>
				<Section title={`Comments (${d().comments.length})`}>
					<ul class="space-y-2 text-xs">
						<For each={d().comments}>{(comment) => (
							<li class="rounded-xl border border-white/10 bg-white/5 p-2">
								<span class="font-medium text-slate-200">{comment.user}</span>
								<span class="ml-2 text-slate-500">{formatDate(comment.postedAtUtc)}</span>
								<p class="mt-1 whitespace-pre-wrap text-slate-300">{comment.text}</p>
							</li>
						)}</For>
					</ul>
				</Section>
			</Show>
		</>
	)
}

function EraiTab(props: { slug: string; details: EraiRawsSeriesDetails; onPreview: ImagePreview }) {
	const series = () => props.details.series
	return (
		<>
			<div class="flex gap-4">
				<SeriesImage slug={props.slug} site="erai" version={series().fetchedAtUtc} onPreview={props.onPreview} />
				<div class="min-w-0">
					<h3 class="text-base font-semibold text-white">{series().title}</h3>
					<p class="mt-2 whitespace-pre-wrap text-sm text-slate-300">{series().synopsis}</p>
					<div class="mt-3 flex flex-wrap gap-2 text-xs">
						<a href={series().url} target="_blank" rel="noopener noreferrer" class="text-sky-300 hover:underline">erai-raws ↗</a>
						<For each={series().links}>{(link) => <a href={link.url} target="_blank" rel="noopener noreferrer" class="text-sky-300 hover:underline">{link.label} ↗</a>}</For>
					</div>
				</div>
			</div>
			<Section title={`Latest releases (${props.details.releases.length})`}>
				<div class="overflow-x-auto">
					<table class="w-full text-left text-xs text-slate-300">
						<thead class="text-slate-500"><tr><th class="py-1 pr-2">Type</th><th class="pr-2">Release</th><th class="pr-2">Date</th><th class="pr-2">Subtitles</th><th>Variants</th></tr></thead>
						<tbody>
							<For each={props.details.releases}>{(release) => (
								<tr class="border-t border-white/5 align-top">
									<td class="py-1 pr-2" title={release.type === 'E' ? 'Encode (HEVC)' : release.type === 'A' ? 'Episode' : undefined}>{release.type}</td>
									<td class="pr-2"><a href={release.url} target="_blank" rel="noopener noreferrer" class="hover:underline">{release.title}</a></td>
									<td class="whitespace-nowrap pr-2">{release.releasedAt}</td>
									<td class="pr-2 uppercase text-slate-400">{release.subtitles.join(' ')}</td>
									<td class="whitespace-nowrap">{release.variants.map((variant) => `${variant.resolution} ${variant.sizeText ?? ''}`.trim()).join(' · ')}</td>
								</tr>
							)}</For>
						</tbody>
					</table>
				</div>
			</Section>
		</>
	)
}

// Same pill as the dashboard's section Expand/Collapse buttons, sitting top-right of what it toggles.
function PillButton(props: { label: string; onClick: () => void }) {
	return (
		<button type="button" onClick={() => props.onClick()} class="shrink-0 rounded-full border border-slate-300/30 bg-slate-300/10 px-2 py-0.5 text-[11px] text-slate-100 hover:border-slate-300/50">
			{props.label}
		</button>
	)
}

// Card with a one-line header and a text clamped to 3 lines until expanded (MAL reviews, AniDB recommendations).
function ExpandableCard(props: { header: JSX.Element; text: string }) {
	const [expanded, setExpanded] = createSignal(false)
	// ponytail: length heuristic for "is it clamped"; measure overflow if short texts ever show a useless button.
	const long = () => props.text.length > 280 || props.text.split('\n').length > 3
	return (
		<li class="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs">
			<div class="flex items-start justify-between gap-3">
				<div class="flex min-w-0 flex-wrap items-center gap-2">{props.header}</div>
				<Show when={long()}>
					<PillButton label={expanded() ? 'Collapse' : 'Expand'} onClick={() => setExpanded((current) => !current)} />
				</Show>
			</div>
			<p class={`mt-2 whitespace-pre-wrap text-slate-300 ${long() && !expanded() ? 'line-clamp-3' : ''}`}>{props.text}</p>
		</li>
	)
}

function MalTab(props: { slug: string; details: MalDetails; onPreview: ImagePreview }) {
	const d = () => props.details
	const [playing, setPlaying] = createSignal<MalDetails['videos'][number]>()
	const [showAllReviews, setShowAllReviews] = createSignal(false)
	// One review per verdict (Recommended / Mixed / Not recommended) up front; the rest behind "Show all".
	const featured = createMemo(() => featuredReviews(d().reviews ?? []))
	return (
		<>
			<div class="flex gap-4">
				<SeriesImage slug={props.slug} site="mal" version={d().fetchedAtUtc} onPreview={props.onPreview} />
				<div class="min-w-0">
					<h3 class="text-base font-semibold text-white">{d().title}</h3>
					<Show when={d().englishTitle}><p class="text-sm text-slate-400">{d().englishTitle}</p></Show>
					<div class="mt-2 flex flex-wrap gap-2 text-xs">
						<For each={[['Score', d().score], ['Ranked', d().rank], ['Popularity', d().popularity], ['Members', d().members]].filter(([, value]) => value)}>
							{([label, value]) => <span class="rounded-full border border-white/10 bg-white/5 px-2 py-0.5"><span class="text-slate-500">{label}</span> <span class="text-slate-100">{value}</span></span>}
						</For>
						<a href={d().url} target="_blank" rel="noopener noreferrer" class="text-sky-300 hover:underline">MAL ↗</a>
					</div>
					<dl class="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
						<For each={d().info}>{(entry) => <Field label={entry.label}>{entry.value}</Field>}</For>
					</dl>
				</div>
			</div>
			<Show when={d().videos.length}>
				<Section title={`Trailers (${d().videos.length})`}>
					<Show when={playing()} keyed>
						{(video) => (
							<div class="mb-3 rounded-2xl border border-white/10 bg-black/20 p-2">
								<div class="mb-2 flex items-center justify-between gap-3 px-1 text-xs">
									<span class="truncate text-slate-200">▶ {video.title}</span>
									<PillButton label="Close" onClick={() => setPlaying(undefined)} />
								</div>
								<iframe
									src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1`}
									title={video.title}
									allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
									allowfullscreen
									class="aspect-video w-full rounded-xl"
								/>
							</div>
						)}
					</Show>
					<div class="flex gap-3 overflow-x-auto pb-1">
						<For each={d().videos}>{(video) => (
							<button type="button" onClick={() => setPlaying(video)} class={`w-40 shrink-0 text-left text-xs ${playing()?.youtubeId === video.youtubeId ? 'text-amber-200' : 'text-slate-300'}`}>
								<img src={`https://i.ytimg.com/vi/${video.youtubeId}/mqdefault.jpg`} alt="" class="aspect-video w-full rounded-xl border border-white/10 object-cover" />
								<span class="mt-1 block truncate">▶ {video.title}</span>
							</button>
						)}</For>
					</div>
				</Section>
			</Show>
			<Show when={d().synopsis}>
				<Section title="Synopsis">
					<p class="whitespace-pre-wrap text-sm text-slate-300">{d().synopsis}</p>
				</Section>
			</Show>
			<Section
				title={`Reviews (${showAllReviews() ? d().reviews?.length ?? 0 : `${featured().length} of ${d().reviews?.length ?? 0}`} · first page · most reactions first)`}
				action={
					<Show when={(d().reviews?.length ?? 0) > featured().length}>
						<PillButton label={showAllReviews() ? 'Show less' : 'Show all'} onClick={() => setShowAllReviews((current) => !current)} />
					</Show>
				}
			>
				<Show when={d().reviews} fallback={<p class="text-xs text-slate-500">Saved before reviews were collected — click Refresh to fetch them.</p>}>
					<ul class="space-y-2">
						<For each={showAllReviews() ? sortByReactions(d().reviews ?? []) : featured()}>{(review) => (
							<ExpandableCard
								text={review.text}
								header={
									<>
										<Show when={review.verdict}>
											<span class={`rounded-full px-2 py-0.5 ${verdictClass(review.verdict)}`}>{review.verdict}</span>
										</Show>
										<Show when={review.score}><span class="font-semibold text-slate-100">{review.score}/10</span></Show>
										<span class="text-slate-300">{review.user}</span>
										<span class="text-slate-500">{review.postedAt}</span>
										<Show when={review.preliminary}><span class="text-amber-200/80">{review.preliminary}</span></Show>
										<Show when={review.reactions}><span class="text-slate-500">· {review.reactions} reactions</span></Show>
										<Show when={review.url}><a href={review.url} target="_blank" rel="noopener noreferrer" class="text-sky-300 hover:underline">MAL ↗</a></Show>
									</>
								}
							/>
						)}</For>
					</ul>
				</Show>
			</Section>
		</>
	)
}

function verdictClass(verdict: string | undefined): string {
	if (/not recommended/i.test(verdict ?? '')) {
		return 'bg-rose-400/15 text-rose-200'
	}
	return /mixed/i.test(verdict ?? '') ? 'bg-amber-400/15 text-amber-200' : 'bg-emerald-400/15 text-emerald-200'
}

// AniDB's own names for its rating kinds (as on the anime page).
const anidbRatingLabels: Record<string, string> = { permanent: 'Rating', temporary: 'Average', review: 'Review rating' }

function AnidbTab(props: { slug: string; details: AnidbDetails; onPreview: ImagePreview }) {
	const d = () => props.details
	const mainTitle = () => d().titles.find((title) => title.type === 'main')?.title ?? d().titles[0]?.title ?? `AniDB ${d().aid}`
	return (
		<>
			<div class="flex gap-4">
				<SeriesImage slug={props.slug} site="anidb" version={d().fetchedAtUtc} onPreview={props.onPreview} />
				<div class="min-w-0">
					<h3 class="text-base font-semibold text-white">{mainTitle()}</h3>
					<p class="text-xs text-slate-400">
						{d().titles.filter((title) => title.type === 'official' || title.type === 'synonym').map((title) => `${title.title} (${title.lang})`).join(' · ')}
					</p>
					<dl class="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
						<Field label="Type">{d().type ?? '—'}</Field>
						<Field label="Episodes">{d().episodeCount ?? '—'}</Field>
						<Field label="Aired">{d().startDate ?? '?'} → {d().endDate ?? '?'}</Field>
						<Show when={d().season}><Field label="Season">{d().season}</Field></Show>
						<For each={d().ratings}>{(rating) => <Field label={anidbRatingLabels[rating.kind] ?? rating.kind}>{rating.value}{rating.count ? ` (${rating.count})` : ''}</Field>}</For>
					</dl>
					<div class="mt-3 flex flex-wrap gap-1.5 text-[11px]">
						<For each={d().tags}>{(tag) => <span title={tag.description} class="cursor-help rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-300">{tag.name}</span>}</For>
					</div>
					<div class="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
						<a href={d().url} target="_blank" rel="noopener noreferrer" class="text-sky-300 hover:underline">AniDB ↗</a>
						<For each={d().resources ?? []}>{(resource) => <a href={resource.url} target="_blank" rel="noopener noreferrer" class="text-sky-300 hover:underline">{resource.label} ↗</a>}</For>
					</div>
				</div>
			</div>
			<Show when={d().description}>
				<Section title="Description">
					<p class="whitespace-pre-wrap text-sm text-slate-300">{d().description}</p>
				</Section>
			</Show>
			<Show when={d().recommendations?.length}>
				<Section title={`Recommendations (${d().recommendations?.length})`}>
					<ul class="space-y-2 text-xs">
						<For each={d().recommendations}>{(recommendation) => (
							<ExpandableCard
								text={recommendation.text}
								header={<span class="rounded-full bg-emerald-400/15 px-2 py-0.5 text-emerald-200">{recommendation.type}</span>}
							/>
						)}</For>
					</ul>
				</Section>
			</Show>
			<Show when={d().episodes?.length}>
				<Section title={`Episodes (${d().episodes?.length})`}>
					<table class="w-full text-left text-xs text-slate-300">
						<thead class="text-slate-500"><tr><th class="py-1 pr-2">#</th><th class="pr-2">Title</th><th class="pr-2">Aired</th><th class="pr-2">Min</th><th>Rating</th></tr></thead>
						<tbody>
							<For each={d().episodes}>{(episode) => {
								const [expanded, setExpanded] = createSignal(false)
								return (
									<tr class="border-t border-white/5 align-top">
										<td class="py-1 pr-2">{episode.number}</td>
										<td class="py-1 pr-2">
											<div class="flex items-start justify-between gap-3">
												<span>{episode.title}</span>
												<Show when={episode.summary}>
													<PillButton label={expanded() ? 'Collapse' : 'Summary'} onClick={() => setExpanded((current) => !current)} />
												</Show>
											</div>
											<Show when={expanded()}>
												<p class="mt-1 whitespace-pre-wrap text-slate-400">{episode.summary}</p>
											</Show>
										</td>
										<td class="whitespace-nowrap py-1 pr-2">{episode.airDate}</td>
										<td class="py-1 pr-2">{episode.lengthMinutes}</td>
										<td class="py-1">{episode.rating}</td>
									</tr>
								)
							}}</For>
						</tbody>
					</table>
				</Section>
			</Show>
			<Show when={d().creators?.length}>
				<Section title="Staff">
					<dl class="grid grid-cols-2 gap-2 md:grid-cols-3">
						<For each={d().creators}>{(creator) => <Field label={creator.role}>{creator.name}</Field>}</For>
					</dl>
				</Section>
			</Show>
			<Show when={d().characters?.length}>
				<Section title="Characters">
					<dl class="grid grid-cols-2 gap-2 md:grid-cols-3">
						<For each={d().characters}>{(character) => <Field label={character.role}>{character.name}{character.seiyuu ? ` — ${character.seiyuu}` : ''}</Field>}</For>
					</dl>
				</Section>
			</Show>
			<Show when={d().related?.length}>
				<Section title="Related anime">
					<ul class="space-y-1 text-xs">
						<For each={d().related}>{(anime) => (
							<li><span class="text-slate-500">{anime.relation}:</span> <a href={`https://anidb.net/anime/${anime.aid}`} target="_blank" rel="noopener noreferrer" class="text-sky-300 hover:underline">{anime.title} ↗</a></li>
						)}</For>
					</ul>
				</Section>
			</Show>
		</>
	)
}

function MissingLink(props: { reason?: string }) {
	return <p class="py-10 text-center text-sm text-slate-400">{props.reason ?? 'Nothing to show.'}</p>
}

export default function TorrentDetailsModal(props: TorrentDetailsModalProps) {
	const [tab, setTab] = createSignal<Tab>('nyaa')
	const [opened, setOpened] = createSignal<ReadonlySet<Tab>>(new Set<Tab>(['nyaa']))
	const selectTab = (next: Tab) => {
		setTab(next)
		setOpened((previous) => new Set(previous).add(next))
	}

	const [nyaa, refreshNyaa] = lazyResource<string, TorrentDetailsPayload>(() => props.torrentId, (id) => `/api/torrents/${id}/details`)
	const slug = () => settled(nyaa)?.seriesSlug
	createEffect(() => {
		if (settled(nyaa)) {
			markDetailsCached(props.torrentId)
		}
	})
	// Each series tab fetches the first time it's opened (never on modal open).
	const seriesSource = (source: SeriesSource) => () => (opened().has(source) ? slug() : false)
	const [erai, refreshErai] = lazyResource<string, SeriesSourcePayload<EraiRawsSeriesDetails>>(seriesSource('erai'), (key) => `/api/series/${key}/erai`)
	const [mal, refreshMal] = lazyResource<string, SeriesSourcePayload<MalDetails>>(seriesSource('mal'), (key) => `/api/series/${key}/mal`)
	const [anidb, refreshAnidb] = lazyResource<string, SeriesSourcePayload<AnidbDetails>>(seriesSource('anidb'), (key) => `/api/series/${key}/anidb`)
	// MAL/AniDB tabs show 🔍 (same as the list button) until their data is on disk: saved earlier, or fetched by opening the tab.
	const fetchedNow = (source: 'mal' | 'anidb') => Boolean(source === 'mal' ? settled(mal)?.data : settled(anidb)?.data)
	const notDownloaded = (id: Tab) => (id === 'mal' || id === 'anidb')
		&& Boolean(slug())
		&& !settled(nyaa)?.savedSources?.includes(id)
		&& !fetchedNow(id)

	// Featured image shown over the whole modal (tabs included); a click anywhere closes it.
	const [preview, setPreview] = createSignal<string>()

	const onKeyDown = (event: KeyboardEvent) => {
		if (event.key !== 'Escape') {
			return
		}
		if (preview()) {
			setPreview(undefined)
		} else {
			props.onClose()
		}
	}
	onMount(() => document.addEventListener('keydown', onKeyDown))
	onCleanup(() => document.removeEventListener('keydown', onKeyDown))

	return (
		<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" onClick={(event) => event.target === event.currentTarget && props.onClose()}>
			<div class="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-black/40">
				<Show when={preview()}>
					{(src) => (
						<div class="absolute inset-0 z-10 flex cursor-zoom-out items-center justify-center bg-slate-950 p-4" title="Click to close the preview" onClick={() => setPreview(undefined)}>
							<img src={src()} alt="" class="max-h-full max-w-full rounded-2xl object-contain" />
						</div>
					)}
				</Show>
				<div class="flex items-center justify-between gap-4">
					<div class="flex flex-wrap gap-2">
						<For each={tabs}>{(entry) => {
							const disabled = () => entry.id !== 'nyaa' && !slug()
							return (
								<button
									type="button"
									disabled={disabled()}
									title={disabled()
										? (nyaa.loading ? 'Waiting for Nyaa details' : 'Not an erai-raws torrent: no series page to follow')
										: notDownloaded(entry.id) ? 'Not downloaded yet — opening this tab fetches it' : undefined}
									onClick={() => selectTab(entry.id)}
									class={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${tab() === entry.id ? 'border-sky-500/40 bg-sky-500/10 text-sky-100' : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'}`}
								>
									{entry.label}
									<Show when={notDownloaded(entry.id)}><span class="ml-1.5">🔍</span></Show>
								</button>
							)
						}}</For>
					</div>
					<button type="button" onClick={() => props.onClose()} aria-label="Close" class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-300 hover:text-white">✕</button>
				</div>
				<div class="mt-4 min-h-0 overflow-y-auto pr-1">
					<Switch>
						<Match when={tab() === 'nyaa'}>
							<TabState resource={nyaa} onRefresh={refreshNyaa} fetchedAtUtc={settled(nyaa)?.nyaa.fetchedAtUtc}>
								{(data) => <NyaaTab detail={data.nyaa} />}
							</TabState>
						</Match>
						<Match when={tab() === 'erai' && slug()}>
							{(key) => (
								<TabState resource={erai} onRefresh={refreshErai} fetchedAtUtc={settled(erai)?.data?.series.fetchedAtUtc}>
									{(payload) => (payload.data ? <EraiTab slug={key()} details={payload.data} onPreview={setPreview} /> : <MissingLink reason={payload.reason} />)}
								</TabState>
							)}
						</Match>
						<Match when={tab() === 'mal' && slug()}>
							{(key) => (
								<TabState resource={mal} onRefresh={refreshMal} fetchedAtUtc={settled(mal)?.data?.fetchedAtUtc}>
									{(payload) => (payload.data ? <MalTab slug={key()} details={payload.data} onPreview={setPreview} /> : <MissingLink reason={payload.reason} />)}
								</TabState>
							)}
						</Match>
						<Match when={tab() === 'anidb' && slug()}>
							{(key) => (
								<TabState resource={anidb} onRefresh={refreshAnidb} fetchedAtUtc={settled(anidb)?.data?.fetchedAtUtc}>
									{(payload) => (payload.data ? <AnidbTab slug={key()} details={payload.data} onPreview={setPreview} /> : <MissingLink reason={payload.reason} />)}
								</TabState>
							)}
						</Match>
					</Switch>
				</div>
			</div>
		</div>
	)
}
