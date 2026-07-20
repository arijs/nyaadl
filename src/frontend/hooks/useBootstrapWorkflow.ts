import { createEffect, createSignal } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { FolderOptionsData, StatusResponse } from '../../shared/api'
import type { BootstrapDiscoveryResult, WatchTargetsIssue } from '../../shared/types'
import { getJson, postJson, postJsonBody, requestJson } from '../lib/httpClient'
import type { BootstrapCursor } from '../types'
import type { ApproveDestinationState } from '../components/ui/ApproveDestinationModal'

interface UseBootstrapWorkflowOptions {
	bootstrap: Accessor<BootstrapDiscoveryResult | undefined>
	refetch: () => unknown | Promise<unknown>
	appendLogEntry: (entry: { timestampUtc: string; kind: 'step' | 'action' | 'error'; message: string; page?: number; itemIndex?: number }) => void
	onBlacklistChanged?: () => unknown | Promise<unknown>
}

export function useBootstrapWorkflow(options: UseBootstrapWorkflowOptions) {
	const [bootstrapCursor, setBootstrapCursor] = createSignal<BootstrapCursor | undefined>(undefined)
	const [bootstrapMessage, setBootstrapMessage] = createSignal('')
	const [bootstrapRetryPage, setBootstrapRetryPage] = createSignal<number | undefined>(undefined)
	const [bootstrapQueryDraft, setBootstrapQueryDraft] = createSignal('')
	const [qbForceResubmit, setQbForceResubmit] = createSignal(false)
	const [processWholePage, setProcessWholePage] = createSignal(false)
	const [queueActionErrors, setQueueActionErrors] = createSignal<Record<string, string>>({})
	const [approveDestinationModal, setApproveDestinationModal] = createSignal<ApproveDestinationState | null>(null)
	const [watchTargetsIssueModal, setWatchTargetsIssueModal] = createSignal<WatchTargetsIssue | null>(null)

	const normalizeQuery = (value: string | undefined): string => value?.trim().replace(/\s+/g, ' ') ?? ''
	const getActiveCustomQuery = () => normalizeQuery(options.bootstrap()?.customQuery)
	const isBootstrapQuerySubmitDisabled = () => normalizeQuery(bootstrapQueryDraft()).length === 0

	createEffect(() => {
		const lastDiscovery = options.bootstrap()
		if (lastDiscovery && typeof lastDiscovery.nextPage === 'number' && typeof lastDiscovery.nextItemIndex === 'number') {
			setBootstrapCursor({
				page: lastDiscovery.nextPage,
				itemIndex: lastDiscovery.nextItemIndex,
				cursorToken: lastDiscovery.nextCursorToken,
			})
		} else if (!lastDiscovery || typeof lastDiscovery.nextPage !== 'number') {
			setBootstrapCursor(undefined)
		}

		if (normalizeQuery(bootstrapQueryDraft()).length === 0) {
			setBootstrapQueryDraft(lastDiscovery?.customQuery ?? '')
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

	async function runBootstrapDiscoveryStep(cursorOverride?: BootstrapCursor, customQueryOverride?: string) {
		try {
			setBootstrapMessage('')
			setBootstrapRetryPage(undefined)
			const requestCursor = cursorOverride ?? bootstrapCursor()
			const activeCustomQuery = normalizeQuery(customQueryOverride ?? getActiveCustomQuery())
			const response = await requestJson<{ result: BootstrapDiscoveryResult }>('/api/bootstrap/discover-last-downloaded', 'POST', {
				...(requestCursor ?? {}),
				qbForceResubmit: qbForceResubmit(),
				wholePage: processWholePage(),
				customQuery: activeCustomQuery.length > 0 ? activeCustomQuery : undefined,
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
				message: `query=${result.customQuery ?? 'default'} | mode=${result.mode ?? 'n/a'} | approved ${approvedCount} | rejected ${rejectedCount} | already ${alreadyCount} | backfilled ${backfilledCount} | pending ${pendingCount}${result.actionItem ? ` | review: ${result.actionItem.item.title}` : ''}`,
				page: result.currentPage,
				itemIndex: result.currentItemIndex,
			})
			if (result.watchTargetsIssue) {
				setWatchTargetsIssueModal(result.watchTargetsIssue)
				options.appendLogEntry({
					timestampUtc: new Date().toISOString(),
					kind: 'error',
					message: result.reason,
					page: result.currentPage,
				})
			}
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

	async function clearBootstrapForQuerySwitch(reason: string) {
		setBootstrapCursor(undefined)
		setBootstrapMessage('')
		setBootstrapRetryPage(undefined)
		await postJson('/api/bootstrap/discovery/clear')
		options.appendLogEntry({
			timestampUtc: new Date().toISOString(),
			kind: 'action',
			message: reason,
		})
	}

	async function submitBootstrapQuery() {
		const submittedQuery = normalizeQuery(bootstrapQueryDraft())
		if (submittedQuery.length === 0) {
			return
		}

		const activeQuery = getActiveCustomQuery()
		if (submittedQuery.toLowerCase() !== activeQuery.toLowerCase()) {
			await clearBootstrapForQuerySwitch(`discover status cleared; query switched to "${submittedQuery}"`)
		}

		await runBootstrapDiscoveryStep({ page: 1, itemIndex: 0 }, submittedQuery)
	}

	async function runDefaultBootstrapDiscovery() {
		if (getActiveCustomQuery().length > 0) {
			await clearBootstrapForQuerySwitch('discover status cleared; query switched to default')
			await runBootstrapDiscoveryStep({ page: 1, itemIndex: 0 }, undefined)
			return
		}

		await runBootstrapDiscoveryStep()
	}

	async function runBootstrapDiscoveryForPage(page: number) {
		const targetPage = Math.max(1, Math.floor(page))
		await runBootstrapDiscoveryStep({ page: targetPage, itemIndex: 0 })
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
		rootPath?: string
		seriesFolder?: string
	}) {
		try {
			clearQueueActionError(params.torrentId)
			if (params.action === 'approve' && params.rootPath && params.seriesFolder) {
				await postJsonBody(`/api/pending/${params.torrentId}/approve`, { rootPath: params.rootPath, seriesFolder: params.seriesFolder })
			} else {
				await postJson(`/api/pending/${params.torrentId}/${params.action}`)
			}
			options.appendLogEntry({
				timestampUtc: new Date().toISOString(),
				kind: 'action',
				message: `${params.action} -> ${params.title ?? params.torrentId}`,
				page: params.page,
			})
			if (params.continueDiscovery) {
				await runBootstrapDiscoveryStep()
			} else if (params.action === 'blacklist') {
				await Promise.resolve(options.onBlacklistChanged?.())
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : `Failed to ${params.action} torrent`
			if (params.action === 'approve' && !params.rootPath && error instanceof Error && error.message.startsWith('Unable to resolve qBittorrent destination folder')) {
				try {
					const optionsResponse = await getJson<FolderOptionsData>(`/api/pending/${params.torrentId}/folder-options`)
					setApproveDestinationModal({
						torrentId: params.torrentId,
						title: params.title ?? params.torrentId,
						page: params.page,
						continueDiscovery: params.continueDiscovery ?? false,
						fromTitle: optionsResponse.data.fromTitle,
						fromFilename: optionsResponse.data.fromFilename,
						watchRoots: optionsResponse.data.watchRoots,
					})
					await Promise.resolve(options.refetch())
					return
				} catch {
					// fall through to normal error handling
				}
			}
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

	async function confirmApproveWithDestination(params: { rootPath: string; seriesFolder: string }) {
		const modal = approveDestinationModal()
		if (!modal) return
		setApproveDestinationModal(null)
		await resolvePendingItemAction({
			torrentId: modal.torrentId,
			action: 'approve',
			title: modal.title,
			page: modal.page,
			continueDiscovery: modal.continueDiscovery,
			rootPath: params.rootPath,
			seriesFolder: params.seriesFolder,
		})
	}

	function cancelApproveDestination() {
		setApproveDestinationModal(null)
	}

	async function resolveBootstrapAction(action: 'approve' | 'blacklist' | 'skip') {
		const actionItem = options.bootstrap()?.actionItem
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
		const activeTorrentId = options.bootstrap()?.actionItem?.torrentId
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
		bootstrapQueryDraft,
		setBootstrapQueryDraft,
		isBootstrapQuerySubmitDisabled,
		qbForceResubmit,
		setQbForceResubmit,
		processWholePage,
		setProcessWholePage,
		getQueueActionError,
		approveDestinationModal,
		confirmApproveWithDestination,
		cancelApproveDestination,
		watchTargetsIssueModal,
		dismissWatchTargetsIssue: () => setWatchTargetsIssueModal(null),
		runBootstrapDiscoveryStep,
		runDefaultBootstrapDiscovery,
		submitBootstrapQuery,
		runBootstrapDiscoveryForPage,
		clearBootstrapDiscoveryStatus,
		retryBootstrapCurrentPage,
		resolveBootstrapAction,
		approveQueueItem,
		blacklistQueueItem,
		skipQueueItem,
	}
}
