import { Show } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { StatusResponse } from '../../../shared/api'
import Metric from '../ui/Metric'

interface HeroSectionProps {
	status: Accessor<StatusResponse | undefined>
}

export default function HeroSection(props: HeroSectionProps) {

	return (
		<section class="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/30 backdrop-blur">
			<div class="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(260px,1fr)_minmax(0,3fr)] lg:items-start lg:gap-8">
				<div>
					<p class="text-sm uppercase tracking-[0.35em] text-amber-300/90">NYAADL</p>
					<h1 class="mt-2 text-3xl font-semibold text-white lg:text-5xl">Torrent automation dashboard</h1>
					<p class="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
						Watching Nyaa.si, matching against your season folders, and routing ambiguous releases to manual approval.
					</p>
				</div>
				<div class="mt-1 flex flex-col gap-4 lg:mt-0">
					<div class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-3">
						<Metric label="Watch targets" value={() => props.status()?.data.status.watchTargetsCount ?? '...'} />
						<Metric label="Auto" value={() => props.status()?.data.status.autoCount ?? '...'} />
						<Metric label="Already local" value={() => props.status()?.data.status.alreadyDownloadedCount ?? '...'} />
						<Metric label="Downloaded" value={() => props.status()?.data.status.downloadedCount ?? '...'} />
						<Metric label="Blocked" value={() => props.status()?.data.status.blockedCount ?? '...'} />
						<Metric label="Pending" value={() => props.status()?.data.status.pendingCount ?? '...'} />
					</div>
				</div>
			</div>
		</section>
	)
}
