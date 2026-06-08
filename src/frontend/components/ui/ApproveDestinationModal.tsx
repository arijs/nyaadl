import { createSignal, For } from 'solid-js'
import type { FolderOptionsData } from '../../../shared/api'

export interface ApproveDestinationState {
	torrentId: string
	title: string
	page?: number
	continueDiscovery: boolean
	fromTitle: string
	fromFilename: string
	watchRoots: FolderOptionsData['watchRoots']
}

interface ApproveDestinationModalProps {
	state: ApproveDestinationState
	onConfirm: (params: { rootPath: string; seriesFolder: string }) => void
	onCancel: () => void
}

export default function ApproveDestinationModal(props: ApproveDestinationModalProps) {
	const allRoots = () => props.state.watchRoots
	const defaultRoot = () => allRoots().find((r) => r.exists && r.isDirectory)?.path ?? allRoots()[0]?.path ?? ''

	const [selectedRoot, setSelectedRoot] = createSignal(defaultRoot())
	const [useCustomRoot, setUseCustomRoot] = createSignal(allRoots().length === 0)
	const [customRootInput, setCustomRootInput] = createSignal('')
	const [folderName, setFolderName] = createSignal(props.state.fromTitle)
	const [activeSource, setActiveSource] = createSignal<'title' | 'filename'>('title')

	const rootPath = () => (useCustomRoot() ? customRootInput() : selectedRoot()).trim()
	const previewPath = () => {
		const root = rootPath()
		const folder = folderName().trim()
		if (!root || !folder) return ''
		return root.endsWith('\\') || root.endsWith('/') ? `${root}${folder}` : `${root}\\${folder}`
	}
	const canConfirm = () => rootPath().length > 0 && folderName().trim().length > 0

	function applySource(source: 'title' | 'filename') {
		setActiveSource(source)
		setFolderName(source === 'filename' ? props.state.fromFilename : props.state.fromTitle)
	}

	function handleConfirm() {
		const root = rootPath()
		const folder = folderName().trim()
		if (!root || !folder) return
		props.onConfirm({ rootPath: root, seriesFolder: folder })
	}

	return (
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
			<div class="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-black/40">
				<h2 class="text-base font-semibold text-white">Choose download destination</h2>
				<p class="mt-1 text-sm text-slate-400">The system couldn't match this torrent to an existing watch target. Select where it should be saved.</p>
				<p class="mt-2 break-words text-xs font-medium text-slate-300">{props.state.title}</p>

				<div class="mt-5 space-y-4">
					{/* Root folder */}
					<div>
						<label class="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">Root folder</label>
						<div class="space-y-1.5">
							<select
								value={useCustomRoot() ? '__custom__' : selectedRoot()}
								onChange={(e) => {
									if (e.currentTarget.value === '__custom__') {
										setUseCustomRoot(true)
									} else {
										setUseCustomRoot(false)
										setSelectedRoot(e.currentTarget.value)
									}
								}}
								class="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 focus:border-sky-500/50 focus:outline-none"
							>
								<For each={allRoots()}>
									{(root) => (
										<option value={root.path} class="bg-slate-900 text-slate-100">
											{root.path}{!root.exists || !root.isDirectory ? ' (missing)' : ''}
										</option>
									)}
								</For>
								<option value="__custom__" class="bg-slate-900 text-slate-100">Enter custom path…</option>
							</select>
							{useCustomRoot() && (
								<input
									type="text"
									value={customRootInput()}
									onInput={(e) => setCustomRootInput(e.currentTarget.value)}
									placeholder="e.g. Q:\2026.2 PRIMAVERA"
									class="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500/50 focus:outline-none"
								/>
							)}
						</div>
					</div>

					{/* Folder name source */}
					<div>
						<label class="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">Series folder name</label>
						<div class="space-y-1.5">
							<button
								type="button"
								onClick={() => applySource('title')}
								class={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${activeSource() === 'title' ? 'border-sky-500/40 bg-sky-500/10 text-sky-100' : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'}`}
							>
								<span class={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${activeSource() === 'title' ? 'border-sky-400 bg-sky-400' : 'border-slate-500'}`} />
								<span class="min-w-0">
									<span class="block text-xs font-medium">From series title</span>
									<span class="mt-0.5 block break-words text-[11px] text-slate-400">{props.state.fromTitle}</span>
								</span>
							</button>
							<button
								type="button"
								onClick={() => applySource('filename')}
								class={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${activeSource() === 'filename' ? 'border-sky-500/40 bg-sky-500/10 text-sky-100' : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'}`}
							>
								<span class={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${activeSource() === 'filename' ? 'border-sky-400 bg-sky-400' : 'border-slate-500'}`} />
								<span class="min-w-0">
									<span class="block text-xs font-medium">From video filename</span>
									<span class="mt-0.5 block break-words text-[11px] text-slate-400">{props.state.fromFilename}</span>
								</span>
							</button>
						</div>
					</div>

					{/* Editable folder name */}
					<div>
						<label class="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">Series folder</label>
						<input
							type="text"
							value={folderName()}
							onInput={(e) => setFolderName(e.currentTarget.value)}
							class="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500/50 focus:outline-none"
						/>
					</div>

					{/* Full path preview */}
					<div class="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
						<p class="mb-0.5 text-[11px] uppercase tracking-wider text-slate-500">Full path</p>
						<p class="break-all text-xs text-slate-200">
							{previewPath() || <span class="italic text-slate-500">Enter root folder and series name</span>}
						</p>
					</div>
				</div>

				<div class="mt-5 flex justify-end gap-2">
					<button
						type="button"
						onClick={props.onCancel}
						class="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-slate-300 transition-colors hover:bg-white/10"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleConfirm}
						disabled={!canConfirm()}
						class="rounded-full bg-sky-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
					>
						Confirm destination
					</button>
				</div>
			</div>
		</div>
	)
}
