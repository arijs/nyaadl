import { createResource } from 'solid-js'
import type { StatusResponse } from '../../shared/api'
import type { BootstrapDiscoveryResult } from '../../shared/types'
import { useDashboardActions } from './useDashboardActions'
import { useBootstrapSessionLog } from './useBootstrapSessionLog'
import { useBootstrapWorkflow } from './useBootstrapWorkflow'
import { useBlacklistManager } from './useBlacklistManager'
import { useTorrentHistoryFilter } from './useTorrentHistoryFilter'
import { useWatchRoots } from './useWatchRoots'
import { useWatchTargets } from './useWatchTargets'

async function fetchStatus(): Promise<StatusResponse> {
	const response = await fetch('/api/status')
	if (!response.ok) {
		throw new Error(`Failed to load status: ${response.status}`)
	}
	return response.json() as Promise<StatusResponse>
}

async function fetchBootstrapDiscovery(): Promise<BootstrapDiscoveryResult | undefined> {
	const response = await fetch('/api/bootstrap/discover-last-downloaded')
	if (!response.ok) {
		throw new Error(`Failed to load bootstrap discovery: ${response.status}`)
	}
	const body = await response.json() as { success: boolean; data: { result?: BootstrapDiscoveryResult } }
	return body.data.result
}

export function useDashboardScreen() {
	const [status, { refetch }] = createResource(fetchStatus)
	const [bootstrap, { refetch: refetchBootstrap }] = createResource(fetchBootstrapDiscovery)
	const bootstrapLog = useBootstrapSessionLog()
	const watchRoots = useWatchRoots({ refetch })
	const watchTargets = useWatchTargets()
	const torrentHistoryFilter = useTorrentHistoryFilter()
	const blacklistManager = useBlacklistManager({ refetch })
	const refreshAll = async () => {
		await Promise.all([
			Promise.resolve(refetch()),
			Promise.resolve(refetchBootstrap()),
			Promise.resolve(watchTargets.refetch()),
			Promise.resolve(torrentHistoryFilter.refetch()),
		])
	}
	const dashboardActions = useDashboardActions({ refetch: refreshAll })
	const bootstrapWorkflow = useBootstrapWorkflow({
		bootstrap,
		refetch: refreshAll,
		appendLogEntry: bootstrapLog.appendEntry,
		onBlacklistChanged: blacklistManager.refetch,
	})

	return {
		status,
		bootstrap,
		bootstrapLog,
		watchRoots,
		watchTargets,
		torrentHistoryFilter,
		blacklistManager,
		dashboardActions,
		bootstrapWorkflow,
	}
}
