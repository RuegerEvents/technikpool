<script lang="ts">
	import { searchMatcher } from '#lib/search.js';
	// Under the loose units, the catalogue. A kit is usually short of a product
	// the pool knows perfectly well and has no spare unit of — every one of them
	// is already in another case — so the list that ends in "nothing matches"
	// carries on into "register one of these instead". Shared by the bundle page
	// and "Create bundle", so both offer the same way in.
	import { Button } from '#lib/components/ui/button/index.js';
	import { ProductThumb } from '#lib/components/ui/product-thumb/index.js';
	import type { NewAssetSeed } from '#lib/components/ui/new-asset-modal/index.js';
	import { manufacturerSelection } from '#lib/no-manufacturer.svelte.js';
	import { productLabel } from '#lib/product-label.js';
	import { getProducts } from '#lib/remote/assets.remote.js';

	let {
		search,
		allows = () => true,
		disabled = false,
		onregister
	}: {
		/** What was typed into the unit search: the best guess at the product. */
		search: string;
		/** Whether the kit takes a unit of this product (its type's spec). */
		allows?: (productId: string) => boolean;
		disabled?: boolean;
		/** Opens the new-device dialog, seeded with a name or a product. */
		onregister: (seed: string | NewAssetSeed) => void;
	} = $props();

	let catalogueQuery = $derived(getProducts());
	let catalogue = $derived(catalogueQuery.current ?? []);
	let term = $derived(search.trim());
	let matches = $derived.by(() => {
		const matchSearch = searchMatcher(term);
		return (
			catalogue
				.map((p) => ({ ...p, label: productLabel(p) }))
				.filter((p) => matchSearch(p.label, p.caption))
				// Registering a unit straight into the kit answers to the type like
				// every other way in, so the catalogue is cut to the same list.
				.filter((p) => allows(p.id))
		);
	});
</script>

<p class="mt-4 mb-2 text-xs font-medium text-muted-foreground">Register a new unit of…</p>
{#if matches.length === 0}
	{#if term}
		<p class="text-sm text-muted-foreground">No product matches "{term}" either.</p>
	{/if}
	<Button type="button" size="sm" class="mt-3" {disabled} onclick={() => onregister(term)}>
		{term ? `Register "${term}" as a new device` : 'New device'}
	</Button>
{:else}
	<ul class="max-h-56 divide-y overflow-y-auto rounded-md border">
		{#each matches as p (p.id)}
			<li class="flex items-center gap-2 bg-background px-3 py-2">
				<ProductThumb path={p.imagePath} alt={p.name} />
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium">{p.name}</p>
					<p class="text-xs text-muted-foreground">{p.manufacturer?.name}</p>
				</div>
				<Button
					type="button"
					size="sm"
					variant="outline"
					{disabled}
					onclick={() =>
						onregister({
							manufacturer: manufacturerSelection(p.manufacturer),
							product: { id: p.id, name: p.name }
						})}>New</Button
				>
			</li>
		{/each}
	</ul>
{/if}
