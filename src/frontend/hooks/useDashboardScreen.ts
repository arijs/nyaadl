import { createResource } from 'solid-js'
import type { StatusResponse } from '../../shared/api'
import { useDashboardActions } from './useDashboardActions'
import { useBootstrapSessionLog } from './useBootstrapSessionLog'
import { useBootstrapWorkflow } from './useBootstrapWorkflow'
import { useTorrentHistoryFilter } from './useTorrentHistoryFilter'
import { useWatchRoots } from './useWatchRoots'

async function fetchStatus(): Promise<StatusResponse> {
	const response = await fetch('/api/status')
	if (!response.ok) {
		throw new Error(`Failed to load status: ${response.status}`)
	}
	return response.json() as Promise<StatusResponse>
}

export function useDashboardScreen() {
	const [status, { refetch }] = createResource(fetchStatus)
	const bootstrapLog = useBootstrapSessionLog()
	const watchRoots = useWatchRoots({ refetch })
	const torrentHistoryFilter = useTorrentHistoryFilter({ status })
	const dashboardActions = useDashboardActions({ refetch })
	const bootstrapWorkflow = useBootstrapWorkflow({
		status,
		refetch,
		appendLogEntry: bootstrapLog.appendEntry,
	})

	return {
		status,
		bootstrapLog,
		watchRoots,
		torrentHistoryFilter,
		dashboardActions,
		bootstrapWorkflow,
	}
}
