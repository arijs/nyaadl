export type { TorrentFilter } from '../shared/types'

export type BootstrapLogFilter = 'all' | 'step' | 'action' | 'error'

export interface BootstrapSessionEntry {
	timestampUtc: string
	kind: 'step' | 'action' | 'error'
	message: string
	page?: number
	itemIndex?: number
}

export interface BootstrapCursor {
	page: number
	itemIndex: number
	cursorToken?: string
}
