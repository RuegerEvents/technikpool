<script lang="ts">
	import { formatLength } from '#lib/cable.js';
	import { sortBands, type CableColorBand } from '#lib/cable-colors.js';
	import { bandDisplay } from '#lib/cable-colors.svelte.js';
	import CableColorSwatch from './cable-color-swatch.svelte';

	// An org's colour code as a table: colour → which lengths carry it.

	let { bands }: { bands: readonly CableColorBand[] } = $props();

	let rows = $derived(
		sortBands(bands).map((band, index, sorted) => ({
			band,
			display: bandDisplay(band),
			from: index === 0 ? null : sorted[index - 1].maxLengthCm
		}))
	);
</script>

<ul class="space-y-1 text-sm">
	{#each rows as row (row.band.maxLengthCm)}
		{#if row.display}
			<li class="flex items-center gap-2">
				<CableColorSwatch hex={row.display.hex} name={row.display.name} size="md" />
				<span class="min-w-16">{row.display.name}</span>
				<span class="text-muted-foreground">
					{#if row.from === null}
						up to {formatLength(row.band.maxLengthCm)}
					{:else}
						over {formatLength(row.from)} up to {formatLength(row.band.maxLengthCm)}
					{/if}
				</span>
			</li>
		{/if}
	{/each}
</ul>
