<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { cableBandFor } from '#lib/cable-colors.js';
	import { getCableColorSchemes } from '#lib/remote/cable-colors.remote.js';
	import { orgLabel } from '#lib/utils.js';
	import CableColorLegend from './cable-color-legend.svelte';

	// The colour codes behind the cables on a production: one legend per owner
	// whose cables here carry a colour. Lent cables carry their owner's tape,
	// which is the code someone on the job does not know by heart.

	type Unit = {
		organizationId: string;
		organization: { name: string; shortName?: string | null };
		product: { lengthCm: number | null };
	};

	let { units }: { units: readonly Unit[] } = $props();

	let schemesQuery = $derived(getCableColorSchemes());
	let legends = $derived.by(() => {
		const schemes = schemesQuery.current ?? [];
		const owners: Record<string, string> = {};
		for (const unit of units) {
			const bands = schemes.find((s) => s.organizationId === unit.organizationId)?.bands ?? [];
			if (cableBandFor(unit.product.lengthCm, bands)) {
				owners[unit.organizationId] = orgLabel(unit.organization);
			}
		}
		return Object.entries(owners).map(([organizationId, name]) => ({
			organizationId,
			name,
			bands: schemes.find((s) => s.organizationId === organizationId)?.bands ?? []
		}));
	});
</script>

{#if legends.length > 0}
	<Card.Root>
		<Card.Header>
			<Card.Title>Cable colours</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-3">
			{#each legends as legend (legend.organizationId)}
				<div class="space-y-1">
					<p class="text-xs font-medium text-muted-foreground">{legend.name}</p>
					<CableColorLegend bands={legend.bands} />
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
{/if}
