<script lang="ts">
	import { cn } from '$lib/utils';

	type Props = {
		progress: { expected: number; found: number; out: number; unexpected: number };
		class?: string;
	};

	let { progress, class: className }: Props = $props();

	let percent = $derived(
		progress.expected === 0 ? 100 : Math.round((progress.found / progress.expected) * 100)
	);
</script>

<div class={cn('space-y-1', className)}>
	<div class="flex items-baseline justify-between gap-2 text-xs">
		<span class="font-medium tabular-nums">{progress.found} / {progress.expected}</span>
		<span class="text-muted-foreground tabular-nums">
			{#if progress.out > 0}
				{progress.out} out ·
			{/if}
			{#if progress.unexpected > 0}
				{progress.unexpected} unexpected ·
			{/if}
			{percent} %
		</span>
	</div>
	<div class="h-1.5 overflow-hidden rounded-full bg-muted">
		<div class="h-full rounded-full bg-emerald-500 transition-all" style="width: {percent}%"></div>
	</div>
</div>
