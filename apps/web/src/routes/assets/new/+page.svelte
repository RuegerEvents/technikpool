<script lang="ts">
	import {
		manufacturerIdOf,
		manufacturerSelection,
		withNoManufacturer
	} from '$lib/no-manufacturer.svelte';
	import { productLabel } from '$lib/product-label';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Modal } from '$lib/components/ui/modal';
	import { Input } from '$lib/components/ui/input';
	import SerialNumberWarning from '$lib/components/SerialNumberWarning.svelte';
	import { Label } from '$lib/components/ui/label';
	import { CreatableSelect } from '$lib/components/ui/creatable-select';
	import { ImageUpload } from '$lib/components/ui/image-upload';
	import {
		ProductFields,
		cableInputFrom,
		type ProductDraft
	} from '$lib/components/ui/product-fields';
	import {
		getManufacturers,
		getCategories,
		getProducts,
		getLocations,
		getAsset,
		getProductAccessoryProfile,
		createAssets
	} from '$lib/remote/assets.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { plural, getErrorMessage, orgLabel } from '$lib/utils';
	import { canManageInventory } from '$lib/roles';
	import { browser } from '$app/environment';

	let saving = $state(false);
	// Only the orgs this user may actually register equipment in — being a
	// MEMBER or VIEWER somewhere is no reason to be offered it here, since the
	// server would reject the form on submit.
	let orgsQuery = $derived(getMyOrgs());
	let orgs = $derived((orgsQuery.current ?? []).filter(canManageInventory));
	let selectedOrgId = $state('');
	let locationId = $state('');
	let locationsQuery = $derived(selectedOrgId ? getLocations(selectedOrgId) : null);
	let locations = $derived(locationsQuery?.current ?? []);

	let duplicateFromId = $derived(page.url.searchParams.get('duplicateFrom'));
	let duplicateSourceQuery = $derived(duplicateFromId ? getAsset(duplicateFromId) : null);
	let duplicateSource = $derived(duplicateSourceQuery?.current ?? null);

	$effect(() => {
		if (!selectedOrgId) {
			locationId = '';
			return;
		}
		if (locations.length === 0) {
			locationId = '';
			return;
		}
		if (!locationId || !locations.some((l) => l.id === locationId)) {
			const preferred = duplicateSource?.locationId;
			locationId =
				preferred && locations.some((l) => l.id === preferred) ? preferred : locations[0].id;
		}
	});

	type SelectionOrNew = { id: string; name: string } | { id: null; name: string } | null;

	let manufacturer = $state<SelectionOrNew>(null);
	let newManufacturerLogoPath = $state('');
	let product = $state<SelectionOrNew>(null);
	let categoriesQuery = $derived(getCategories());
	let categories = $derived(categoriesQuery.current ?? []);

	let duplicatePrefilled = $state(false);
	$effect(() => {
		if (!duplicateSource || duplicatePrefilled) return;
		// The source may live in an org this user only reads — then the org
		// stays whatever the picker defaulted to, and everything else prefills.
		if (orgs.some((o) => o.id === duplicateSource.organizationId)) {
			selectedOrgId = duplicateSource.organizationId;
		}
		manufacturer = manufacturerSelection(duplicateSource.product.manufacturer);
		product = { id: duplicateSource.productId, name: duplicateSource.product.name };
		duplicatePrefilled = true;
	});

	// New product modal state. The draft is a bare ProductDraft so ProductFields
	// can bind to it — whether the modal is open is this page's business, not
	// the product's.
	//
	// A fresh object every time, and every field of it: the modal's contents live
	// out here rather than in the Modal, so `{#if open}` tearing the form down
	// leaves this untouched. Carrying the last product's photo, price or category
	// into the next one is how registering two devices in a row used to put the
	// first one's picture on the second.
	function emptyProductDraft(): ProductDraft {
		return {
			name: '',
			categoryId: '',
			imagePath: '',
			netPurchasePrice: undefined,
			cable: null,
			isLicense: false
		};
	}

	let newProductOpen = $state(false);
	let newProductDraft = $state<ProductDraft>(emptyProductDraft());

	$effect(() => {
		if (newProductDraft.categoryId) return;
		const misc = categories.find((c) => c.name.toLowerCase() === 'miscellaneous');
		if (misc) newProductDraft.categoryId = misc.id;
	});

	let pendingProduct = $state<ProductDraft | null>(null);

	let manufacturerKey = $state(0);

	function handleManufacturerChange(sel: SelectionOrNew) {
		manufacturer = sel;
		product = null;
		pendingProduct = null;
		manufacturerKey++;
	}

	function handleProductCreate(name: string) {
		// A fresh object, not a mutation: ProductFields keys its "is the name still
		// the derived one?" bookkeeping to the draft it was handed. Only the typed
		// name comes across; the category is filled back in by the effect above.
		newProductDraft = { ...emptyProductDraft(), name };
		newProductOpen = true;
	}

	function confirmNewProduct() {
		if (!newProductDraft.categoryId) {
			toast.error('Please select a category');
			return;
		}
		product = { id: null, name: newProductDraft.name };
		pendingProduct = { ...newProductDraft };
		// A cable almost never carries a sticker — the batch form starts untagged
		// for the same reason. Only set on the way in, so unticking it sticks.
		// A license has nothing to stick one on.
		if (cableInputFrom(newProductDraft.cable) || newProductDraft.isLicense) noAssetTag = true;
		newProductOpen = false;
	}

	function cancelNewProduct() {
		newProductOpen = false;
	}

	// What the org's existing units of the chosen product carry. A fixture is
	// registered without its brackets far more often than someone means to leave
	// them off — nothing about the unit looks wrong afterwards — so this is asked
	// here, at the one moment anyone knows the answer.
	let accessoryProfile = $derived(
		selectedOrgId && product?.id
			? await getProductAccessoryProfile({
					productId: product.id,
					organizationId: selectedOrgId
				})
			: null
	);
	let accessorySummary = $derived(
		accessoryProfile?.accessories.map((a) => `${a.perUnit}× ${a.name}`).join(' · ') ?? ''
	);
	let copyAccessories = $state(true);
	// Where those copies come from — the same choice the asset page's fan-out
	// offers, with the opposite default: a unit being registered now is usually a
	// delivery, and a delivery arrives with its own cables.
	let reuseAccessories = $state(false);
	let reusableSummary = $derived(
		accessoryProfile?.accessories
			.filter((a) => a.freeStock > 0)
			.map((a) => `${a.freeStock}× ${a.name}`)
			.join(' · ') ?? ''
	);

	let quantity = $state(1);
	let noAssetTag = $state(false);
	let items = $state<{ serialNumber: string; assetTag: string }[]>([
		{ serialNumber: '', assetTag: '' }
	]);

	function setQuantity(n: number) {
		const clamped = Math.max(1, Math.min(50, n));
		quantity = clamped;
		if (clamped > items.length) {
			while (items.length < clamped) items.push({ serialNumber: '', assetTag: '' });
		} else {
			items = items.slice(0, clamped);
		}
	}

	let createMore = $state(browser ? localStorage.getItem('asset_create_more') === 'true' : false);

	$effect(() => {
		if (browser) localStorage.setItem('asset_create_more', String(createMore));
	});

	function resetForm() {
		manufacturer = null;
		newManufacturerLogoPath = '';
		copyAccessories = true;
		reuseAccessories = false;
		product = null;
		pendingProduct = null;
		// "Create another" never navigates, so nothing here is torn down and
		// remounted the way a fresh page load would do it — every field the form
		// owns has to be put back by hand. The draft and the untagged tick are the
		// two that outlived it: a cable turns `noAssetTag` on for itself, and the
		// next device would have registered without a sticker for no stated reason.
		newProductOpen = false;
		newProductDraft = emptyProductDraft();
		noAssetTag = false;
		manufacturerKey++;
		items = Array.from({ length: quantity }, () => ({ serialNumber: '', assetTag: '' }));
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!locationId) {
			toast.error('Please select a location');
			return;
		}
		if (!manufacturer) {
			toast.error('Please select a manufacturer');
			return;
		}
		if (!product) {
			toast.error('Please select a product');
			return;
		}
		if (product.id === null && !pendingProduct?.categoryId) {
			toast.error('Please complete the new product details');
			return;
		}

		saving = true;
		try {
			const created = await createAssets({
				organizationId: selectedOrgId,
				locationId,
				manufacturerId: manufacturerIdOf(manufacturer) ?? undefined,
				newManufacturerName: manufacturer.id ? undefined : manufacturer.name,
				newManufacturerLogoPath: manufacturer.id ? undefined : newManufacturerLogoPath || undefined,
				productId: product.id ?? undefined,
				newProductName: product.id ? undefined : (pendingProduct?.name ?? product.name),
				newProductImagePath: product.id ? undefined : pendingProduct?.imagePath || undefined,
				newProductNetPurchasePrice: product.id ? undefined : pendingProduct?.netPurchasePrice,
				newProductCable: product.id ? undefined : cableInputFrom(pendingProduct?.cable ?? null),
				newProductIsLicense: product.id ? undefined : pendingProduct?.isLicense || undefined,
				categoryId: product.id ? undefined : pendingProduct?.categoryId,
				copyProductAccessories:
					copyAccessories && (accessoryProfile?.accessories.length ?? 0) > 0 ? true : undefined,
				reuseExistingAccessories:
					copyAccessories && reuseAccessories && reusableSummary ? true : undefined,
				items: items.map((item) => ({
					serialNumber: item.serialNumber || undefined,
					assetTag: noAssetTag ? undefined : item.assetTag || undefined,
					noAssetTag: noAssetTag || undefined
				}))
			});

			const count = created.length;
			toast.success(plural(count, ['Asset created!', '# assets created!']));

			if (createMore) {
				resetForm();
				saving = false;
			} else {
				goto(resolve(count === 1 ? `/assets/${created[0].id}` : '/assets'));
			}
		} catch (err) {
			toast.error(getErrorMessage(err));
			saving = false;
		}
	}
