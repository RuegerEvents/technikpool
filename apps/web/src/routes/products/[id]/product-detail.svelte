<script lang="ts">
	// One catalog product: everything about it that can be changed — the same
	// editor the /products wizard steps through — and every unit of it this user
	// can see. Where the Devices list and a unit's page lead to when the question
	// is about the model rather than one box of it.
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { ProductThumb } from '$lib/components/ui/product-thumb';
	import { ProductEditor } from '$lib/components/ui/product-editor';
	import { AssetStatusBadge } from '$lib/components/ui/asset-status';
	import {
		getAssets,
		getCategories,
		getManufacturers,
		getProductCatalog,
		getProducts
	} from '$lib/remote/assets.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { orgLabel } from '$lib/utils';

	type Props = { productId: string; isAdmin: boolean; userId: string | undefined };

	let { productId, isAdmin, userId }: Props = $props();

	// The unfiltered catalog and asset list rather than queries of their own:
	// both are what every product and asset mutation already refreshes, so this
	// page stays current without a refresh call anywhere new.
	let catalog = $derived(await getProductCatalog());
	let product = $derived(catalog.find((p) => p.id === productId) ?? null);
	let allAssets = $derived(await getAssets());
	let orgs = $derived(await getMyOrgs());
	let categories = $derived(await getCategories());
	let manufacturers = $derived(await getManufacturers());
	let allProducts = $derived(await getProducts());
	let unitCounts = $derived(new Map(catalog.map((p) => [p.id, p.assetCount])));
	let units = $derived(allAssets.filter((a) => a.productId === productId));
	let severalOrgs = $derived(new Set(units.map((a) => a.organizationId)).size > 1);
</script>

<svelte:head><title>{product?.name ?? 'Product'} | Technikpool</title></svelte:head>

{#if !product}
	<div class="space-y-4">
		<h1 class="text-3xl font-bold tracking-tight">Product not found</h1>
		<p class="text-muted-foreground">It may have been merged into another product or deleted.</p>
		<Button icon="back" variant="outline" href={resolve('/products')}>Back to Products</Button>
	</div>
{:else}
	<div class="space-y-6">
		<div class="flex flex-wrap items-center justify-between gap-4">
			<div class="flex min-w-0 items-center gap-4">
				<ProductThumb path={product.imagePath} alt={product.name} size={56} />
				<div class="min-w-0">
					<h1 class="text-3xl font-bold tracking-tight">{product.name}</h1>
					<p class="text-muted-foreground">{product.manufacturer.name}</p>
				</div>
			</div>
			<Button icon="back" variant="outline" href={resolve('/products')}>Back to Products</Button>
		</div>

		<div class="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
			<ProductEditor
				{product}
				{orgs}
				{categories}
				{manufacturers}
				{allProducts}
				{unitCounts}
				{isAdmin}
				{userId}
				idPrefix="product-page"
				onMerged={(survivorId) => {
					if (survivorId !== productId) goto(resolve(`/products/${survivorId}`));
				}}
				onDeleted={() => goto(resolve('/products'))}
			/>

			<Card.Root class="self-start">
				<Card.Header>
					<Card.Title>Units</Card.Title>
					<Card.Description>
						Every unit of this product in your organizations. Retired units are not listed.
					</Card.Description>
				</Card.Header>
				<Card.Content class="p-0">
					{#if units.length === 0}
						<p class="px-6 pb-6 text-sm text-muted-foreground">
							None of your organizations holds a unit of this product.
						</p>
					{:else}
						<ul class="divide-y border-t">
							{#each units as unit (unit.id)}
								<li>
									<a
										href={resolve(`/assets/${unit.id}`)}
										class="flex items-center gap-3 px-6 py-2.5 text-sm transition-colors hover:bg-muted/40"
									>
										<span class="w-24 shrink-0 truncate font-mono">{unit.assetTag ?? '—'}</span>
										<span class="min-w-0 flex-1 truncate text-muted-foreground">
											{[
												severalOrgs ? orgLabel(unit.organization) : '',
												unit.bundle?.template.name ?? '',
												unit.location?.name ?? '',
												unit.serialNumber ? `SN ${unit.serialNumber}` : ''
											]
												.filter(Boolean)
												.join(' · ')}
										</span>
										<AssetStatusBadge status={unit.status} class="shrink-0" />
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	</div>
{/if}
