<script lang="ts">
	import { getErrorMessage, orgLabel } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CategorySelect } from '$lib/components/ui/category-select';
	import { CategoryPill } from '$lib/components/ui/category-pill';
	import { ProductThumb } from '$lib/components/ui/product-thumb';
	import {
		getBundle,
		getCategories,
		getAssets,
		getLocations,
		addAssetToBundle,
		removeAssetFromBundle,
		updateBundleTemplate,
		updateBundle
	} from '$lib/remote/assets.remote';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { AssetStatusBadge } from '$lib/components/ui/asset-status';

	const bundleId = $derived(page.params.id as string);

	let bundle = $derived(await getBundle(bundleId));
	let allAssets = $derived(await getAssets());
	let categories = $derived(await getCategories());
	let locations = $derived(await getLocations(bundle.template.organizationId));

	// ── Bundle editing ───────────────────────────────────────────────────────
	let editingBundle = $state(false);
	let savingBundle = $state(false);

	let bundleDraft = $state({
		name: '',
		categoryId: '',
		description: '',
		tag: '',
		netPurchasePrice: '',
		locationId: ''
	});

	$effect(() => {
		if (editingBundle) return;
		bundleDraft = {
			name: bundle.template.name,
			categoryId: bundle.template.categoryId,
			description: bundle.template.description ?? '',
			tag: bundle.tag ?? '',
			netPurchasePrice: bundle.netPurchasePrice?.toString() ?? '',
			locationId: bundle.locationId ?? ''
		};
	});

	// Template fields are shared by every instance, so only write them when they
	// actually changed — saving a tag must not rewrite the whole bundle type.
	let templateDirty = $derived(
		bundleDraft.name !== bundle.template.name ||
			bundleDraft.categoryId !== bundle.template.categoryId ||
			bundleDraft.description !== (bundle.template.description ?? '')
	);

	async function handleBundleSave(e: Event) {
		e.preventDefault();
		savingBundle = true;
		try {
			await Promise.all([
				templateDirty
					? updateBundleTemplate({
							templateId: bundle.templateId,
							name: bundleDraft.name,
							description: bundleDraft.description,
							categoryId: bundleDraft.categoryId
						})
					: Promise.resolve(),
				updateBundle({
					bundleId,
					tag: bundleDraft.tag || null,
					netPurchasePrice: bundleDraft.netPurchasePrice
						? Number(bundleDraft.netPurchasePrice)
						: null,
					locationId: bundleDraft.locationId || null
				})
			]);
			toast.success('Bundle updated');
			editingBundle = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingBundle = false;
		}
	}

	// ── Contained assets ─────────────────────────────────────────────────────
	let showAddModal = $state(false);
	let searchQuery = $state('');
	let categoryFilter = $state('');
	let working = $state(false);

	let visibleBundleAssets = $derived(
		!categoryFilter
			? bundle.assets
			: bundle.assets.filter((a) => a.product.categoryId === categoryFilter)
	);

	let availableToAdd = $derived.by(() => {
		const bundleAssetIds = new Set(bundle.assets.map((a) => a.id));
		const q = searchQuery.toLowerCase().trim();
		return allAssets.filter((a) => {
			if (bundleAssetIds.has(a.id)) return false;
			if (a.bundle) return false;
			if (!q) return true;
			return (
				a.product.name.toLowerCase().includes(q) ||
				a.product.manufacturer.name.toLowerCase().includes(q) ||
				(a.serialNumber?.toLowerCase().includes(q) ?? false)
			);
		});
	});

	async function handleAdd(assetId: string) {
		working = true;
		try {
			await addAssetToBundle({ bundleId, assetId });
			toast.success('Asset added to bundle');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			working = false;
		}
	}

	async function handleRemove(assetId: string) {
		working = true;
		try {
			await removeAssetFromBundle({ bundleId, assetId });
			toast.success('Asset removed from bundle');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			working = false;
		}
	}
</script>

