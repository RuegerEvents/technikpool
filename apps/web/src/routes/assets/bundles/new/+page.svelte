<script lang="ts">
	import { getErrorMessage, orgLabel } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CreatableSelect } from '$lib/components/ui/creatable-select';
	import { CategorySelect } from '$lib/components/ui/category-select';
	import { Dialog } from 'bits-ui';
	import {
		getAssets,
		getCategories,
		getManufacturers,
		getLocations,
		getProducts,
		getBundleTemplates,
		createAssets,
		createBundleInstance,
		addAssetToBundle
	} from '$lib/remote/assets.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { AssetStatusBadge } from '$lib/components/ui/asset-status';

	// Bundle fields
	type SelectionOrNew = { id: string | null; name: string } | null;

	let bundleType = $state<SelectionOrNew>(null);
	let bundleTag = $state('');
	let bundleDescription = $state('');
	let selectedOrgId = $state('');
	let bundleCategoryId = $state('');
	let saving = $state(false);

	// Asset picker
	let assetSearch = $state('');

	type SelectedAsset = {
		id: string;
		productName: string;
		manufacturerName: string;
		serialNumber: string | null;
		assetTag: string | null;
		status: string;
	};

	let selectedAssets = $state<SelectedAsset[]>([]);

	// Remote data
	let orgs = $derived(await getMyOrgs());
	let manufacturers = $derived(await getManufacturers());
	let categories = $derived(await getCategories());
	let bundleTypes = $derived(selectedOrgId ? await getBundleTemplates(selectedOrgId) : []);

	let isNewBundleType = $derived(bundleType !== null && bundleType.id === null);

	$effect(() => {
		if (!isNewBundleType || bundleCategoryId) return;
		const misc = categories.find((c) => c.name.toLowerCase() === 'miscellaneous');
		if (misc) bundleCategoryId = misc.id;
	});

	$effect(() => {
		if (!selectedOrgId && orgs[0]) selectedOrgId = orgs[0].id;
	});

	let availableAssets = $derived(selectedOrgId ? await getAssets(selectedOrgId) : []);
	let orgLocations = $derived(selectedOrgId ? await getLocations(selectedOrgId) : []);
	let selectedIds = $derived(new Set(selectedAssets.map((a) => a.id)));

	type ExistingAsset = (typeof availableAssets)[number];

	let filteredAvailable = $derived(
		availableAssets.filter((a) => {
			if (selectedIds.has(a.id)) return false;
			// A unit belongs to one kit at a time, so one already in a bundle isn't
			// on offer here — same rule the bundle detail page's picker applies.
			if (a.bundleId) return false;
			if (!assetSearch.trim()) return true;
			const q = assetSearch.toLowerCase();
			return (
				a.product.name.toLowerCase().includes(q) ||
				a.product.manufacturer.name.toLowerCase().includes(q) ||
				(a.serialNumber?.toLowerCase().includes(q) ?? false) ||
				(a.assetTag?.toLowerCase().includes(q) ?? false)
			);
		})
	);

	function addExisting(a: ExistingAsset) {
		selectedAssets = [
			...selectedAssets,
			{
				id: a.id,
				productName: a.product.name,
				manufacturerName: a.product.manufacturer.name,
				serialNumber: a.serialNumber,
				assetTag: a.assetTag,
				status: a.status
			}
		];
	}

	function removeSelected(id: string) {
		selectedAssets = selectedAssets.filter((a) => a.id !== id);
	}

	// New asset modal
	let showModal = $state(false);
	let modalLocationId = $state('');
	let modalManufacturer = $state<SelectionOrNew>(null);
	let modalProduct = $state<SelectionOrNew>(null);
	let modalCategoryId = $state('');
	let modalManufacturerKey = $state(0);
	let modalSerial = $state('');
	let modalTag = $state('');
	let modalSaving = $state(false);

	let modalProducts = $derived(
		modalManufacturer?.id ? await getProducts(modalManufacturer.id) : []
	);

	$effect(() => {
		if (!selectedOrgId) {
			modalLocationId = '';
			return;
		}
		if (orgLocations.length === 0) {
			modalLocationId = '';
			return;
		}
		if (!modalLocationId || !orgLocations.some((l) => l.id === modalLocationId)) {
			modalLocationId = orgLocations[0].id;
		}
	});

	function handleModalManufacturerChange(sel: SelectionOrNew) {
		modalManufacturer = sel;
		modalProduct = null;
		modalManufacturerKey++;
	}

	function resetModal() {
		modalManufacturer = null;
		modalProduct = null;
		modalCategoryId = '';
		modalManufacturerKey++;
		modalSerial = '';
		modalTag = '';
	}

	$effect(() => {
		if (modalCategoryId) return;
		const misc = categories.find((c) => c.name.toLowerCase() === 'miscellaneous');
		if (misc) modalCategoryId = misc.id;
	});

	async function handleNewAsset(e: Event) {
		e.preventDefault();
		if (!modalLocationId) {
			toast.error('Please select a location');
			return;
		}
		if (!modalManufacturer || !modalProduct) {
			toast.error('Please select a manufacturer and product');
			return;
		}
		if (modalProduct.id === null && !modalCategoryId) {
			toast.error('Please select a category');
			return;
		}
		modalSaving = true;
		try {
			const created = await createAssets({
				organizationId: selectedOrgId,
				locationId: modalLocationId,
				manufacturerId: modalManufacturer.id ?? undefined,
				newManufacturerName: modalManufacturer.id ? undefined : modalManufacturer.name,
				productId: modalProduct.id ?? undefined,
				newProductName: modalProduct.id ? undefined : modalProduct.name,
				categoryId: modalProduct.id ? undefined : modalCategoryId,
				items: [{ serialNumber: modalSerial || undefined, assetTag: modalTag || undefined }]
			});
			const asset = created[0];
			selectedAssets = [
				...selectedAssets,
				{
					id: asset.id,
					productName: asset.product.name,
					manufacturerName: asset.product.manufacturer.name,
					serialNumber: asset.serialNumber,
					assetTag: asset.assetTag,
					status: asset.status
				}
			];
			resetModal();
			showModal = false;
			toast.success('Asset created and added to bundle');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			modalSaving = false;
		}
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!bundleType || !bundleType.name.trim() || !selectedOrgId) return;
		if (isNewBundleType && !bundleCategoryId) {
			toast.error('Please select a category');
			return;
		}
		saving = true;
		try {
			const bundle = await createBundleInstance({
				organizationId: selectedOrgId,
				templateId: bundleType.id ?? undefined,
				newTemplateName: bundleType.id ? undefined : bundleType.name.trim(),
				description: isNewBundleType ? bundleDescription.trim() || undefined : undefined,
				categoryId: isNewBundleType ? bundleCategoryId : undefined,
				tag: bundleTag.trim() || undefined
			});
			await Promise.all(
				selectedAssets.map((a) => addAssetToBundle({ bundleId: bundle.id, assetId: a.id }))
			);
			toast.success('Bundle created!');
			goto(resolve(`/assets/bundles/${bundle.id}`));
		} catch (err) {
			toast.error(getErrorMessage(err));
			saving = false;
		}
	}
