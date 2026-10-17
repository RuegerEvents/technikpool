<script lang="ts">
	// Registering equipment: the full form (see AssetForm), with a choice of
	// organization and location, a tag and serial per unit, and "create
	// another" for working through a delivery.
	import { manufacturerSelection } from '#lib/no-manufacturer.svelte.js';
	import { productLabel } from '#lib/product-label.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { AssetForm } from '#lib/components/asset-form/index.js';
	import { getAsset, getPlaceableLocations, getProducts } from '#lib/remote/assets.remote.js';
	import { getMyOrgs } from '#lib/remote/orgs.remote.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { plural } from '#lib/utils.js';
	import { canManageInventory } from '#lib/roles.js';
	import { browser } from '$app/env';

	// Only the orgs this user may actually register equipment in — being a
	// MEMBER or VIEWER somewhere is no reason to be offered it here, since the
	// server would reject the form on submit.
	let orgsQuery = $derived(getMyOrgs());
	let orgs = $derived((orgsQuery.current ?? []).filter(canManageInventory));
	let organizationId = $state('');
	let locationsQuery = $derived(getPlaceableLocations());
	let locations = $derived(locationsQuery.current);
	let saving = $state(false);
	let quantity = $state(1);
	let form = $state<ReturnType<typeof AssetForm> | null>(null);

	// `?duplicateFrom=` — "More of these" on a unit: org, location, maker and
	// product as that unit's; serial and tag blank.
	let duplicateFromId = $derived(page.url.searchParams.get('duplicateFrom'));
	let duplicateSourceQuery = $derived(duplicateFromId ? getAsset(duplicateFromId) : null);
	let duplicateSource = $derived(duplicateSourceQuery?.current ?? null);

	// `?product=` — "Add devices" on a product's page, and the hint in its
	// Duplicate dialog. Only the product is known, so the org stays whatever the
	// picker defaults to.
	let productFromId = $derived(page.url.searchParams.get('product'));
	let productsQuery = $derived(productFromId ? getProducts() : null);
	let productFrom = $derived(productsQuery?.current?.find((p) => p.id === productFromId) ?? null);

	let prefilled = $state(false);
	$effect(() => {
		if (prefilled || !form) return;
		const source = duplicateSource ?? productFrom;
		if (!source) return;
		if (duplicateSource) {
			// The source may live in an org this user only reads — then the org
			// stays whatever the picker defaulted to, and everything else prefills.
			if (!orgs.some((o) => o.id === duplicateSource.organizationId)) {
				if (!orgsQuery.ready) return;
			} else {
				organizationId = duplicateSource.organizationId;
			}
		}
		const product = duplicateSource ? duplicateSource.product : productFrom!;
		form.reset(
			{
				manufacturer: manufacturerSelection(product.manufacturer),
				product: { id: product.id, name: product.name }
			},
			{ keepPlacement: true }
		);
		prefilled = true;
	});

	let createMore = $state(browser ? localStorage.getItem('asset_create_more') === 'true' : false);
	$effect(() => {
		if (browser) localStorage.setItem('asset_create_more', String(createMore));
	});

	function created(units: { id: string }[]) {
		toast.success(plural(units.length, ['Asset created!', '# assets created!']));
		if (createMore) form?.reset('', { keepPlacement: true });
		else goto(resolve(units.length === 1 ? `assets/${units[0].id}` : 'assets'));
	}
</script>

<svelte:head><title>New Asset | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Add New Asset</h1>
		<p class="text-muted-foreground">Register new equipment into your organization's inventory.</p>
		<p class="mt-1 text-sm text-muted-foreground">
			Registering cables? <a class="underline" href={resolve('assets/new/cables')}
				>Add them by the drawer</a
			> instead — one row per kind, quantities rather than units.
		</p>
	</div>

	{#if duplicateSource}
		<div class="max-w-3xl rounded-md border bg-muted/40 px-4 py-3 text-sm">
			More of <span class="font-medium">{productLabel(duplicateSource.product)}</span>
			— organization, location, manufacturer and product are taken from the unit you came from. Serial
			number and asset tag are left blank.
		</div>
	{/if}

	<!-- The card clips to its rounded corners, cutting off any picker that
	     opens past its edge. Nothing in this one is full-bleed. -->
	<Card.Root class="max-w-3xl overflow-visible">
		<Card.Content class="space-y-6 pt-6">
			{#if orgsQuery.ready && orgs.length === 0}
				<p class="text-sm text-muted-foreground">
					You need admin rights in one of your organizations to register equipment.
				</p>
			{:else}
				<AssetForm
					bind:this={form}
					formId="asset-form"
					{orgs}
					bind:organizationId
					{locations}
					locationId={duplicateSource?.locationId}
					bind:saving
					bind:quantity
					onCreated={created}
				/>

				<div class="flex flex-col gap-4">
					<label class="flex cursor-pointer items-center gap-2 text-sm select-none">
						<input type="checkbox" bind:checked={createMore} class="h-4 w-4 rounded border-input" />
						Create another after saving
					</label>
					<div class="flex flex-row-reverse justify-start gap-4">
						<Button icon="add" type="submit" form="asset-form" disabled={saving}>
							{saving ? 'Saving…' : quantity > 1 ? `Add ${quantity} Assets` : 'Add Asset'}
						</Button>
						<Button icon="close" type="button" variant="outline" href={resolve('assets')}
							>Cancel</Button
						>
					</div>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
