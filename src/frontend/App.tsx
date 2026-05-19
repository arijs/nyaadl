import ExecutionStateSection from './components/sections/ExecutionStateSection'
import HeroSection from './components/sections/HeroSection'
import PendingQueueSection from './components/sections/PendingQueueSection'
import TorrentHistorySection from './components/sections/TorrentHistorySection'
import WatchedRootsSection from './components/sections/WatchedRootsSection'
import BootstrapSessionLogSection from './components/sections/BootstrapSessionLogSection'
import BootstrapDiscoverySection from './components/sections/BootstrapDiscoverySection'
import BlacklistManagerSection from './components/sections/BlacklistManagerSection'
import { useDashboardScreen } from './hooks/useDashboardScreen'

export default function App() {
	const {
		status,
		bootstrapLog,
		watchRoots,
		torrentHistoryFilter,
		blacklistManager,
		dashboardActions,
		bootstrapWorkflow,
	} = useDashboardScreen()

	return (
		<div class="min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,215,0,0.18),transparent_35%),linear-gradient(180deg,#0f172a_0%,#111827_48%,#020617_100%)] text-slate-100">
			<main class="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8 lg:px-10">
				<HeroSection status={status} />

				<div class="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
					<WatchedRootsSection
						status={status}
						watchRoots={watchRoots}
					/>

					<ExecutionStateSection
						status={status}
						bootstrapWorkflow={bootstrapWorkflow}
						dashboardActions={dashboardActions}
					/>
				</div>

				<BootstrapDiscoverySection
					bootstrap={() => status()?.data.status.lastBootstrapDiscovery}
					bootstrapWorkflow={bootstrapWorkflow}
					dashboardActions={dashboardActions}
				/>

				<PendingQueueSection
					status={status}
					dashboardActions={dashboardActions}
					bootstrapWorkflow={bootstrapWorkflow}
				/>

				<BlacklistManagerSection blacklistManager={blacklistManager} />

				<TorrentHistorySection torrentHistoryFilter={torrentHistoryFilter} />
				<BootstrapSessionLogSection bootstrapLog={bootstrapLog} />
			</main>
		</div>
	)
}