<svelte:head><title>{bundle.template.name} | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">
				{bundle.template.name}{bundle.tag ? ` — ${bundle.tag}` : ''}
			</h1>
			<p class="text-muted-foreground">{orgLabel(bundle.template.organization)}</p>
		</div>
		<div class="flex gap-2">
			<Button
				variant="outline"
				href={resolve(`/assets/bundles/${bundleId}/inventory-list`)}
				target="_blank"
			>
				Print Inventory List
			</Button>
			<Button variant="outline" href={resolve('/assets')}>Back to Devices</Button>
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<!-- Bundle details (left) -->
		<Card.Root>
			<Card.Header>
				<div class="flex items-start justify-between gap-4">
					<div>
						<Card.Title>Bundle</Card.Title>
						<Card.Description>Name, category, pricing, and location.</Card.Description>
					</div>
					{#if !editingBundle}
						<Button variant="outline" onclick={() => (editingBundle = true)}>Edit</Button>
					{/if}
				</div>
			</Card.Header>
			<Card.Content>
				<form class="space-y-4" onsubmit={handleBundleSave}>
					<div class="space-y-2">
						<Label>Organization</Label>
						<Input value={orgLabel(bundle.template.organization)} disabled />
					</div>
					<div class="space-y-2">
						<Label for="name">Name</Label>
						<Input id="name" bind:value={bundleDraft.name} disabled={!editingBundle} />
						<p class="text-xs text-muted-foreground">
							Shared with every instance of this bundle type.
						</p>
					</div>
					<div class="space-y-2">
						<Label>Category</Label>
						<CategorySelect
							{categories}
							bind:value={bundleDraft.categoryId}
							disabled={!editingBundle}
						/>
					</div>
					<div class="space-y-2">
						<Label for="description"
							>Description <span class="text-muted-foreground">(optional)</span></Label
						>
						<Input
							id="description"
							bind:value={bundleDraft.description}
							disabled={!editingBundle}
							placeholder="What's in this bundle?"
						/>
					</div>
					<div class="space-y-2">
						<Label for="tag">Tag <span class="text-muted-foreground">(optional)</span></Label>
						<Input
							id="tag"
							bind:value={bundleDraft.tag}
							disabled={!editingBundle}
							placeholder="e.g. Kit A"
						/>
						<p class="text-xs text-muted-foreground">
							Distinguishes this physical instance from others of the same type.
						</p>
					</div>
					<div class="space-y-2">
						<Label for="netPurchasePrice">Net purchase price (€)</Label>
						<Input
							id="netPurchasePrice"
							type="number"
							min="0"
							step="0.01"
							bind:value={bundleDraft.netPurchasePrice}
							disabled={!editingBundle}
						/>
						<p class="text-xs text-muted-foreground">Billed as one line on offers.</p>
					</div>
					<div class="space-y-2">
						<Label for="location">Location</Label>
						<select
							id="location"
							bind:value={bundleDraft.locationId}
							disabled={!editingBundle}
							class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						>
							<option value="">No location</option>
							{#each locations as loc (loc.id)}
								{@const city = loc.address?.city?.trim()}
								{@const line1 = loc.address?.line1?.trim()}
								{@const addrParts = [line1, city].filter(Boolean).join(', ')}
								<option value={loc.id}>{addrParts ? `${loc.name} (${addrParts})` : loc.name}</option
								>
							{/each}
						</select>
					</div>
					{#if editingBundle}
						<div class="flex justify-end gap-4 pt-2">
							<Button
								type="button"
								variant="outline"
								onclick={() => (editingBundle = false)}
								disabled={savingBundle}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={savingBundle || !bundleDraft.name.trim()}>
								{savingBundle ? 'Saving…' : 'Save'}
							</Button>
						</div>
					{/if}
				</form>
			</Card.Content>
		</Card.Root>

		<!-- Contained assets (right) -->
		<Card.Root>
			<Card.Header>
				<div class="flex items-start justify-between gap-4">
					<div>
						<Card.Title>Contained Assets</Card.Title>
						<Card.Description>Devices that belong to this bundle.</Card.Description>
					</div>
					<div class="flex items-center gap-2">
						<CategorySelect
							class="w-44"
							{categories}
							bind:value={categoryFilter}
							allowEmpty
							allLabel="All Categories"
						/>
						<Button size="sm" onclick={() => (showAddModal = true)}>Add Assets</Button>
					</div>
				</div>
			</Card.Header>
			<Card.Content>
				{#if bundle.assets.length === 0}
					<p class="py-8 text-center text-muted-foreground">
						No assets in this bundle yet. Click "Add Assets" to get started.
					</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b bg-muted/30">
									<th class="px-4 py-3 text-left font-medium text-muted-foreground">Product</th>
									<th class="px-4 py-3 text-left font-medium text-muted-foreground">Serial</th>
									<th class="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
									<th class="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
									<th class="px-4 py-3"></th>
								</tr>
							</thead>
							<tbody>
								{#each visibleBundleAssets as asset (asset.id)}
									<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
										<td class="px-4 py-3">
											<div class="flex items-center gap-2">
												<ProductThumb src={asset.product.imageUrl} alt={asset.product.name} />
												<CategoryPill
													name={asset.product.category.name}
													color={asset.product.category.color}
												/>
												<span class="font-medium">{asset.product.name}</span>
											</div>
										</td>
										<td class="px-4 py-3 font-mono text-xs">{asset.serialNumber ?? '—'}</td>
										<td class="px-4 py-3">
											<AssetStatusBadge status={asset.status} class="px-2.5" />
										</td>
										<td class="px-4 py-3 text-sm text-muted-foreground">
											{asset.location?.name ?? '—'}
										</td>
										<td class="px-4 py-3 text-right">
											<Button
												size="sm"
												variant="outline"
												disabled={working}
												onclick={() => handleRemove(asset.id)}>Remove</Button
											>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
</div>

<!-- Add Assets Modal -->
{#if showAddModal}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		onkeydown={(e) => e.key === 'Escape' && (showAddModal = false)}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="mx-4 w-full max-w-2xl rounded-lg border bg-background p-6 shadow-lg"
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="mb-4 flex items-start justify-between gap-4">
				<div>
					<h2 class="text-lg font-semibold">Add Assets to Bundle</h2>
					<p class="text-sm text-muted-foreground">Only devices without a bundle can be added.</p>
				</div>
				<Button variant="outline" size="sm" onclick={() => (showAddModal = false)}>Close</Button>
			</div>

			<input
				type="search"
				bind:value={searchQuery}
				placeholder="Search assets…"
				class="mb-3 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
			/>

			{#if availableToAdd.length === 0}
				<p class="text-sm text-muted-foreground">No assets available to add.</p>
			{:else}
				<div class="max-h-80 overflow-y-auto rounded-md border">
					<table class="w-full text-sm">
						<thead class="sticky top-0 bg-muted/80 backdrop-blur-sm">
							<tr class="border-b">
								<th class="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
								<th class="px-3 py-2 text-left font-medium text-muted-foreground">S/N</th>
								<th class="px-3 py-2 text-left font-medium text-muted-foreground">Org</th>
								<th class="px-3 py-2"></th>
							</tr>
						</thead>
						<tbody>
							{#each availableToAdd as asset (asset.id)}
								<tr class="border-b bg-background last:border-0 hover:bg-muted/30">
									<td class="px-3 py-2">
										<div class="flex items-center gap-2">
											<ProductThumb src={asset.product.imageUrl} alt={asset.product.name} />
											<div>
												<p class="font-medium">{asset.product.name}</p>
												<p class="text-xs text-muted-foreground">
													{asset.product.manufacturer.name}
												</p>
											</div>
										</div>
									</td>
									<td class="px-3 py-2 font-mono text-xs">{asset.serialNumber ?? '—'}</td>
									<td class="px-3 py-2 text-xs text-muted-foreground"
										>{orgLabel(asset.organization)}</td
									>
									<td class="px-3 py-2 text-right">
										<Button size="sm" disabled={working} onclick={() => handleAdd(asset.id)}
											>Add</Button
										>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
{/if}
