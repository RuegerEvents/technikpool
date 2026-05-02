<script lang="ts">
	import { cn, getContrastingTextColor } from '$lib/utils';

	type Props = {
		name: string;
		color: string;
		class?: string;
	};

	let { name, color, class: className }: Props = $props();

	let fg = $derived(getContrastingTextColor(color));
</script>

<span
	class={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', className)}
	style={`background-color: ${color}; color: ${fg};`}
>
	{name}
</span>
