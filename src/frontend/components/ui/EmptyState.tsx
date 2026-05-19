interface EmptyStateProps {
	title: string
	description: string
}

export default function EmptyState(props: EmptyStateProps) {
	return (
		<div class="rounded-2xl border border-dashed border-white/15 bg-white/3 px-4 py-6 text-sm text-slate-400">
			<p class="font-medium text-slate-200">{props.title}</p>
			<p class="mt-2 leading-6">{props.description}</p>
		</div>
	)
}