</script>

<svelte:head><title>New Asset | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Add New Asset</h1>
		<p class="text-muted-foreground">Register new equipment into your organization's inventory.</p>
		<p class="mt-1 text-sm text-muted-foreground">
			Registering cables? <a class="underline" href={resolve('/assets/new/cables')}
				>Add them by the drawer</a
			> instead — one row per kind, quantities rather than units.
		</p>
	</div>

	{#if duplicateSource}
		<div class="max-w-3xl rounded-md border bg-muted/40 px-4 py-3 text-sm">
			Duplicating <span class="font-medium">{productLabel(duplicateSource.product)}</span>
			— organization, location, manufacturer and product are prefilled. Serial number and asset tag are
			left blank.
		</div>
	{/if}

	<!-- The card clips to its rounded corners, cutting off any picker that
	     opens past its edge. Nothing in this one is full-bleed. -->
	<Card.Root class="max-w-3xl overflow-visible">
		<Card.Content class="pt-6">
			{#if orgs.length === 0}
				<p class="text-sm text-muted-foreground">
					You need admin rights in one of your organizations to register equipment.
				</p>
			{:else}
				{#if !selectedOrgId && orgs[0]}{((selectedOrgId = orgs[0].id), '')}{/if}
				{@const orgPrefix = orgs.find((o) => o.id === selectedOrgId)?.assetIdPrefix ?? null}
				<form onsubmit={handleSubmit} class="space-y-6">
					<div class="space-y-2">
						<Label for="org">Organization</Label>
						<select
							id="org"
							bind:value={selectedOrgId}
							required
							class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
						>
							{#each orgs as org (org.id)}<option value={org.id}>{orgLabel(org)}</option>{/each}
						</select>
					</div>

					{#if selectedOrgId}
						<div class="space-y-2">
							<Label for="location">Location</Label>
							<select
								id="location"
								bind:value={locationId}
								required
								class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
							>
								{#if locations.length === 0}
									<option value="" disabled>—</option>
								{:else}
									{#each locations as loc (loc.id)}
										{@const city = loc.address?.city?.trim()}
										{@const line1 = loc.address?.line1?.trim()}
										{@const addrParts = [line1, city].filter(Boolean).join(', ')}
										<option value={loc.id}
											>{addrParts ? `${loc.name} (${addrParts})` : loc.name}</option
										>
									{/each}
								{/if}
							</select>
							{#if locations.length === 0}
								<p class="text-sm text-muted-foreground">
									No locations yet. Create one in
									<a class="underline" href={resolve(`/orgs/${selectedOrgId}/locations`)}
										>Locations</a
									>.
								</p>
							{/if}
						</div>
					{/if}

					{#if true}
						{@const manufacturersQuery = getManufacturers()}
						{@const manufacturers = manufacturersQuery.current ?? []}
						<div class="space-y-2">
							<Label>Manufacturer</Label>
							<CreatableSelect
								items={withNoManufacturer(manufacturers)}
								value={manufacturer}
								onchange={handleManufacturerChange}
								placeholder="Search or create manufacturer…"
							/>
						</div>
					{/if}

					{#if manufacturer && manufacturer.id === null}
						<div class="space-y-2">
							<Label>Manufacturer logo</Label>
							<ImageUpload bind:value={newManufacturerLogoPath} label="Manufacturer logo" />
						</div>
					{/if}

					<!-- A manufacturer typed in just now has no products yet. -->
					{#if manufacturer}
						{#key manufacturerKey}
							{@const manufacturerId = manufacturerIdOf(manufacturer)}
							{@const productsQuery =
								manufacturerId === undefined ? null : getProducts(manufacturerId)}
							{@const products = productsQuery?.current ?? []}
							<div class="space-y-2">
								<Label>Product Model</Label>
								<CreatableSelect
									items={products}
									value={product}
									onchange={(sel) => {
										product = sel;
										pendingProduct = null;
									}}
									oncreate={handleProductCreate}
									placeholder="Search or create product…"
								/>
								{#if product && product.id === null && pendingProduct}
									<p class="text-xs text-muted-foreground">
										New product · {categories.find((c) => c.id === pendingProduct?.categoryId)
											?.name ?? ''}
										{#if pendingProduct.imagePath}· has image{/if}
									</p>
								{/if}
							</div>
						{/key}
					{/if}

					{#if accessoryProfile && accessoryProfile.accessories.length > 0}
						<div class="space-y-2 rounded-md border border-dashed p-3">
							<label class="flex cursor-pointer items-start gap-2 text-sm select-none">
								<input
									type="checkbox"
									bind:checked={copyAccessories}
									class="mt-0.5 h-4 w-4 rounded border-input"
								/>
								<span>
									Also create the accessories the other units carry
									<span class="block text-xs text-muted-foreground">
										{accessorySummary} — each new unit gets its own, attached.
									</span>
								</span>
							</label>
							{#if copyAccessories && reusableSummary}
								<label class="flex cursor-pointer items-start gap-2 pl-6 text-sm select-none">
									<input
										type="checkbox"
										bind:checked={reuseAccessories}
										class="mt-0.5 h-4 w-4 rounded border-input"
									/>
									<span>
										Take them out of stock where the pool has them
										<span class="block text-xs text-muted-foreground">
											Free right now: {reusableSummary}. Anything the shelf can't cover is still
											registered new.
										</span>
									</span>
								</label>
							{/if}
						</div>
					{/if}

					<div class="space-y-2">
						<Label for="quantity">Quantity</Label>
						<Input
							id="quantity"
							type="number"
							min="1"
							max="50"
							value={quantity}
							oninput={(e) => setQuantity(Number((e.target as HTMLInputElement).value))}
							class="w-24"
						/>
					</div>

					<label class="flex cursor-pointer items-center gap-2 text-sm select-none">
						<input type="checkbox" bind:checked={noAssetTag} class="h-4 w-4 rounded border-input" />
						No asset tag (e.g. cables, consumables)
					</label>

					{#if quantity > 1}
						{#if !noAssetTag}
							<div class="overflow-x-auto rounded-lg border">
								<table class="w-full text-sm">
									<thead>
										<tr class="border-b bg-muted/40">
											<th class="w-10 px-3 py-2 text-left font-medium text-muted-foreground">#</th>
											<th class="px-3 py-2 text-left font-medium text-muted-foreground"
												>Asset Tag</th
											>
											<th class="px-3 py-2 text-left font-medium text-muted-foreground"
												>Serial Number</th
											>
										</tr>
									</thead>
									<tbody>
										{#each items as item, i (i)}
											<tr class="border-b last:border-0">
												<td class="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
												<td class="px-3 py-2">
													<Input
														bind:value={item.assetTag}
														placeholder={orgPrefix
															? `${orgPrefix}${String(i + 1).padStart(5, '0')}`
															: 'TAG-001'}
														class="h-8 font-mono text-sm"
													/>
												</td>
												<td class="px-3 py-2">
													<Input
														bind:value={item.serialNumber}
														placeholder="S/N 123456"
														class="h-8 text-sm"
													/>
													<SerialNumberWarning serialNumber={item.serialNumber} />
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					{:else if !noAssetTag}
						<div class="grid grid-cols-2 gap-3">
							<div class="col-span-2 space-y-2">
								<Label for="tag-0">Asset Tag</Label>
								<Input
									id="tag-0"
									bind:value={items[0].assetTag}
									placeholder={orgPrefix
										? `${orgPrefix}00001 (leave blank to auto-generate)`
										: 'TAG-001'}
									class="font-mono"
								/>
							</div>
							<div class="col-span-2 space-y-2">
								<Label for="serial-0">Serial Number</Label>
								<Input id="serial-0" bind:value={items[0].serialNumber} placeholder="S/N 123456" />
								<SerialNumberWarning serialNumber={items[0].serialNumber} />
							</div>
						</div>
					{/if}

					<div class="flex flex-col gap-4 pt-2">
						<label class="flex cursor-pointer items-center gap-2 text-sm select-none">
							<input
								type="checkbox"
								bind:checked={createMore}
								class="h-4 w-4 rounded border-input"
							/>
							Create another after saving
						</label>
						<div class="flex justify-end gap-4">
							<Button icon="close" type="button" variant="outline" href={resolve('/assets')}
								>Cancel</Button
							>
							<Button icon="add" type="submit" disabled={saving}>
								{saving ? 'Saving…' : quantity > 1 ? `Add ${quantity} Assets` : 'Add Asset'}
							</Button>
						</div>
					</div>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<Modal bind:open={newProductOpen} title="Create New Product" size="xl" onclose={cancelNewProduct}>
	{#snippet description()}
		Fill in the details for the new product model.
	{/snippet}
	<!-- The same four fields the product page and the asset detail page edit.
		     One component, so a field added there shows up here too. -->
	{#snippet children()}
		<ProductFields {categories} bind:value={newProductDraft} idPrefix="modal-product" />
	{/snippet}

	{#snippet footer()}
		<Button icon="close" type="button" variant="outline" onclick={cancelNewProduct}>Cancel</Button>
		<Button icon="add" type="button" onclick={confirmNewProduct}>Add Product</Button>
	{/snippet}
</Modal>