</script>

<svelte:head><title>Create Bundle | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div>
		<Button variant="ghost" href={resolve('/assets')} class="mb-2 -ml-3">
			← Back to Inventory
		</Button>
		<h1 class="text-3xl font-bold tracking-tight">Create Bundle</h1>
	</div>

	<form onsubmit={handleSubmit} class="space-y-6">
		<!-- Bundle details -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Bundle Details</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="bundle-org">Organization</Label>
						<select
							id="bundle-org"
							bind:value={selectedOrgId}
							required
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
						>
							{#each orgs as org (org.id)}<option value={org.id}>{orgLabel(org)}</option>{/each}
						</select>
					</div>
					<div class="space-y-2">
						<Label>Bundle Type</Label>
						<CreatableSelect
							items={bundleTypes}
							bind:value={bundleType}
							placeholder="Search or create bundle type…"
						/>
					</div>
					{#if isNewBundleType}
						<div class="space-y-2">
							<Label for="bundle-category">Category</Label>
							<CategorySelect
								id="bundle-category"
								{categories}
								bind:value={bundleCategoryId}
								placeholder="Select a category"
							/>
						</div>
					{/if}
					<div class="space-y-2">
						<Label for="bundle-tag">Tag <span class="text-muted-foreground">(optional)</span></Label
						>
						<Input id="bundle-tag" bind:value={bundleTag} placeholder="e.g. Kit A" />
						<p class="text-xs text-muted-foreground">
							Distinguishes this physical instance from others of the same type.
						</p>
					</div>
				</div>
				{#if isNewBundleType}
					<div class="space-y-2">
						<Label for="bundle-desc"
							>Description <span class="text-muted-foreground">(optional)</span></Label
						>
						<Input
							id="bundle-desc"
							bind:value={bundleDescription}
							placeholder="What's in this bundle?"
						/>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- Assets -->
		<Card.Root>
			<Card.Header>
				<div class="flex items-center justify-between">
					<div>
						<Card.Title>Assets</Card.Title>
						<Card.Description>Add existing assets or create new ones.</Card.Description>
					</div>
					<Button
						type="button"
						variant="outline"
						disabled={!selectedOrgId}
						onclick={() => (showModal = true)}
					>
						+ New Asset
					</Button>
				</div>
			</Card.Header>
			<Card.Content class="space-y-4">
				<!-- Selected assets -->
				{#if selectedAssets.length > 0}
					<div>
						<p class="mb-2 text-sm font-medium">
							Selected <span class="text-muted-foreground">({selectedAssets.length})</span>
						</p>
						<div class="rounded-md border">
							<table class="w-full text-sm">
								<tbody>
									{#each selectedAssets as asset (asset.id)}
										<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
											<td class="px-3 py-2 font-medium">{asset.productName}</td>
											<td class="px-3 py-2 text-muted-foreground">{asset.manufacturerName}</td>
											<td class="px-3 py-2 font-mono text-xs">{asset.serialNumber ?? '—'}</td>
											<td class="px-3 py-2">
												<AssetStatusBadge status={asset.status} />
											</td>
											<td class="px-3 py-2 text-right">
												<button
													type="button"
													onclick={() => removeSelected(asset.id)}
													class="text-xs text-muted-foreground hover:text-destructive"
												>
													Remove
												</button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/if}

				<!-- Picker -->
				<div>
					<input
						type="search"
						bind:value={assetSearch}
						placeholder="Search existing assets…"
						class="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
					/>
					{#if filteredAvailable.length > 0}
						<div class="mt-2 max-h-60 overflow-y-auto rounded-md border">
							<table class="w-full text-sm">
								<thead class="sticky top-0 bg-muted/80 backdrop-blur-sm">
									<tr class="border-b">
										<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
											>Product</th
										>
										<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
											>S/N</th
										>
										<th class="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
											>Status</th
										>
										<th class="px-3 py-2"></th>
									</tr>
								</thead>
								<tbody>
									{#each filteredAvailable as asset (asset.id)}
										<tr class="border-b bg-background last:border-0 hover:bg-muted/30">
											<td class="px-3 py-2">
												<p class="font-medium">{asset.product.name}</p>
												<p class="text-xs text-muted-foreground">
													{asset.product.manufacturer.name}
												</p>
											</td>
											<td class="px-3 py-2 font-mono text-xs">{asset.serialNumber ?? '—'}</td>
											<td class="px-3 py-2">
												<AssetStatusBadge status={asset.status} />
											</td>
											<td class="px-3 py-2 text-right">
												<Button size="sm" type="button" onclick={() => addExisting(asset)}
													>Add</Button
												>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else if selectedOrgId && availableAssets.length > 0}
						<p class="mt-2 text-sm text-muted-foreground">No assets match your search.</p>
					{:else if selectedOrgId}
						<p class="mt-2 text-sm text-muted-foreground">
							No assets in this organization yet. Use "+ New Asset" to create one.
						</p>
					{/if}
				</div>
			</Card.Content>
		</Card.Root>

		<div class="flex justify-end gap-3">
			<Button type="button" variant="outline" href={resolve('/assets')}>Cancel</Button>
			<Button type="submit" disabled={saving || !bundleType?.name.trim() || !selectedOrgId}>
				{saving ? 'Creating…' : 'Create Bundle'}
			</Button>
		</div>
	</form>
</div>

<!-- New asset modal -->
<Dialog.Root
	open={showModal}
	onOpenChange={(open) => {
		if (!open) {
			resetModal();
			showModal = false;
		}
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
		<Dialog.Content
			class="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg"
		>
			<Dialog.Title class="text-base font-semibold">New Asset</Dialog.Title>
			<Dialog.Description class="mt-1 mb-4 text-sm text-muted-foreground">
				Create a new asset and add it to this bundle.
			</Dialog.Description>

			<form onsubmit={handleNewAsset} class="space-y-4">
				<div class="space-y-2">
					<Label for="modal-location">Location</Label>
					<select
						id="modal-location"
						bind:value={modalLocationId}
						required
						class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
					>
						{#if orgLocations.length === 0}
							<option value="" disabled>—</option>
						{:else}
							{#each orgLocations as loc (loc.id)}
								<option value={loc.id}>{loc.name}</option>
							{/each}
						{/if}
					</select>
					{#if orgLocations.length === 0}
						<p class="text-sm text-muted-foreground">
							No locations yet. Create one in
							<a class="underline" href={resolve(`/orgs/${selectedOrgId}/locations`)}>Locations</a>.
						</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label>Manufacturer</Label>
					<CreatableSelect
						items={manufacturers}
						value={modalManufacturer}
						onchange={handleModalManufacturerChange}
						placeholder="Search or create manufacturer…"
					/>
				</div>

				{#if modalManufacturer}
					{#key modalManufacturerKey}
						<div class="space-y-2">
							<Label>Product Model</Label>
							<CreatableSelect
								items={modalProducts}
								value={modalProduct}
								onchange={(sel) => (modalProduct = sel)}
								placeholder="Search or create product…"
							/>
						</div>
					{/key}
				{/if}

				{#if modalProduct && modalProduct.id === null}
					<div class="space-y-2">
						<Label for="modal-category">Category</Label>
						<CategorySelect
							id="modal-category"
							{categories}
							bind:value={modalCategoryId}
							placeholder="Select a category"
						/>
					</div>
				{/if}

				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-2">
						<Label for="modal-serial">Serial Number</Label>
						<Input id="modal-serial" bind:value={modalSerial} placeholder="S/N 123456" />
					</div>
					<div class="space-y-2">
						<Label for="modal-tag">Asset Tag</Label>
						<Input id="modal-tag" bind:value={modalTag} placeholder="TAG-001" />
					</div>
				</div>

				<div class="flex justify-end gap-2 pt-2">
					<Dialog.Close>
						<Button type="button" variant="outline">Cancel</Button>
					</Dialog.Close>
					<Button
						type="submit"
						disabled={modalSaving || !modalLocationId || !modalManufacturer || !modalProduct}
					>
						{modalSaving ? 'Creating…' : 'Add Asset'}
					</Button>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
