import { createResource, For, Show } from 'solid-js'
import type { WatchTargetFile } from '../../../shared/api'
import { postJsonBody } from '../../lib/httpClient'
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

// Local files of one release combo of a watch target, each with the torrent it came from (when the history knows it).
export default function WatchTargetFileList(props: WatchTargetFileListProps) {
	const [files] = createResource(
		() => ({ folderPath: props.folderPath, comboKey: props.comboKey }),
		async (body) => (await postJsonBody<WatchTargetFile[]>('/api/watchlist/target-files', body)).data,
	)
	return (
		<div class="mt-2 space-y-1.5">
			<Show when={!files.loading} fallback={<p class="text-[11px] text-slate-400">Loading files…</p>}>
				<Show when={!files.error} fallback={<p class="text-[11px] text-rose-300">{files.error instanceof Error ? files.error.message : 'Failed to load files'}</p>}>
					<Show when={(files() ?? []).length > 0} fallback={<p class="text-[11px] text-slate-400">No files.</p>}>
						<For each={files()}>
							{(file) => (
								<div class="rounded-lg border border-white/10 bg-slate-900/40 px-2 py-1.5">
									<p class="wrap-break-word text-xs text-slate-100">
										{file.name}
										<Show when={formatBytes(file.sizeBytes)}>{(size) => <span class="ml-2 text-slate-500">{size()}</span>}</Show>
									</p>
									<Show
										when={file.torrent}
										fallback={<p class="mt-0.5 text-[11px] text-slate-500">No torrent for this file in the history.</p>}
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
