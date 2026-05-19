interface ActionButtonProps {
	label: string
	onClick: () => void | Promise<void>
	compact?: boolean
	disabled?: boolean
	class?: string
}

export default function ActionButton(props: ActionButtonProps) {
	return (
		<button
			type="button"
			disabled={props.disabled}
			onClick={(event) => {
				event.preventDefault()
				if (props.disabled) {
					return
				}
				void props.onClick()
			}}
			class={`${props.compact
				? `rounded-full border px-3 py-1.5 text-xs font-medium transition ${props.disabled ? 'cursor-not-allowed border-white/10 bg-white/5 text-slate-500' : 'border-white/10 bg-white/5 text-slate-200 hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-white'}`
				: `rounded-full border px-4 py-2 text-sm font-medium transition ${props.disabled ? 'cursor-not-allowed border-amber-300/10 bg-amber-300/5 text-amber-200/60' : 'border-amber-300/20 bg-amber-300/10 text-amber-100 hover:border-amber-300/40 hover:bg-amber-300/20 hover:text-white'}`} ${props.class ?? ''}`}
		>
			{props.label}
		</button>
	)
}
