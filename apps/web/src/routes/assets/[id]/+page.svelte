<script lang="ts">
	import { categoryLabel } from '$lib/category';
	import { getErrorMessage, orgLabel } from '$lib/utils';
	import { imageSrc } from '$lib/images';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CategoryPill } from '$lib/components/ui/category-pill';
	import { ProductFields, type ProductDraft } from '$lib/components/ui/product-fields';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import {
		getAsset,
		getAssets,
		getAssetHistory,
		getLocations,
		getCategories,
		updateAsset,
		updateProduct,
		deleteAsset,
		attachAccessory,
		detachAccessory
	} from '$lib/remote/assets.remote';
	import { CreatableSelect } from '$lib/components/ui/creatable-select';
	import { ProductThumb } from '$lib/components/ui/product-thumb';
	import { AssetStatusBadge, assetStatusLabel } from '$lib/components/ui/asset-status';
	import type { TransactionData } from '$lib/types/asset-transaction';
	import { ASSET_STATUSES, isRetiredStatus, type AssetStatus } from '$lib/asset-status';

	let assetId = $derived(page.params.id as string);
	let asset = $derived(await getAsset(assetId));
	let history = $derived(await getAssetHistory(assetId));
	let locations = $derived(await getLocations(asset.organizationId));
	let categories = $derived(await getCategories());

	// Sold and decommissioned freeze everything but the status itself, so the
	// unit can be brought back if it was retired by mistake.
	let retired = $derived(isRetiredStatus(asset.status));

	// ── Accessories ───────────────────────────────────────────────────────────
	// What can be attached here: an active unit of this org that is not already
	// somebody's accessory, has none of its own, and isn't in another kit. The
	// same guards `attachAccessory` enforces — this list only saves the round
	// trip that would end in the error message.
	let orgAssets = $derived(await getAssets(asset.organizationId));
	let attachCandidates = $derived(
		orgAssets
			.filter(
				(a) =>
					a.id !== asset.id &&
					a.parent === null &&
					a.accessories.length === 0 &&
					(a.bundleId === null || a.bundleId === asset.bundleId)
			)
			.map((a) => ({
				id: a.id,
				name: `${a.product.manufacturer.name} ${a.product.name}${a.assetTag ? ` (${a.assetTag})` : ''}`
			}))
	);

	let attachSelection = $state<{ id: string | null; name: string } | null>(null);
	let attaching = $state(false);

	async function handleAttach() {
		if (!attachSelection?.id) return;
		attaching = true;
		try {
			await attachAccessory({ parentId: assetId, assetId: attachSelection.id });
			attachSelection = null;
			toast.success('Accessory attached');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			attaching = false;
		}
	}

	async function handleDetach(id: string) {
		attaching = true;
		try {
			await detachAccessory(id);
			toast.success('Accessory detached');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			attaching = false;
		}
	}

	// ── Asset editing ─────────────────────────────────────────────────────────
	let editingAsset = $state(false);
	let savingAsset = $state(false);

	let confirmingDelete = $state(false);
	let deleting = $state(false);

	async function handleDelete() {
		deleting = true;
		try {
			await deleteAsset(assetId);
			confirmingDelete = false;
			toast.success('Asset deleted');
			await goto(resolve('/assets'));
		} catch (err) {
			// The command refuses anything with history, and says which kind — that
			// reason is the useful part, so it goes in front of the user verbatim.
			toast.error(getErrorMessage(err));
			confirmingDelete = false;
		} finally {
			deleting = false;
		}
	}

	let assetDraft = $state({
		serialNumber: '',
		assetTag: '',
		status: 'AVAILABLE' as AssetStatus,
		locationId: ''
	});

	$effect(() => {
		if (editingAsset) return;
		assetDraft = {
			serialNumber: asset.serialNumber ?? '',
			assetTag: asset.assetTag ?? '',
			status: asset.status as AssetStatus,
			locationId: asset.locationId
		};
	});

	async function handleAssetSave(e: Event) {
		e.preventDefault();
		savingAsset = true;
		try {
			await updateAsset(
				retired
					? { assetId, status: assetDraft.status }
					: {
							assetId,
							serialNumber: assetDraft.serialNumber,
							assetTag: assetDraft.assetTag,
							status: assetDraft.status,
							locationId: assetDraft.locationId
						}
			);
			toast.success('Asset updated');
			editingAsset = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingAsset = false;
		}
	}

	// ── Pricing & inspection editing ─────────────────────────────────────────
	let editingPricing = $state(false);
	let savingPricing = $state(false);
	let pricingDraft = $state({
		purchaseDate: '',
		inspectionIntervalMonths: ''
	});

	$effect(() => {
		if (editingPricing) return;
		pricingDraft = {
			purchaseDate: asset.purchaseDate
				? new Date(asset.purchaseDate).toISOString().slice(0, 10)
				: '',
			inspectionIntervalMonths: asset.inspectionIntervalMonths?.toString() ?? ''
		};
	});

	async function handlePricingSave(e: Event) {
		e.preventDefault();
		savingPricing = true;
		try {
			await updateAsset({
				assetId,
				purchaseDate: pricingDraft.purchaseDate || null,
				inspectionIntervalMonths: pricingDraft.inspectionIntervalMonths
					? Number(pricingDraft.inspectionIntervalMonths)
					: null
			});
			toast.success('Pricing & inspection updated');
			editingPricing = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingPricing = false;
		}
	}

	// ── Product editing ───────────────────────────────────────────────────────
	// The same three fields the product wizard walks through — see ProductFields.
	let productModalOpen = $state(false);
	let productDraft = $state<ProductDraft>({
		name: '',
		categoryId: '',
		imagePath: '',
		netPurchasePrice: ''
	});
	let savingProduct = $state(false);

	function openProductModal() {
		productDraft = {
			name: asset.product.name,
			categoryId: asset.product.categoryId,
			imagePath: asset.product.imagePath ?? '',
			netPurchasePrice: asset.product.netPurchasePrice?.toString() ?? ''
		};
		productModalOpen = true;
	}

	async function handleProductSave() {
		savingProduct = true;
		try {
			await updateProduct({
				productId: asset.product.id,
				name: productDraft.name,
				categoryId: productDraft.categoryId,
				imagePath: productDraft.imagePath,
				netPurchasePrice: productDraft.netPurchasePrice.trim()
					? Number(productDraft.netPurchasePrice)
					: null
			});
			toast.success('Product updated');
			productModalOpen = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingProduct = false;
		}
	}
