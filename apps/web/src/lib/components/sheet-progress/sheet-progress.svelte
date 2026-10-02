<script lang="ts">
	import { sheetTitle, stageLabel, type SheetDownload } from '$lib/equipment-sheet-download.svelte';

	let { download }: { download: SheetDownload } = $props();

	let percent = $derived(Math.round(download.fraction * 100));
</script>

{#if download.kind}
	<div
		class="fixed right-4 bottom-4 z-50 w-72 space-y-2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
		role="status"
		aria-live="polite"
	>
		<div class="flex items-baseline justify-between gap-2 text-sm">
			<span class="font-medium">{sheetTitle(download.kind)}</span>
			<span class="text-xs text-muted-foreground tabular-nums">{percent} %</span>
		</div>
		<div class="h-1.5 overflow-hidden rounded-full bg-muted">
			<div class="h-full rounded-full bg-primary transition-all" style="width: {percent}%"></div>
		</div>
		<p class="text-xs text-muted-foreground">
			{#if download.progress}
				{stageLabel(download.progress.stage)}
				{#if download.progress.stage !== 'layout'}
					<span class="tabular-nums">{download.progress.done} / {download.progress.total}</span>
				{/if}
			{:else}
				Gathering the equipment
			{/if}
		</p>
	</div>
{/if}
