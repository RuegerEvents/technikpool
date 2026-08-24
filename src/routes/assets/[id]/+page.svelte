<script lang="ts">
	import { getErrorMessage, orgLabel } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CategoryPill } from '$lib/components/ui/category-pill';
	import { CategorySelect } from '$lib/components/ui/category-select';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import {
		getAsset,
		getAssetHistory,
		getLocations,
		getCategories,
		updateAsset,
		updateProduct
	} from '$lib/remote/assets.remote';
	import type { TransactionData } from '$lib/types/asset-transaction';

	let assetId = $derived(page.params.id as string);
	let asset = $derived(await getAsset(assetId));
	let history = $derived(await getAssetHistory(assetId));
	let locations = $derived(await getLocations(asset.organizationId));
	let categories = $derived(await getCategories());

	const STATUSES = ['AVAILABLE', 'MAINTENANCE', 'BROKEN'] as const;
	type AssetStatus = (typeof STATUSES)[number];

	// ── Asset editing ─────────────────────────────────────────────────────────
	let editingAsset = $state(false);
	let savingAsset = $state(false);

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
			await updateAsset({
				assetId,
				serialNumber: assetDraft.serialNumber,
				assetTag: assetDraft.assetTag,
				status: assetDraft.status,
				locationId: assetDraft.locationId
			});
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
		netPurchasePrice: '',
		purchaseDate: '',
		inspectionIntervalMonths: ''
	});

	$effect(() => {
		if (editingPricing) return;
		pricingDraft = {
			netPurchasePrice: asset.netPurchasePrice?.toString() ?? '',
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
				netPurchasePrice: pricingDraft.netPurchasePrice
					? Number(pricingDraft.netPurchasePrice)
					: null,
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
	let productModal = $state({
		open: false,
		name: '',
		categoryId: '',
		imageUrl: ''
	});
	let savingProduct = $state(false);

	function openProductModal() {
		productModal = {
			open: true,
			name: asset.product.name,
			categoryId: asset.product.categoryId,
			imageUrl: asset.product.imageUrl ?? ''
		};
	}

	async function handleProductSave() {
		savingProduct = true;
		try {
			await updateProduct({
				productId: asset.product.id,
				name: productModal.name,
				categoryId: productModal.categoryId,
				imageUrl: productModal.imageUrl
			});
			toast.success('Product updated');
			productModal.open = false;
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
						<Card.Description>Serial number, tag, status, and location.</Card.Description>
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
						<Input id="serial" bind:value={assetDraft.serialNumber} disabled={!editingAsset} />
					</div>
					<div class="space-y-2">
						<Label for="tag">Asset Tag</Label>
						<Input id="tag" bind:value={assetDraft.assetTag} disabled={!editingAsset} />
					</div>
					<div class="space-y-2">
						<Label for="status">Status</Label>
						<select
							id="status"
							bind:value={assetDraft.status}
							disabled={!editingAsset}
							class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#each STATUSES as s (s)}
								<option value={s}>{s}</option>
							{/each}
						</select>
					</div>
					<div class="space-y-2">
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
								<option value={loc.id}>{addrParts ? `${loc.name} (${addrParts})` : loc.name}</option
								>
							{/each}
						</select>
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
						<Card.Title>Pricing & Inspection</Card.Title>
						<Card.Description
							>Feeds offer/invoice pricing and DGUV due-date tracking.</Card.Description
						>
					</div>
					{#if !editingPricing}
						<Button variant="outline" onclick={() => (editingPricing = true)}>Edit</Button>
					{/if}
				</div>
			</Card.Header>
			<Card.Content>
				<form class="space-y-4" onsubmit={handlePricingSave}>
					<div class="space-y-2">
						<Label for="netPurchasePrice">Net purchase price (€)</Label>
						<Input
							id="netPurchasePrice"
							type="number"
							min="0"
							step="0.01"
							bind:value={pricingDraft.netPurchasePrice}
							disabled={!editingPricing}
						/>
					</div>
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
								name={asset.product.category.name}
								color={asset.product.category.color}
							/>
						</div>
					</div>
					{#if asset.product.imageUrl}
						<div class="space-y-2">
							<Label>Product Image</Label>
							<img
								src={asset.product.imageUrl}
								alt={asset.product.name}
								class="h-40 w-full rounded-md border bg-muted/30 object-contain p-2"
							/>
						</div>
					{:else}
						<div class="space-y-2">
							<Label>Product Image URL</Label>
							<Input value="—" disabled />
						</div>
					{/if}
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
		</div>
	</div>
</div>

<!-- Edit Product Modal -->
{#if productModal.open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		onkeydown={(e) => e.key === 'Escape' && (productModal.open = false)}
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

			<div class="space-y-4">
				<div class="space-y-2">
					<Label for="modal-name">Product Name</Label>
					<Input id="modal-name" bind:value={productModal.name} required />
				</div>

				<div class="space-y-2">
					<Label>Category</Label>
					<CategorySelect
						{categories}
						bind:value={productModal.categoryId}
						placeholder="Select a category"
					/>
				</div>

				<div class="space-y-2">
					<Label for="modal-image">Product Image URL</Label>
					<Input
						id="modal-image"
						type="url"
						placeholder="https://…"
						bind:value={productModal.imageUrl}
					/>
				</div>
			</div>

			<div class="mt-6 flex justify-end gap-3">
				<Button
					type="button"
					variant="outline"
					onclick={() => (productModal.open = false)}
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