</script>

<svelte:head><title>{asset.product.name} | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">{asset.product.name}</h1>
			<p class="text-muted-foreground">{asset.product.manufacturer.name}</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" href={resolve(`/assets/new?duplicateFrom=${asset.id}`)}
				>Duplicate</Button
			>
			<Button variant="outline" href={resolve('/assets')}>Back to Devices</Button>
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<!-- Asset details (left) -->
		<Card.Root>
			<Card.Header>
				<div class="flex items-start justify-between gap-4">
					<div>
						<Card.Title>Asset</Card.Title>
						<Card.Description>
							{#if retired}
								This unit has left the pool. It can't be booked or edited — set the status back to
								bring it into service again.
							{:else}
								Serial number, tag, status, and location.
							{/if}
						</Card.Description>
					</div>
					{#if !editingAsset}
						<Button variant="outline" onclick={() => (editingAsset = true)}>Edit</Button>
					{/if}
				</div>
			</Card.Header>
			<Card.Content>
				<form class="space-y-4" onsubmit={handleAssetSave}>
					<div class="space-y-2">
						<Label>Organization</Label>
						<Input value={orgLabel(asset.organization)} disabled />
					</div>
					<div class="space-y-2">
						<Label>Bundle</Label>
						<Input value={asset.bundle?.template.name ?? '—'} disabled />
					</div>
					<div class="space-y-2">
						<Label for="serial">Serial Number</Label>
						<Input
							id="serial"
							bind:value={assetDraft.serialNumber}
							disabled={!editingAsset || retired}
						/>
					</div>
					<div class="space-y-2">
						<Label for="tag">Asset Tag</Label>
						<Input id="tag" bind:value={assetDraft.assetTag} disabled={!editingAsset || retired} />
					</div>
					<div class="space-y-2">
						<Label for="status">Status</Label>
						<select
							id="status"
							bind:value={assetDraft.status}
							disabled={!editingAsset}
							class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#each ASSET_STATUSES as s (s)}
								<option value={s}>{assetStatusLabel(s)}</option>
							{/each}
						</select>
					</div>
					<div class="space-y-2">
						{#if retired}
							<!-- A unit that has left the pool isn't anywhere any more; the stored
							     location is only where it stood when it went. -->
							<Label for="location">Last known location</Label>
							<Input id="location" value={asset.location?.name ?? '—'} disabled />
						{:else}
							<Label for="location">Location</Label>
							<select
								id="location"
								bind:value={assetDraft.locationId}
								disabled={!editingAsset}
								class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
							>
								{#each locations as loc (loc.id)}
									{@const city = loc.address?.city?.trim()}
									{@const line1 = loc.address?.line1?.trim()}
									{@const addrParts = [line1, city].filter(Boolean).join(', ')}
									<option value={loc.id}
										>{addrParts ? `${loc.name} (${addrParts})` : loc.name}</option
									>
								{/each}
							</select>
						{/if}
					</div>
					{#if editingAsset}
						<div class="flex justify-end gap-4 pt-2">
							<Button
								type="button"
								variant="outline"
								onclick={() => (editingAsset = false)}
								disabled={savingAsset}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={savingAsset}>
								{savingAsset ? 'Saving…' : 'Save'}
							</Button>
						</div>
					{/if}
				</form>
			</Card.Content>
		</Card.Root>

		<!-- Pricing & inspection -->
		<Card.Root>
			<Card.Header>
				<div class="flex items-start justify-between gap-4">
					<div>
						<Card.Title>Purchase & Inspection</Card.Title>
						<Card.Description>
							Facts about this individual unit. What it bills at is the product's price.
						</Card.Description>
					</div>
					{#if !editingPricing && !retired}
						<Button variant="outline" onclick={() => (editingPricing = true)}>Edit</Button>
					{/if}
				</div>
			</Card.Header>
			<Card.Content>
				<form class="space-y-4" onsubmit={handlePricingSave}>
					<div class="space-y-2">
						<Label for="purchaseDate">Purchase date</Label>
						<Input
							id="purchaseDate"
							type="date"
							bind:value={pricingDraft.purchaseDate}
							disabled={!editingPricing}
						/>
					</div>
					<div class="space-y-2">
						<Label for="inspectionInterval">DGUV inspection interval (months)</Label>
						<Input
							id="inspectionInterval"
							type="number"
							min="1"
							bind:value={pricingDraft.inspectionIntervalMonths}
							disabled={!editingPricing}
						/>
						{#if asset.nextInspectionDue}
							<p class="text-xs text-muted-foreground">
								Next due: {new Date(asset.nextInspectionDue).toLocaleDateString('de-DE')}
							</p>
						{/if}
					</div>
					{#if editingPricing}
						<div class="flex justify-end gap-4 pt-2">
							<Button
								type="button"
								variant="outline"
								onclick={() => (editingPricing = false)}
								disabled={savingPricing}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={savingPricing}>
								{savingPricing ? 'Saving…' : 'Save'}
							</Button>
						</div>
					{/if}
				</form>
			</Card.Content>
		</Card.Root>

		<!-- Accessories: what travels with this unit, or what it travels with -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Accessories</Card.Title>
				<Card.Description>
					{#if asset.parent}
						What this unit is attached to. It is booked, moved and returned with it.
					{:else}
						Cases, power supplies and brackets that belong to this unit. They follow it into
						bundles, onto productions and through every scan.
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				{#if asset.parent}
					<div class="flex items-center justify-between gap-4 rounded-md border p-3">
						<div class="text-sm">
							<p class="text-xs text-muted-foreground">Accessory of</p>
							<a
								href={resolve(`/assets/${asset.parent.id}`)}
								class="font-medium underline underline-offset-2"
							>
								{asset.parent.product.manufacturer.name}
								{asset.parent.product.name}{asset.parent.assetTag
									? ` (${asset.parent.assetTag})`
									: ''}
							</a>
						</div>
						{#if !retired}
							<Button
								variant="outline"
								size="sm"
								disabled={attaching}
								onclick={() => handleDetach(asset.id)}>Detach</Button
							>
						{/if}
					</div>
				{:else}
					{#if asset.accessories.length === 0}
						<p class="text-sm text-muted-foreground">Nothing is attached to this unit yet.</p>
					{:else}
						<ul class="divide-y rounded-md border">
							{#each asset.accessories as accessory (accessory.id)}
								<li class="flex items-center gap-3 p-3">
									<ProductThumb
										path={accessory.product.imagePath}
										alt={accessory.product.name}
										size={28}
									/>
									<div class="min-w-0 flex-1">
										<a
											href={resolve(`/assets/${accessory.id}`)}
											class="text-sm font-medium underline underline-offset-2"
										>
											{accessory.product.name}
										</a>
										<p class="text-xs text-muted-foreground">
											{accessory.product.manufacturer.name}{accessory.assetTag
												? ` · ${accessory.assetTag}`
												: ''}
											{#if accessory.nextInspectionDue}
												· Next due: {new Date(accessory.nextInspectionDue).toLocaleDateString(
													'de-DE'
												)}
											{/if}
										</p>
									</div>
									<AssetStatusBadge status={accessory.status} />
									{#if !retired}
										<Button
											variant="outline"
											size="sm"
											disabled={attaching}
											onclick={() => handleDetach(accessory.id)}>Detach</Button
										>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
					{#if !retired}
						<div class="flex items-end gap-2">
							<div class="flex-1 space-y-2">
								<Label>Add an accessory</Label>
								<CreatableSelect
									items={attachCandidates}
									bind:value={attachSelection}
									allowCreate={false}
									placeholder="Search this organisation's devices…"
									disabled={attaching}
								/>
							</div>
							<Button disabled={attaching || !attachSelection?.id} onclick={handleAttach}>
								{attaching ? 'Attaching…' : 'Attach'}
							</Button>
						</div>
					{/if}
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- Product details (right) -->
		<div class="space-y-6">
			<Card.Root>
				<Card.Header>
					<div class="flex items-start justify-between gap-4">
						<div>
							<Card.Title>Product</Card.Title>
							<Card.Description>Shared product details for this asset type.</Card.Description>
						</div>
						<Button variant="outline" onclick={openProductModal}>Edit</Button>
					</div>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<Label>Manufacturer</Label>
						<Input value={asset.product.manufacturer.name} disabled />
					</div>
					<div class="space-y-2">
						<Label>Product Name</Label>
						<Input value={asset.product.name} disabled />
					</div>
					<div class="space-y-2">
						<Label>Category</Label>
						<div
							class="flex h-10 items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
						>
							<CategoryPill
								name={categoryLabel(asset.product.category)}
								color={asset.product.category.color}
							/>
						</div>
					</div>
					<div class="space-y-2">
						<Label>Net purchase price (€)</Label>
						<div
							class="flex h-10 items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
						>
							{asset.product.netPurchasePrice
								? Number(asset.product.netPurchasePrice).toLocaleString('de-DE', {
										style: 'currency',
										currency: 'EUR'
									})
								: 'Not set'}
						</div>
						<p class="text-sm text-muted-foreground">
							What a rental rate is calculated from, for every unit of this product.
						</p>
					</div>

					<div class="space-y-2">
						<Label>Product Image</Label>
						{#if asset.product.imagePath}
							<img
								src={imageSrc(asset.product.imagePath)}
								alt={asset.product.name}
								class="h-40 w-full rounded-md border bg-muted/30 object-contain p-2"
							/>
						{:else}
							<div
								class="flex h-40 w-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground"
							>
								No image yet — add one with Edit.
							</div>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>

			<!-- Audit log -->
			<Card.Root>
				<Card.Header>
					<Card.Title>Audit Log</Card.Title>
					<Card.Description
						>History of transactions and status changes for this asset.</Card.Description
					>
				</Card.Header>
				<Card.Content>
					{#if history.length === 0}
						<p class="text-muted-foreground">No history available for this asset.</p>
					{:else}
						<div class="relative ml-3 space-y-8 border-l border-muted-foreground/20 py-4">
							{#each history as item (item.id)}
								{@const tx = item.data as TransactionData | null}
								<div class="relative pl-6">
									<div
										class="absolute top-1 -left-[5px] h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background"
									></div>
									<div class="flex flex-col gap-1">
										<div class="text-sm font-medium">
											{#if tx?.type === 'CREATED'}
												Asset created
											{:else if tx?.type === 'UPDATED'}
												Asset updated
											{:else if tx?.type === 'LOCATION_ASSIGNED'}
												Checked in to <span class="text-foreground">{tx.locationName}</span>
											{:else if tx?.type === 'CHECKED_OUT'}
												Checked out for
												<a
													href={resolve(`/productions/${tx.productionId}`)}
													class="text-foreground underline underline-offset-2"
													>{tx.productionName}</a
												>
											{:else if tx?.type === 'RETURNED'}
												Returned from
												<a
													href={resolve(`/productions/${tx.fromProductionId}`)}
													class="text-foreground underline underline-offset-2"
													>{tx.fromProductionName}</a
												>
												<span class="font-normal text-muted-foreground">
													to <span class="font-medium text-foreground">{tx.toLocationName}</span>
												</span>
											{:else if tx?.type === 'REQUESTED'}
												Requested for
												<a
													href={resolve(`/productions/${tx.productionId}`)}
													class="text-foreground underline underline-offset-2"
													>{tx.productionName}</a
												>
												<span class="font-normal text-muted-foreground">
													by <span class="font-medium text-foreground">{tx.requestingOrgName}</span>
												</span>
											{:else if tx?.type === 'ADDED_TO_PRODUCTION'}
												Added to
												<a
													href={resolve(`/productions/${tx.productionId}`)}
													class="text-foreground underline underline-offset-2"
													>{tx.productionName}</a
												>
											{:else if tx?.type === 'APPROVED'}
												Approved for
												<a
													href={resolve(`/productions/${tx.productionId}`)}
													class="text-foreground underline underline-offset-2"
													>{tx.productionName}</a
												>
											{:else if tx?.type === 'DECLINED'}
												Declined for
												<a
													href={resolve(`/productions/${tx.productionId}`)}
													class="text-foreground underline underline-offset-2"
													>{tx.productionName}</a
												>
											{:else if tx?.type === 'ACCESSORY_ATTACHED'}
												Attached as an accessory of
												<a
													href={resolve(`/assets/${tx.parentAssetId}`)}
													class="text-foreground underline underline-offset-2">{tx.parentLabel}</a
												>
											{:else if tx?.type === 'ACCESSORY_DETACHED'}
												Detached from
												<a
													href={resolve(`/assets/${tx.parentAssetId}`)}
													class="text-foreground underline underline-offset-2">{tx.parentLabel}</a
												>
											{:else}
												{item.action}
											{/if}
										</div>
										<div class="text-xs text-muted-foreground">
											By {item.user.name || item.user.email} on {new Date(
												item.createdAt
											).toLocaleString()}
										</div>
										{#if tx?.type === 'UPDATED' && tx.changes.length > 0}
											<div class="mt-2 space-y-1 rounded-md bg-muted/50 p-2">
												{#each tx.changes as change (change.field)}
													<div class="text-sm text-muted-foreground">
														<span class="font-medium text-foreground">{change.field}:</span>
														{change.from ?? '—'} →
														<span class="font-medium text-foreground">{change.to ?? '—'}</span>
													</div>
												{/each}
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

			<div
				class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-destructive/30 p-4"
			>
				<div>
					<p class="text-sm font-medium">Delete this asset</p>
					<p class="text-xs text-muted-foreground">
						Only possible while it has never been booked, scanned, inspected or billed. A unit that
						has been in use is decommissioned instead, so its history survives.
					</p>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					class="border-destructive/40 text-destructive hover:bg-destructive/10"
					onclick={() => (confirmingDelete = true)}>Delete</Button
				>
			</div>
		</div>
	</div>
</div>

<!-- Delete Asset Modal -->
{#if confirmingDelete}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		onkeydown={(e) => e.key === 'Escape' && (confirmingDelete = false)}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="mx-4 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg"
			onkeydown={(e) => e.stopPropagation()}
		>
			<h2 class="mb-1 text-lg font-semibold">Delete this asset?</h2>
			<p class="mb-5 text-sm text-muted-foreground">
				{asset.product.manufacturer.name}
				{asset.product.name}{asset.assetTag ? ` · ${asset.assetTag}` : ''}{asset.serialNumber
					? ` · ${asset.serialNumber}`
					: ''}
			</p>
			<p class="mb-5 text-sm text-muted-foreground">
				This cannot be undone. Only the unit is removed — the product it belongs to stays.
			</p>
			<div class="flex justify-end gap-3">
				<Button
					type="button"
					variant="outline"
					onclick={() => (confirmingDelete = false)}
					disabled={deleting}
				>
					Cancel
				</Button>
				<Button
					type="button"
					class="bg-destructive text-white hover:bg-destructive/90"
					onclick={handleDelete}
					disabled={deleting}
				>
					{deleting ? 'Deleting…' : 'Delete asset'}
				</Button>
			</div>
		</div>
	</div>
{/if}

<!-- Edit Product Modal -->
{#if productModalOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		onkeydown={(e) => e.key === 'Escape' && (productModalOpen = false)}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="mx-4 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg"
			onkeydown={(e) => e.stopPropagation()}
		>
			<h2 class="mb-1 text-lg font-semibold">Edit Product</h2>
			<p class="mb-5 text-sm text-muted-foreground">
				Changes apply to all assets of this product type.
			</p>

			<ProductFields {categories} bind:value={productDraft} idPrefix="modal" />

			<div class="mt-6 flex justify-end gap-3">
				<Button
					type="button"
					variant="outline"
					onclick={() => (productModalOpen = false)}
					disabled={savingProduct}
				>
					Cancel
				</Button>
				<Button type="button" onclick={handleProductSave} disabled={savingProduct}>
					{savingProduct ? 'Saving…' : 'Save'}
				</Button>
			</div>
		</div>
	</div>
{/if}
