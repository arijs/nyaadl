import { createSignal } from 'solid-js'
import { requestJson } from '../lib/httpClient'

interface UseWatchRootsOptions {
	refetch: () => unknown | Promise<unknown>
}

export function useWatchRoots(options: UseWatchRootsOptions) {
	const [newRootPath, setNewRootPath] = createSignal('')
	const [rootMessage, setRootMessage] = createSignal('')

	async function refreshRootsOnly() {
		await requestJson('/api/watchlist/folders/refresh', 'POST')
		await Promise.resolve(options.refetch())
	}

	async function addWatchRoot() {
		const folderPath = newRootPath().trim()
		if (!folderPath) {
			return
		}
		try {
			setRootMessage('')
			await requestJson('/api/watchlist/folders', 'POST', { folderPath })
			await Promise.resolve(options.refetch())
			setNewRootPath('')
		} catch (error) {
			setRootMessage(error instanceof Error ? error.message : 'Failed to add folder')
		}
	}

	async function removeWatchRoot(folderPath: string) {
		setRootMessage('')
		await requestJson('/api/watchlist/folders', 'DELETE', { folderPath })
		await Promise.resolve(options.refetch())
	}

	return {
		newRootPath,
		setNewRootPath,
		rootMessage,
		refreshRootsOnly,
		addWatchRoot,
		removeWatchRoot,
	}
}
