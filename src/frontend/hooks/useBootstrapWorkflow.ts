import { createEffect, createSignal } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { StatusResponse } from '../../shared/api'
import type { BootstrapDiscoveryResult } from '../../shared/types'
import { postJson, requestJson } from '../lib/httpClient'
import type { BootstrapCursor } from '../types'

interface UseBootstrapWorkflowOptions {
	status: Accessor<StatusResponse | undefined>
	refetch: () => unknown | Promise<unknown>
	appendLogEntry: (entry: { timestampUtc: string; kind: 'step' | 'action' | 'error'; message: string; page?: number; itemIndex?: number }) => void
}

export function useBootstrapWorkflow(options: UseBootstrapWorkflowOptions) {
	const [bootstrapCursor, setBootstrapCursor] = createSignal<BootstrapCursor | undefined>(undefined)
	const [bootstrapMessage, setBootstrapMessage] = createSignal('')
	const [bootstrapRetryPage, setBootstrapRetryPage] = createSignal<number | undefined>(undefined)
	const [qbForceResubmit, setQbForceResubmit] = createSignal(false)
	const [queueActionErrors, setQueueActionErrors] = createSignal<Record<string, string>>({})

	createEffect(() => {
		const lastDiscovery = options.status()?.data.status.lastBootstrapDiscovery
		if (lastDiscovery && typeof lastDiscovery.nextPage === 'number' && typeof lastDiscovery.nextItemIndex === 'number') {
			setBootstrapCursor({
				page: lastDiscovery.nextPage,
				itemIndex: lastDiscovery.nextItemIndex,
				cursorToken: lastDiscovery.nextCursorToken,
			})
		} else if (!lastDiscovery || typeof lastDiscovery.nextPage !== 'number') {
			setBootstrapCursor(undefined)
		}
	})

	function getQueueActionError(torrentId: string): string | undefined {
		return queueActionErrors()[torrentId]
	}

	function clearQueueActionError(torrentId: string): void {
		setQueueActionErrors((current) => {
			if (!(torrentId in current)) {
				return current
			}
			const next = { ...current }
			delete next[torrentId]
			return next
		})
	}

	async function runBootstrapDiscoveryStep() {
		try {
			setBootstrapMessage('')
			setBootstrapRetryPage(undefined)
			const response = await requestJson<{ result: BootstrapDiscoveryResult }>('/api/bootstrap/discover-last-downloaded', 'POST', {
				...(bootstrapCursor() ?? {}),
				qbForceResubmit: qbForceResubmit(),
			})
			const result = response.data.result
			const nextPage = response.data.result.nextPage
			const nextItemIndex = response.data.result.nextItemIndex
			const nextCursorToken = response.data.result.nextCursorToken
			const approvedCount = result.autoApproved?.length ?? 0
			const rejectedCount = result.autoRejected?.length ?? 0
			const alreadyCount = result.alreadyDownloaded?.length ?? 0
			const backfilledCount = result.backfilled?.length ?? 0
			const pendingCount = result.actionItem ? 1 : 0
			options.appendLogEntry({
				timestampUtc: new Date().toISOString(),
				kind: 'step',
				message: `mode=${result.mode ?? 'n/a'} | approved ${approvedCount} | rejected ${rejectedCount} | already ${alreadyCount} | backfilled ${backfilledCount} | pending ${pendingCount}${result.actionItem ? ` | review: ${result.actionItem.item.title}` : ''}`,
				page: result.currentPage,
				itemIndex: result.currentItemIndex,
			})
			if (typeof nextPage === 'number' && typeof nextItemIndex === 'number') {
				setBootstrapCursor({ page: nextPage, itemIndex: nextItemIndex, cursorToken: nextCursorToken })
			} else {
				setBootstrapCursor(undefined)
			}
			await Promise.resolve(options.refetch())
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to run bootstrap step'
			await Promise.resolve(options.refetch())
			if (errorMessage.includes('Bootstrap cursor became stale')) {
				const currentCursor = bootstrapCursor()
				if (currentCursor) {
					setBootstrapCursor({ page: currentCursor.page, itemIndex: 0 })
					setBootstrapRetryPage(currentCursor.page)
					setBootstrapMessage(`Cursor was outdated for page ${currentCursor.page}. Position reset to item 0; retry this page.`)
					options.appendLogEntry({
						timestampUtc: new Date().toISOString(),
						kind: 'error',
						message: `stale cursor at page ${currentCursor.page}; reset to item 0`,
						page: currentCursor.page,
						itemIndex: 0,
					})
					return
				}
			}
			setBootstrapMessage(errorMessage)
			options.appendLogEntry({
				timestampUtc: new Date().toISOString(),
				kind: 'error',
				message: errorMessage,
			})
		}
	}

	async function clearBootstrapDiscoveryStatus() {
		try {
			setBootstrapCursor(undefined)
			setBootstrapMessage('')
			setBootstrapRetryPage(undefined)
			await postJson('/api/bootstrap/discovery/clear')
			options.appendLogEntry({
				timestampUtc: new Date().toISOString(),
				kind: 'action',
				message: 'discover status cleared; next discovery starts from page 1',
			})
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to clear discover status'
			setBootstrapMessage(errorMessage)
			options.appendLogEntry({
				timestampUtc: new Date().toISOString(),
				kind: 'error',
				message: errorMessage,
			})
		} finally {
			await Promise.resolve(options.refetch())
		}
	}

	async function retryBootstrapCurrentPage() {
		const page = bootstrapRetryPage()
		if (!page) {
			return
		}
		setBootstrapCursor({ page, itemIndex: 0 })
		await runBootstrapDiscoveryStep()
	}

	async function resolvePendingItemAction(params: {
		torrentId: string
		action: 'approve' | 'blacklist' | 'skip'
		title?: string
		page?: number
		continueDiscovery?: boolean
	}) {
		try {
			clearQueueActionError(params.torrentId)
			await postJson(`/api/pending/${params.torrentId}/${params.action}`)
			options.appendLogEntry({
				timestampUtc: new Date().toISOString(),
				kind: 'action',
				message: `${params.action} -> ${params.title ?? params.torrentId}`,
				page: params.page,
			})
			if (params.continueDiscovery) {
				await runBootstrapDiscoveryStep()
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : `Failed to ${params.action} torrent`
			setBootstrapMessage(errorMessage)
			setQueueActionErrors((current) => ({
				...current,
				[params.torrentId]: errorMessage,
			}))
			options.appendLogEntry({
				timestampUtc: new Date().toISOString(),
				kind: 'error',
				message: errorMessage,
				page: params.page,
			})
		} finally {
			await Promise.resolve(options.refetch())
		}
	}

	async function resolveBootstrapAction(action: 'approve' | 'blacklist' | 'skip') {
		const actionItem = options.status()?.data.status.lastBootstrapDiscovery?.actionItem
		if (!actionItem) {
			return
		}
		await resolvePendingItemAction({
			torrentId: actionItem.torrentId,
			action,
			title: actionItem.item.title,
			page: actionItem.item.page,
			continueDiscovery: true,
		})
	}

	async function resolveQueueItemAction(params: {
		torrentId: string
		action: 'approve' | 'blacklist' | 'skip'
		title: string
		page?: number
	}) {
		const activeTorrentId = options.status()?.data.status.lastBootstrapDiscovery?.actionItem?.torrentId
		await resolvePendingItemAction({
			torrentId: params.torrentId,
			action: params.action,
			title: params.title,
			page: params.page,
			continueDiscovery: activeTorrentId === params.torrentId,
		})
	}

	async function approveQueueItem(torrentId: string, title: string, page?: number) {
		await resolveQueueItemAction({ torrentId, action: 'approve', title, page })
	}

	async function blacklistQueueItem(torrentId: string, title: string, page?: number) {
		await resolveQueueItemAction({ torrentId, action: 'blacklist', title, page })
	}

	async function skipQueueItem(torrentId: string, title: string, page?: number) {
		await resolveQueueItemAction({ torrentId, action: 'skip', title, page })
	}

	return {
		bootstrapCursor,
		bootstrapMessage,
		bootstrapRetryPage,
		qbForceResubmit,
		setQbForceResubmit,
		getQueueActionError,
		runBootstrapDiscoveryStep,
		clearBootstrapDiscoveryStatus,
		retryBootstrapCurrentPage,
		resolveBootstrapAction,
		approveQueueItem,
		blacklistQueueItem,
		skipQueueItem,
	}
}
