import { createResource, createSignal, For, Show } from 'solid-js'
import type { QbittorrentTorrentSummary, WatchTargetFilesResponse } from '../../../shared/api'
import { postJson, postJsonBody } from '../../lib/httpClient'
import { statusTagClass } from '../../lib/statusTag'
import NyaaMeta from './NyaaMeta'

interface WatchTargetFileListProps {
	folderPath: string
	comboKey: string
}

function formatBytes(bytes: number | undefined): string | undefined {
	if (bytes === undefined) {
		return undefined
	}
	const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
	let value = bytes
	let unit = 0
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024
		unit += 1
	}
	return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

const formatDate = (unixSeconds: number | undefined) => (unixSeconds ? new Date(unixSeconds * 1000).toISOString().slice(0, 10) : undefined)

// Fallback for files the decision history doesn't know: the torrent as qBittorrent has it.
function QbittorrentInfo(props: { torrent: QbittorrentTorrentSummary; fileName: string }) {
	return (
		<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
			<Show when={props.torrent.name !== props.fileName}>
				<p class="wrap-break-word basis-full text-slate-300">Torrent: {props.torrent.name}</p>
			</Show>
			<span class="rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs font-medium text-violet-200">qBittorrent</span>
			<Show when={props.torrent.live} fallback={<span class="text-amber-200">offline (from the local index)</span>}>
				<span>{props.torrent.state} · {Math.round((props.torrent.progress ?? 0) * 100)}%</span>
			</Show>
			<Show when={props.torrent.nyaaTorrentId}>{(torrentId) => <NyaaMeta torrentId={torrentId()} />}</Show>
			<span>
				added {formatDate(props.torrent.addedOn) ?? 'n/a'}
				<Show when={formatDate(props.torrent.completionOn)}>{(date) => <> · completed {date()}</>}</Show>
				<Show when={props.torrent.live}>
					{' · '}ratio {props.torrent.ratio?.toFixed(2) ?? 'n/a'} · seeders {props.torrent.numComplete ?? 'n/a'} · leechers {props.torrent.numIncomplete ?? 'n/a'}
				</Show>
				<Show when={props.torrent.tags}>{(tags) => <> · tags {tags()}</>}</Show>
			</span>
		</div>
	)
}

// Local files of one release combo of a watch target, each with the torrent it came from: from the decision history,
// or from qBittorrent when the history doesn't know the file.
export default function WatchTargetFileList(props: WatchTargetFileListProps) {
	const [response, { refetch }] = createResource(
		() => ({ folderPath: props.folderPath, comboKey: props.comboKey }),
		async (body) => (await postJsonBody<WatchTargetFilesResponse>('/api/watchlist/target-files', body)).data,
	)
	const files = () => response()?.files ?? []
	const [rebuilding, setRebuilding] = createSignal(false)
	const [rebuildError, setRebuildError] = createSignal<string>()
	const rebuildIndex = async () => {
		setRebuilding(true)
		setRebuildError(undefined)
		try {
			await postJson('/api/qbittorrent/index/rebuild')
			await refetch()
		} catch (error) {
			setRebuildError(error instanceof Error ? error.message : 'Failed to rebuild the qBittorrent index')
		} finally {
			setRebuilding(false)
		}
	}
	// Files neither the history nor the qBittorrent index know: the index may be missing or out of date.
	const unmatchedCount = () => files().filter((file) => !file.torrent && !file.qbittorrent).length
	return (
		<div class="mt-2 space-y-1.5">
			<Show when={!response.loading} fallback={<p class="text-[11px] text-slate-400">Loading files…</p>}>
				<Show when={!response.error} fallback={<p class="text-[11px] text-rose-300">{response.error instanceof Error ? response.error.message : 'Failed to load files'}</p>}>
					<Show when={response()?.qbittorrentError}>
						{(error) => <p class="text-[11px] text-amber-200">qBittorrent unavailable, showing what the history and the local index know: {error()}</p>}
					</Show>
					<Show when={unmatchedCount() > 0 && response()?.qbittorrentIndex}>
						{(index) => (
							<div class="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
								<span>
									{index().torrents === 0
										? 'The qBittorrent index is not built yet.'
										: `${unmatchedCount()} file(s) not in the qBittorrent index (${index().torrents} torrents, full load ${index().fullSyncAt?.slice(0, 10) ?? 'n/a'}).`}
								</span>
								<button
									type="button"
									disabled={rebuilding()}
									class="rounded-full border border-violet-300/30 bg-violet-300/10 px-2 py-0.5 text-violet-100 transition hover:border-violet-300/60 disabled:opacity-50"
									onClick={() => void rebuildIndex()}
								>
									{rebuilding() ? 'Loading the whole qBittorrent list…' : index().torrents === 0 ? 'Build qBittorrent index' : 'Rebuild qBittorrent index'}
								</button>
								<Show when={rebuildError()}>{(error) => <span class="text-rose-300">{error()}</span>}</Show>
							</div>
						)}
					</Show>
					<Show when={files().length > 0} fallback={<p class="text-[11px] text-slate-400">No files.</p>}>
						<For each={files()}>
							{(file) => (
								<div class="rounded-lg border border-white/10 bg-slate-900/40 px-2 py-1.5">
									<p class="wrap-break-word text-xs text-slate-100">
										{file.name}
										<Show when={formatBytes(file.sizeBytes)}>{(size) => <span class="ml-2 text-slate-500">{size()}</span>}</Show>
									</p>
									<Show
										when={file.torrent}
										fallback={(
											<Show when={file.qbittorrent} fallback={<p class="mt-0.5 text-[11px] text-slate-500">No torrent for this file in the history or in qBittorrent.</p>}>
												{(qb) => <QbittorrentInfo torrent={qb()} fileName={file.name} />}
											</Show>
										)}
									>
										{(torrent) => (
											<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
												<Show when={torrent().item.title !== file.name.replace(/\.[^.]+$/, '')}>
													<p class="wrap-break-word basis-full text-slate-300">Torrent: {torrent().item.title}</p>
												</Show>
												<span class={statusTagClass(torrent().status)}>{torrent().status}</span>
												<NyaaMeta torrentId={torrent().torrentId} category={torrent().item.category} sizeText={torrent().item.sizeText} />
												<span>
													{torrent().item.publishedAtUtc?.slice(0, 10) ?? 'n/a'} · seeders {torrent().item.seeders ?? 'n/a'} · leechers {torrent().item.leechers ?? 'n/a'} · downloads {torrent().item.downloads ?? 'n/a'}
												</span>
											</div>
										)}
									</Show>
								</div>
							)}
						</For>
					</Show>
				</Show>
			</Show>
		</div>
	)
}
