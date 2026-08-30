<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CreatableSelect } from '$lib/components/ui/creatable-select';
	import { ImageUpload } from '$lib/components/ui/image-upload';
	import { ProductFields, type ProductDraft } from '$lib/components/ui/product-fields';
	import {
		getManufacturers,
		getCategories,
		getProducts,
		getLocations,
		getAsset,
		createAssets
	} from '$lib/remote/assets.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { plural, getErrorMessage, orgLabel } from '$lib/utils';
	import { browser } from '$app/environment';

	let saving = $state(false);
	let selectedOrgId = $state('');
	let locationId = $state('');
	let locations = $derived(selectedOrgId ? await getLocations(selectedOrgId) : []);

	let duplicateFromId = $derived(page.url.searchParams.get('duplicateFrom'));
	let duplicateSource = $derived(duplicateFromId ? await getAsset(duplicateFromId) : null);

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
	let categories = $derived(await getCategories());

	let duplicatePrefilled = $state(false);
	$effect(() => {
		if (!duplicateSource || duplicatePrefilled) return;
		selectedOrgId = duplicateSource.organizationId;
		manufacturer = {
			id: duplicateSource.product.manufacturerId,
			name: duplicateSource.product.manufacturer.name
		};
		product = { id: duplicateSource.productId, name: duplicateSource.product.name };
		duplicatePrefilled = true;
	});

	// New product modal state. The draft is a bare ProductDraft so ProductFields
	// can bind to it — whether the modal is open is this page's business, not
	// the product's.
	let newProductOpen = $state(false);
	let newProductDraft = $state<ProductDraft>({
		name: '',
		categoryId: '',
		imagePath: '',
		netPurchasePrice: ''
	});

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
		newProductDraft.name = name;
		newProductOpen = true;
	}

	function confirmNewProduct() {
		if (!newProductDraft.categoryId) {
			toast.error('Please select a category');
			return;
		}
		product = { id: null, name: newProductDraft.name };
		pendingProduct = { ...newProductDraft };
		newProductOpen = false;
	}

	function cancelNewProduct() {
		newProductOpen = false;
	}

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
		product = null;
		pendingProduct = null;
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
				manufacturerId: manufacturer.id ?? undefined,
				newManufacturerName: manufacturer.id ? undefined : manufacturer.name,
				newManufacturerLogoPath: manufacturer.id ? undefined : newManufacturerLogoPath || undefined,
				productId: product.id ?? undefined,
				newProductName: product.id ? undefined : (pendingProduct?.name ?? product.name),
				newProductImagePath: product.id ? undefined : pendingProduct?.imagePath || undefined,
				newProductNetPurchasePrice:
					product.id || !pendingProduct?.netPurchasePrice?.trim()
						? undefined
						: Number(pendingProduct.netPurchasePrice),
				categoryId: product.id ? undefined : pendingProduct?.categoryId,
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
	</div>

	{#if duplicateSource}
		<div class="max-w-3xl rounded-md border bg-muted/40 px-4 py-3 text-sm">
			Duplicating <span class="font-medium"
				>{duplicateSource.product.manufacturer.name} {duplicateSource.product.name}</span
			>
			— organization, location, manufacturer and product are prefilled. Serial number and asset tag are
			left blank.
		</div>
	{/if}

	<Card.Root class="max-w-3xl">
		<Card.Content class="pt-6">
			{#if true}
				{@const orgs = await getMyOrgs()}
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
						{@const manufacturers = await getManufacturers()}
						<div class="space-y-2">
							<Label>Manufacturer</Label>
							<CreatableSelect
								items={manufacturers}
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

					{#if manufacturer}
						{#key manufacturerKey}
							{@const products = await getProducts(manufacturer.id ?? undefined)}
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
							<div class="overflow-hidden rounded-lg border">
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
							<Button type="button" variant="outline" href={resolve('/assets')}>Cancel</Button>
							<Button type="submit" disabled={saving}>
								{saving ? 'Saving…' : quantity > 1 ? `Add ${quantity} Assets` : 'Add Asset'}
							</Button>
						</div>
					</div>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<!-- New Product Modal -->
{#if newProductOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		onkeydown={(e) => e.key === 'Escape' && cancelNewProduct()}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="mx-4 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg"
			onkeydown={(e) => e.stopPropagation()}
		>
			<h2 class="mb-1 text-lg font-semibold">Create New Product</h2>
			<p class="mb-5 text-sm text-muted-foreground">
				Fill in the details for the new product model.
			</p>

			<!-- The same four fields the product page and the asset detail page edit.
			     One component, so a field added there shows up here too. -->
			<ProductFields {categories} bind:value={newProductDraft} idPrefix="modal-product" />

			<div class="mt-6 flex justify-end gap-3">
				<Button type="button" variant="outline" onclick={cancelNewProduct}>Cancel</Button>
				<Button type="button" onclick={confirmNewProduct}>Add Product</Button>
			</div>
		</div>
	</div>
{/if}
