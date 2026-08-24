<script lang="ts">
	import { cn, getContrastingTextColor } from '$lib/utils';

	type Props = {
		name: string;
		color: string;
		avatarLabel: string;
		class?: string;
	};

	let { name, color, avatarLabel, class: className }: Props = $props();

	let fg = $derived(getContrastingTextColor(color));
</script>

<span class={cn('inline-flex items-center gap-1.5', className)} title={name}>
	<span
		class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
		style={`background-color: ${color}; color: ${fg};`}
	>
		{avatarLabel}
	</span>
	<span class="truncate">{name}</span>
</span>
