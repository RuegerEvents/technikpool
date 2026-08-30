<script lang="ts">
	import { getErrorMessage, orgLabel } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CreatableSelect } from '$lib/components/ui/creatable-select';
	import { CategorySelect } from '$lib/components/ui/category-select';
	import { NewAssetModal } from '$lib/components/ui/new-asset-modal';
	import {
		getAssets,
		getCategories,
		getLocations,
		getBundleTemplates,
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
			// An accessory follows its parent into the kit; it is never picked.
			if (a.parentAssetId) return false;
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

	// Registering a unit that isn't in the pool yet. The bundle doesn't exist
	// until this page is submitted, so unlike the other two callers this one
	// can't hand the modal a bundleId — the asset is created loose and collected
	// into `selectedAssets`, and joins the bundle when it is created.
	let showModal = $state(false);
	let newAssetModal = $state<{ reset: (name?: string) => void } | null>(null);

	function openNewAsset() {
		newAssetModal?.reset(assetSearch);
		showModal = true;
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
					<Button type="button" variant="outline" disabled={!selectedOrgId} onclick={openNewAsset}>
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

<NewAssetModal
	bind:this={newAssetModal}
	bind:open={showModal}
	organizationId={selectedOrgId}
	heading="New device"
	locations={orgLocations}
	onCreated={(created) => {
		selectedAssets = [
			...selectedAssets,
			...created.map((a) => ({
				id: a.id,
				productName: a.product.name,
				manufacturerName: a.product.manufacturer.name,
				serialNumber: a.serialNumber,
				assetTag: a.assetTag,
				status: a.status
			}))
		];
		assetSearch = '';
		toast.success(
			created.length === 1
				? 'Device created and added'
				: `${created.length} devices created and added`
		);
	}}
>
	{#snippet description()}
		Registered and added to this bundle. It joins the bundle when you create it.
	{/snippet}
</NewAssetModal>
