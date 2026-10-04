<script lang="ts">
	// Whether the cables on the list fit the devices on it — see
	// services/connection-check.ts. A hint above the equipment, never a gate,
	// and nothing at all for a production whose devices mark no port required.
	import { getConnectionCheck } from '#lib/remote/productions.remote.js';
	import { plural } from '#lib/utils.js';
	import { ProductThumb } from '#lib/components/ui/product-thumb/index.js';

	let { productionId }: { productionId: string } = $props();

	let checkQuery = $derived(getConnectionCheck(productionId));
	let check = $derived(checkQuery.current);
	let problems = $derived(check ? check.unfed.length + check.unsourced.length : 0);
</script>

{#if check && check.required > 0}
	{#if problems === 0}
		<p class="mb-3 text-sm text-muted-foreground">
			{plural(check.required, [
				'Connections: the one required port has a matching cable.',
				'Connections: all # required ports have a matching cable.'
			])}
		</p>
	{:else}
		<div
			class="mb-3 space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm"
		>
			<p class="font-medium">
				Connections: {check.covered} of {check.required} required ports have a matching cable
			</p>
			<ul class="space-y-1">
				{#each check.unfed as f (f.productName + f.connectors.join())}
					<li class="flex items-start gap-2">
						<ProductThumb path={f.imagePath} alt={f.productName} size={24} />
						<span>
							<span class="font-medium">{f.productName}</span>
							<span class="text-muted-foreground">
								— {f.missing} of {f.needed}
								{f.label ?? ''} ({f.connectors.join(' / ')}) without a cable</span
							>
						</span>
					</li>
				{/each}
				{#each check.unsourced as u (u.connector)}
					<li>
						<span class="font-medium">{u.missing}× {u.connector}</span>
						<span class="text-muted-foreground">
							— cable ends with no free output on the list to plug into</span
						>
					</li>
				{/each}
			</ul>
			<p class="text-xs text-muted-foreground">
				Counted from the connectors marked required on each product. A cable from the venue does not
				show up here.
			</p>
		</div>
	{/if}
{/if}
