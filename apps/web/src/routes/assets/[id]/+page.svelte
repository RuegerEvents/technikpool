<script lang="ts">
	import { categoryLabel } from '$lib/category';
	import { getErrorMessage, orgLabel, plural } from '$lib/utils';
	import { CABLE_END_LABEL, connectorRole, formatLength, connectorLabel } from '$lib/cable';
	import { getConnectors } from '$lib/remote/connectors.remote';
	import { imageSrc } from '$lib/images';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Modal } from '$lib/components/ui/modal';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CategoryPill } from '$lib/components/ui/category-pill';
	import {
		ProductFields,
		cableDraftFrom,
		cableInputFrom,
		type ProductDraft
	} from '$lib/components/ui/product-fields';
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
		detachAccessory,
		addProductAccessories,
		getProductAccessoryProfile,
		getProducts,
		getManufacturers,
		getOrgProductPrices,
		setOrgProductPrice
	} from '$lib/remote/assets.remote';
	import { CreatableSelect } from '$lib/components/ui/creatable-select';
	import { NewAssetModal, type NewAssetModalHandle } from '$lib/components/ui/new-asset-modal';
	import { ProductThumb } from '$lib/components/ui/product-thumb';
	import { AssetStatusBadge, assetStatusLabel } from '$lib/components/ui/asset-status';
	import type { TransactionData } from '$lib/types/asset-transaction';
	import { ASSET_STATUSES, isRetiredStatus, type AssetStatus } from '$lib/asset-status';

	let assetId = $derived(page.params.id as string);
	let asset = $derived(await getAsset(assetId));
	let history = $derived(await getAssetHistory(assetId));
	let locations = $derived(await getLocations(asset.organizationId));
	let categories = $derived(await getCategories());

	// Prices are per-org — this page shows and edits the owning org's price
	// for the unit's product.
	let orgPrices = $derived(await getOrgProductPrices(asset.organizationId));
	let orgNetPurchasePrice = $derived.by(() => {
		const row = orgPrices.find((p) => p.productId === asset.productId);
		return row == null ? undefined : Number(row.netPurchasePrice);
	});

	// Sold and decommissioned freeze everything but the status itself, so the
	// unit can be brought back if it was retired by mistake.
	let retired = $derived(isRetiredStatus(asset.status));
	let displayImagePath = $derived(
		asset.accessories.length > 0 ? asset.generatedImagePath : asset.product.imagePath
	);

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

	// The other units of the same product. What is attached here belongs to this
	// unit alone — a cable is a physical object and it is in one case — so the
	// card says so and offers the fan-out rather than letting someone work
	// through twenty units by hand.
	let siblingProfile = $derived(
		await getProductAccessoryProfile({
			productId: asset.productId,
			organizationId: asset.organizationId
		})
	);

	// Under the units, the catalogue. What someone wants to attach is very often
	// a thing the pool holds none of — every spare cable is already in a case —
	// and the useful answer there is not "type its name in" but "you know this
	// product, register one of it". Picking one drops straight into the create
	// dialog with both pickers filled.
	let catalogue = $derived(await getProducts());
	let productSuggestions = $derived(
		catalogue.map((p) => ({ id: p.id, name: `${p.manufacturer.name} ${p.name}` }))
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

	// ── New accessory ─────────────────────────────────────────────────────────
	// A cable or bracket that isn't in the pool yet is the ordinary case, not the
	// exception: nobody registers an accessory before they need it. So typing a
	// name the picker doesn't know offers to create it here, already attached,
	// rather than sending someone to /assets/new and back to attach it by hand.
	//
	// No location is offered — an accessory is wherever its parent is, and the
	// command overrides it anyway.
	let newOpen = $state(false);
	let newAssetModal = $state<NewAssetModalHandle | null>(null);

	function openNewAccessory(name: string) {
		newAssetModal?.reset(name);
		newOpen = true;
	}

	// ── Where each accessory stands across the product's units ────────────────
	// An accessory belongs to this unit alone: the cable in this case is not the
	// cable in the next one. But whether the rest of the fleet is set up the same
	// way is the thing nobody can see from here, and it is what turns "attach a
	// cable" into "twenty units, which ones have I done". So each accessory says
	// where it stands, and offers to bring the others into line.
	let accessoryRows = $derived.by(() => {
		const here: Record<string, number> = {};
		for (const a of asset.accessories) here[a.productId] = (here[a.productId] ?? 0) + 1;

		const said: string[] = [];
		return asset.accessories.map((accessory) => {
			// Said once per product rather than once per cable: two identical
			// brackets are one fact about the fleet, not two.
			if (said.includes(accessory.productId)) return { accessory, standing: null };
			said.push(accessory.productId);

			const count = here[accessory.productId] ?? 1;
			const line = siblingProfile.accessories.find((x) => x.productId === accessory.productId);
			// Units that have *at least as many* as this one — `unitsWith` alone
			// would call a fleet of ones agreed with a unit carrying two.
			const matching = (line?.distribution ?? [])
				.filter((d) => d.perUnit >= count)
				.reduce((sum, d) => sum + d.units, 0);

			return {
				accessory,
				standing: {
					count,
					matching,
					// The copies follow *this* unit, since it is this unit's setup being
					// handed to the others: a tagged cable begets tagged cables.
					tagged: accessory.assetTag !== null
				}
			};
		});
	});

	let copyingProductId = $state<string | null>(null);

	async function copyAccessoryToOtherUnits(
		productId: string,
		standing: { count: number; tagged: boolean }
	) {
		copyingProductId = productId;
		try {
			const { created, unitsTouched, unitsSkipped } = await addProductAccessories({
				organizationId: asset.organizationId,
				parentProductId: asset.productId,
				productId,
				perUnit: standing.count,
				noAssetTag: standing.tagged ? undefined : true
			});
			if (created === 0) {
				toast.info('Every unit already has that — nothing to do');
				return;
			}
			const made = plural(created, ['1 accessory', '# accessories']);
			const onUnits = plural(unitsTouched, ['1 unit', '# units']);
			toast.success(
				unitsSkipped > 0
					? `${made} created on ${onUnits} · ${unitsSkipped} already had one`
					: `${made} created on ${onUnits}`
			);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			copyingProductId = null;
		}
	}

	function openNewAccessoryOfProduct(suggestion: { id: string }) {
		const p = catalogue.find((c) => c.id === suggestion.id);
		if (!p) return;
		newAssetModal?.reset({
			manufacturer: { id: p.manufacturerId, name: p.manufacturer.name },
			product: { id: p.id, name: p.name }
		});
		newOpen = true;
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
		netPurchasePrice: undefined,
		cable: null
	});
	let productManufacturer = $state<{ id: string | null; name: string } | null>(null);
	let manufacturers = $derived(await getManufacturers());

	// Only fetched for a cable: an asset page for a moving head has no use for
	// the connector catalogue, and every asset page would otherwise pay for it.
	let connectors = $derived(asset.product.cableType ? await getConnectors() : []);
	let cableInputGender = $derived(asset.product.category.cableInputGender ?? null);

	/** The catalogue row behind a name on this product, for its picture and end. */
	function connectorInfo(name: string | null) {
		const row = connectors.find((c) => c.name.toLowerCase() === (name ?? '').trim().toLowerCase());
		const role = row ? connectorRole(row, connectors, cableInputGender) : null;
		return { imagePath: row?.imagePath ?? null, end: role ? CABLE_END_LABEL[role] : null };
	}
	let savingProduct = $state(false);

	function openProductModal() {
		productManufacturer = {
			id: asset.product.manufacturerId,
			name: asset.product.manufacturer.name
		};
		productDraft = {
			name: asset.product.name,
			categoryId: asset.product.categoryId,
			imagePath: asset.product.imagePath ?? '',
			// The owning org's price — prices are per-org now.
			netPurchasePrice: orgNetPurchasePrice,
			cable: cableDraftFrom(asset.product)
		};
		productModalOpen = true;
	}

	async function handleProductSave() {
		if (!productManufacturer?.id) {
			toast.error('Manufacturer is required');
			return;
		}
		savingProduct = true;
		try {
			await updateProduct({
				productId: asset.product.id,
				manufacturerId: productManufacturer.id,
				name: productDraft.name,
				categoryId: productDraft.categoryId,
				imagePath: productDraft.imagePath,
				cable: cableInputFrom(productDraft.cable)
			});
			if ((productDraft.netPurchasePrice ?? null) !== (orgNetPurchasePrice ?? null)) {
				await setOrgProductPrice({
					organizationId: asset.organizationId,
					productId: asset.product.id,
					netPurchasePrice: productDraft.netPurchasePrice ?? null
				});
			}
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
			<p class="text-muted-foreground">
				{[
					asset.product.manufacturer.name,
					connectorLabel(asset.product),
					asset.product.lengthCm ? formatLength(asset.product.lengthCm) : ''
				]
					.filter(Boolean)
					.join(' · ')}
			</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" href={resolve(`/assets/new?duplicateFrom=${asset.id}`)}
				>Duplicate</Button
			>
			<Button icon="back" variant="outline" href={resolve('/assets')}>Back to Devices</Button>
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
					<Button icon="edit" variant="outline" onclick={() => (editingAsset = true)}>Edit</Button>
				</div>
			</Card.Header>
			<Card.Content>
				<div class="space-y-4">
					<div class="space-y-2">
						<Label>Organization</Label>
						<Input value={orgLabel(asset.organization)} disabled />
					</div>
					<div class="space-y-2">
						<Label>Bundle</Label>
						<Input value={asset.bundle?.template.name ?? '—'} disabled />
					</div>
					<div class="space-y-2">
						<Label>Serial Number</Label>
						<Input value={asset.serialNumber ?? '—'} disabled />
					</div>
					<div class="space-y-2">
						<Label>Asset Tag</Label>
						<Input value={asset.assetTag ?? '—'} disabled />
					</div>
					<div class="space-y-2">
						<Label>Status</Label>
						<Input value={assetStatusLabel(asset.status as AssetStatus)} disabled />
					</div>
					<div class="space-y-2">
						<!-- A unit that has left the pool isn't anywhere any more; the stored
						     location is only where it stood when it went. -->
						<Label>{retired ? 'Last known location' : 'Location'}</Label>
						<Input value={asset.location?.name ?? '—'} disabled />
					</div>
				</div>
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
					{#if !retired}
						<Button icon="edit" variant="outline" onclick={() => (editingPricing = true)}>
							Edit
						</Button>
					{/if}
				</div>
			</Card.Header>
			<Card.Content>
				<div class="space-y-4">
					<div class="space-y-2">
						<Label>Purchase date</Label>
						<Input
							value={asset.purchaseDate
								? new Date(asset.purchaseDate).toLocaleDateString('de-DE')
								: '—'}
							disabled
						/>
					</div>
					<div class="space-y-2">
						<Label>DGUV inspection interval (months)</Label>
						<Input value={asset.inspectionIntervalMonths?.toString() ?? '—'} disabled />
						{#if asset.nextInspectionDue}
							<p class="text-xs text-muted-foreground">
								Next due: {new Date(asset.nextInspectionDue).toLocaleDateString('de-DE')}
							</p>
						{/if}
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<!-- Accessories: what travels with this unit, or what it travels with -->
		<!-- The card clips to its rounded corners, cutting off any picker that
		     opens past its edge. Nothing in this one is full-bleed. -->
		<Card.Root class="overflow-visible">
			<Card.Header>
				<Card.Title>Accessories</Card.Title>
				<Card.Description>
					{#if asset.parent}
						What this unit is attached to. It is booked, moved and returned with it.
					{:else}
						Cases, power supplies and brackets that belong to this unit. They follow it into
						bundles, onto productions and through every scan.
						{#if siblingProfile.unitCount > 1}
							This is one of {siblingProfile.unitCount} units of this product — what you attach is its
							own, and each one can be copied to the rest.
						{/if}
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
							{#each accessoryRows as { accessory, standing } (accessory.id)}
								<li class="p-3">
									<div class="flex items-center gap-3">
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
									</div>
									{#if standing && siblingProfile.unitCount > 1}
										<div class="mt-2 flex flex-wrap items-center justify-between gap-2 pl-10">
											{#if standing.matching >= siblingProfile.unitCount}
												<p class="text-xs text-muted-foreground">
													All {siblingProfile.unitCount} units of this product have this.
												</p>
											{:else}
												<p class="text-xs text-muted-foreground">
													{standing.matching} of {siblingProfile.unitCount} units of this product have
													this.
												</p>
												{#if !retired}
													<Button
														variant="outline"
														size="sm"
														disabled={copyingProductId !== null}
														onclick={() => copyAccessoryToOtherUnits(accessory.productId, standing)}
													>
														{copyingProductId === accessory.productId
															? 'Copying…'
															: 'Copy to the others'}
													</Button>
												{/if}
											{/if}
										</div>
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
									oncreate={openNewAccessory}
									suggestions={{
										label: 'Register a new unit of…',
										items: productSuggestions,
										onselect: openNewAccessoryOfProduct
									}}
									placeholder="Search this organisation's devices, or type a new one…"
									disabled={attaching}
								/>
							</div>
							<Button disabled={attaching || !attachSelection?.id} onclick={handleAttach}>
								{attaching ? 'Attaching…' : 'Attach'}
							</Button>
							<Button
								type="button"
								variant="outline"
								disabled={attaching}
								onclick={() => openNewAccessory('')}>New</Button
							>
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
						<Button icon="edit" variant="outline" onclick={openProductModal}>Edit</Button>
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
					{#if asset.product.cableType}
						{@const endA = connectorInfo(asset.product.connectorA)}
						{@const endB = connectorInfo(asset.product.connectorB)}
						<div class="space-y-2">
							<Label>Cable type</Label>
							<Input value={asset.product.cableType} disabled />
						</div>
						<div class="grid gap-4 sm:grid-cols-2">
							<div class="space-y-2">
								<Label>
									Connector A
									{#if endA.end}
										<span class="ml-1 font-mono text-xs font-normal text-muted-foreground"
											>{endA.end}</span
										>
									{/if}
								</Label>
								<div
									class="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm"
								>
									<ProductThumb path={endA.imagePath} alt="" size={22} />
									<span>{asset.product.connectorA ?? '—'}</span>
								</div>
							</div>
							<div class="space-y-2">
								<Label>
									Connector B
									{#if endB.end}
										<span class="ml-1 font-mono text-xs font-normal text-muted-foreground"
											>{endB.end}</span
										>
									{/if}
								</Label>
								<div
									class="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm"
								>
									<ProductThumb path={endB.imagePath} alt="" size={22} />
									<span>{asset.product.connectorB ?? '—'}</span>
								</div>
							</div>
						</div>
						{#if asset.product.lengthCm}
							<div class="space-y-2">
								<Label>Length</Label>
								<Input value={formatLength(asset.product.lengthCm)} disabled />
							</div>
						{/if}
					{/if}

					<div class="space-y-2">
						<Label>Net purchase price (€)</Label>
						<div
							class="flex h-10 items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
						>
							{orgNetPurchasePrice != null
								? orgNetPurchasePrice.toLocaleString('de-DE', {
										style: 'currency',
										currency: 'EUR'
									})
								: 'Not set'}
						</div>
						<p class="text-sm text-muted-foreground">
							{orgLabel(asset.organization)}'s price for this product — what its rental rate is
							calculated from. Other organizations price it themselves.
						</p>
					</div>

					<div class="space-y-2">
						<Label>{asset.accessories.length > 0 ? 'Device Image' : 'Product Image'}</Label>
						{#if displayImagePath}
							<img
								src={imageSrc(displayImagePath)}
								alt={asset.accessories.length > 0
									? `${asset.product.name} with accessories`
									: asset.product.name}
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

<Modal bind:open={editingAsset} title="Edit Asset" dismissible={!savingAsset}>
	{#snippet description()}
		{#if retired}
			This unit is sold or decommissioned — only its status can be changed.
		{:else}
			Serial number, tag, status, and location.
		{/if}
	{/snippet}
	<form id="edit-asset-form" class="space-y-4" onsubmit={handleAssetSave}>
		<div class="space-y-2">
			<Label for="serial">Serial Number</Label>
			<Input id="serial" bind:value={assetDraft.serialNumber} disabled={retired} />
		</div>
		<div class="space-y-2">
			<Label for="tag">Asset Tag</Label>
			<Input id="tag" bind:value={assetDraft.assetTag} disabled={retired} />
		</div>
		<div class="space-y-2">
			<Label for="status">Status</Label>
			<select
				id="status"
				bind:value={assetDraft.status}
				class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#each ASSET_STATUSES as s (s)}
					<option value={s}>{assetStatusLabel(s)}</option>
				{/each}
			</select>
		</div>
		{#if !retired}
			<div class="space-y-2">
				<Label for="location">Location</Label>
				<select
					id="location"
					bind:value={assetDraft.locationId}
					class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#each locations as loc (loc.id)}
						{@const city = loc.address?.city?.trim()}
						{@const line1 = loc.address?.line1?.trim()}
						{@const addrParts = [line1, city].filter(Boolean).join(', ')}
						<option value={loc.id}>{addrParts ? `${loc.name} (${addrParts})` : loc.name}</option>
					{/each}
				</select>
			</div>
		{/if}
	</form>
	{#snippet footer()}
		<Button
			icon="close"
			type="button"
			variant="outline"
			onclick={() => (editingAsset = false)}
			disabled={savingAsset}
		>
			Cancel
		</Button>
		<Button icon="save" type="submit" form="edit-asset-form" disabled={savingAsset}>
			{savingAsset ? 'Saving…' : 'Save'}
		</Button>
	{/snippet}
</Modal>

<Modal bind:open={editingPricing} title="Purchase & Inspection" dismissible={!savingPricing}>
	{#snippet description()}
		Facts about this individual unit. What it bills at is the product's price.
	{/snippet}
	<form id="edit-pricing-form" class="space-y-4" onsubmit={handlePricingSave}>
		<div class="space-y-2">
			<Label for="purchaseDate">Purchase date</Label>
			<Input id="purchaseDate" type="date" bind:value={pricingDraft.purchaseDate} />
		</div>
		<div class="space-y-2">
			<Label for="inspectionInterval">DGUV inspection interval (months)</Label>
			<Input
				id="inspectionInterval"
				type="number"
				min="1"
				bind:value={pricingDraft.inspectionIntervalMonths}
			/>
		</div>
	</form>
	{#snippet footer()}
		<Button
			icon="close"
			type="button"
			variant="outline"
			onclick={() => (editingPricing = false)}
			disabled={savingPricing}
		>
			Cancel
		</Button>
		<Button icon="save" type="submit" form="edit-pricing-form" disabled={savingPricing}>
			{savingPricing ? 'Saving…' : 'Save'}
		</Button>
	{/snippet}
</Modal>

<Modal bind:open={confirmingDelete} title="Delete this asset?" dismissible={!deleting}>
	{#snippet description()}
		{asset.product.manufacturer.name}
		{asset.product.name}{asset.assetTag ? ` · ${asset.assetTag}` : ''}{asset.serialNumber
			? ` · ${asset.serialNumber}`
			: ''}
	{/snippet}
	<p class="text-sm text-muted-foreground">
		This cannot be undone. Only the unit is removed — the product it belongs to stays.
	</p>

	{#snippet footer()}
		<Button
			icon="close"
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
	{/snippet}
</Modal>

<NewAssetModal
	bind:this={newAssetModal}
	bind:open={newOpen}
	organizationId={asset.organizationId}
	parentAssetId={assetId}
	heading="New accessory"
	defaultNoTag
	onCreated={(created) => {
		attachSelection = null;
		toast.success(
			created.length === 1
				? 'Accessory created and attached'
				: `${created.length} accessories created and attached`
		);
	}}
>
	{#snippet description()}
		Registered and attached to {asset.product.manufacturer.name}
		{asset.product.name}{asset.assetTag ? ` (${asset.assetTag})` : ''} in one step. It inherits that unit's
		location{asset.bundle ? ' and bundle' : ''}.
	{/snippet}
</NewAssetModal>

<Modal bind:open={productModalOpen} title="Edit Product" dismissible={!savingProduct}>
	{#snippet description()}
		Changes apply to all assets of this product type.
	{/snippet}
	<div class="space-y-2">
		<p class="text-sm font-medium">Manufacturer</p>
		<CreatableSelect
			items={manufacturers}
			bind:value={productManufacturer}
			allowCreate={false}
			disabled={savingProduct}
			placeholder="Search manufacturers…"
		/>
	</div>
	<ProductFields {categories} bind:value={productDraft} idPrefix="modal" />

	{#snippet footer()}
		<Button
			icon="close"
			type="button"
			variant="outline"
			onclick={() => (productModalOpen = false)}
			disabled={savingProduct}
		>
			Cancel
		</Button>
		<Button icon="save" type="button" onclick={handleProductSave} disabled={savingProduct}>
			{savingProduct ? 'Saving…' : 'Save'}
		</Button>
	{/snippet}
</Modal>
