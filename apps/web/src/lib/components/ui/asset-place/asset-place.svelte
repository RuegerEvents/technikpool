<script lang="ts">
	import { resolve } from '$app/paths';
	import { MapPin, Truck } from '@lucide/svelte';
	import type { Place } from './asset-place.js';

	// `link: false` inside a row that is itself a link, which can't hold another.
	let { place, link = true }: { place: Place; link?: boolean } = $props();
</script>

<!-- A checked-out unit names its production; its shelf, where it goes back
     to, is on hover. The production stands out from the muted shelf names
     around it, since that is the row someone is looking for. -->
{#if !place}
	—
{:else if place.kind === 'mixed'}
	<span class="opacity-60">Mixed</span>
{:else if place.kind === 'location'}
	<span class="inline-flex items-center gap-1.5">
		<MapPin aria-hidden="true" class="size-3.5 shrink-0" />{place.name}
	</span>
{:else}
	<span
		class="inline-flex items-center gap-1.5 text-foreground"
		title={place.home ? `Checked out · home location: ${place.home}` : 'Checked out'}
	>
		<Truck aria-hidden="true" class="size-3.5 shrink-0" />
		<span class="sr-only">Checked out to</span>
		{#if place.productionId && link}
			<a
				href={resolve(`productions/${place.productionId}`)}
				class="underline-offset-2 hover:underline"
				onclick={(e) => e.stopPropagation()}>{place.name}</a
			>
		{:else}
			{place.name}
		{/if}
	</span>
{/if}
