<script lang="ts">
	import { cableBandFor } from '#lib/cable-colors.js';
	import { bandDisplay } from '#lib/cable-colors.svelte.js';
	import { getCableColorSchemes } from '#lib/remote/cable-colors.remote.js';
	import CableColorSwatch from './cable-color-swatch.svelte';

	// A unit's cable colour: its length in the scheme of the org it belongs to
	// (the tape is on the cable, so a lent one shows its owner's colour).
	// Nothing at all for a product without a length, an org without a scheme,
	// or one whose scheme this user may not see. One query for every dot on
	// the page (`getCableColorSchemes`).

	let {
		organizationId,
		lengthCm,
		withName = false
	}: { organizationId: string; lengthCm: number | null | undefined; withName?: boolean } = $props();

	let schemesQuery = $derived(lengthCm ? getCableColorSchemes() : null);
	let bands = $derived(
		schemesQuery?.current?.find((s) => s.organizationId === organizationId)?.bands ?? []
	);
	let band = $derived(cableBandFor(lengthCm, bands));
	let colour = $derived(band ? bandDisplay(band) : null);
</script>

{#if colour}
	{#if withName}
		<span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
			<CableColorSwatch hex={colour.hex} name={colour.name} />{colour.name}
		</span>
	{:else}
		<CableColorSwatch hex={colour.hex} name={colour.name} />
	{/if}
{/if}
