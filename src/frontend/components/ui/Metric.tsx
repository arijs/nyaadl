interface MetricProps {
	label: string
	value: () => string | number
}

export default function Metric(props: MetricProps) {
	return (
		<div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right shadow-sm shadow-black/20">
			<div class="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">{props.label}</div>
			<div class="mt-2 text-2xl font-semibold text-white">{props.value()}</div>
		</div>
	)
}
