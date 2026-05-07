<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CreatableSelect } from '$lib/components/ui/creatable-select';
	import { CategorySelect } from '$lib/components/ui/category-select';
	import {
		getManufacturers,
		getCategories,
		getProducts,
		getLocations,
		createAssets
	} from '$lib/remote/assets.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { browser } from '$app/environment';

	let saving = $state(false);
	let selectedOrgId = $state('');
	let locationId = $state('');
	let locations = $derived(selectedOrgId ? await getLocations(selectedOrgId) : []);

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
			locationId = locations[0].id;
		}
	});

	type SelectionOrNew = { id: string | null; name: string } | null;

	let manufacturer = $state<SelectionOrNew>(null);
	let product = $state<SelectionOrNew>(null);
	let manufacturerKey = $state(0);
	let newProductCategoryId = $state('');
	let categories = $derived(await getCategories());

	$effect(() => {
		if (newProductCategoryId) return;
		const misc = categories.find((c) => c.name.toLowerCase() === 'miscellaneous');
		if (misc) newProductCategoryId = misc.id;
	});

	function handleManufacturerChange(sel: SelectionOrNew) {
		manufacturer = sel;
		product = null;
		manufacturerKey++;
	}

	let quantity = $state(1);
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
		product = null;
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
		if (product.id === null && !newProductCategoryId) {
			toast.error('Please select a category');
			return;
		}
		saving = true;
		try {
			const created = await createAssets({
				organizationId: selectedOrgId,
				locationId,
				manufacturerId: manufacturer.id ?? undefined,
				newManufacturerName: manufacturer.id ? undefined : manufacturer.name,
				productId: product.id ?? undefined,
				newProductName: product.id ? undefined : product.name,
				categoryId: product.id ? undefined : newProductCategoryId,
				items: items.map((item) => ({
					serialNumber: item.serialNumber || undefined,
					assetTag: item.assetTag || undefined
				}))
			});
			const count = created.length;
			toast.success(count === 1 ? 'Asset created!' : `${count} assets created!`);
			if (createMore) {
				resetForm();
				saving = false;
			} else goto(resolve(count === 1 ? `/inventory/${created[0].id}` : '/inventory'));
		} catch (err) {
			toast.error((err as Error).message);
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
							{#each orgs as org (org.id)}<option value={org.id}>{org.name}</option>{/each}
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

					{#if manufacturer}
						{#key manufacturerKey}
							{@const products = await getProducts(manufacturer.id ?? undefined)}
							<div class="space-y-2">
								<Label>Product Model</Label>
								<CreatableSelect
									items={products}
									value={product}
									onchange={(sel) => (product = sel)}
									placeholder="Search or create product…"
								/>
							</div>
						{/key}
					{/if}

					{#if product && product.id === null}
						<div class="space-y-2">
							<Label for="category">Category</Label>
							<CategorySelect
								id="category"
								{categories}
								bind:value={newProductCategoryId}
								placeholder="Select a category"
							/>
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

					{#if quantity > 1}
						<div class="overflow-hidden rounded-lg border">
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b bg-muted/40">
										<th class="w-10 px-3 py-2 text-left font-medium text-muted-foreground">#</th>
										<th class="px-3 py-2 text-left font-medium text-muted-foreground">Asset Tag</th>
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
											<td class="px-3 py-2"
												><Input
													bind:value={item.serialNumber}
													placeholder="S/N 123456"
													class="h-8 text-sm"
												/></td
											>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
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
							<Button type="button" variant="outline" href={resolve('/inventory')}>Cancel</Button>
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
