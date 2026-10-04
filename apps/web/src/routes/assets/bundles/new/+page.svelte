<script lang="ts">
	import { CameraScanButton } from '#lib/components/ui/camera-scan/index.js';
	import { makerAndName } from '#lib/product-label.js';
	import { getErrorMessage, orgLabel, plural } from '#lib/utils.js';
	import { canManageInventory } from '#lib/roles.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { CreatableSelect } from '#lib/components/ui/creatable-select/index.js';
	import { CategorySelect } from '#lib/components/ui/category-select/index.js';
	import { NewAssetModal } from '#lib/components/ui/new-asset-modal/index.js';
	import { BundleVsAccessoryInfo } from '#lib/components/ui/bundle-vs-accessory-info/index.js';
	import {
		getAssets,
		getCategories,
		getPlaceableLocations,
		getBundleTemplates,
		getBundleTypeSpec,
		createBundleInstance
	} from '#lib/remote/assets.remote.js';
	import { countProducts, matchesSpec, specShortfall } from '#lib/bundle-spec.js';
	import { getMyOrgs } from '#lib/remote/orgs.remote.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { AssetStatusBadge } from '#lib/components/ui/asset-status/index.js';
	import { ProductThumb } from '#lib/components/ui/product-thumb/index.js';
	import { UnitPicker, type PickerUnit } from '#lib/components/ui/unit-picker/index.js';
	import { isBookableStatus } from '#lib/asset-status.js';

	// Bundle fields
	type SelectionOrNew = { id: string | null; name: string } | null;

	let bundleType = $state<SelectionOrNew>(null);
	let bundleTag = $state('');
	let bundleCaption = $state('');
	let bundleDetails = $state('');
	let selectedOrgId = $state('');
	let bundleCategoryId = $state('');
	let saving = $state(false);
	let differenceOpen = $state(false);

	// Asset picker
	let assetSearch = $state('');

	let selectedIds = $state<string[]>([]);

	// Remote data
	// Creating a kit is the same org-admin right as creating an asset, so the
	// picker offers the same orgs the server would accept.
	let orgsQuery = $derived(getMyOrgs());
	let orgs = $derived((orgsQuery.current ?? []).filter(canManageInventory));
	let categoriesQuery = $derived(getCategories());
	let categories = $derived(categoriesQuery.current ?? []);
	let bundleTypesQuery = $derived(selectedOrgId ? getBundleTemplates(selectedOrgId) : null);
	let bundleTypes = $derived(bundleTypesQuery?.current ?? []);

	let isNewBundleType = $derived(bundleType !== null && bundleType.id === null);

	$effect(() => {
		if (!isNewBundleType || bundleCategoryId) return;
		const misc = categories.find((c) => c.name.toLowerCase() === 'miscellaneous');
		if (misc) bundleCategoryId = misc.id;
	});

	$effect(() => {
		if (!selectedOrgId && orgs[0]) selectedOrgId = orgs[0].id;
	});

	let availableAssetsQuery = $derived(selectedOrgId ? getAssets(selectedOrgId) : null);
	let availableAssets = $derived(availableAssetsQuery?.current ?? []);
	let orgLocationsQuery = $derived(selectedOrgId ? getPlaceableLocations() : null);
	let orgLocations = $derived(orgLocationsQuery?.current ?? []);
	// Read back from the org's units rather than kept on the side: a device
	// registered from here is picked by id and shows up once the list refreshes.
	let selectedAssets = $derived(
		selectedIds.flatMap((id) => availableAssets.filter((a) => a.id === id))
	);

	// ── What this case has to hold ───────────────────────────────────────────
	// Every case of a bundle type holds the same gear, so a case of a type that
	// already exists is not a free selection: it is a list to fill. The picker
	// offers only what is still short, and the button stays out of reach until
	// the kit is complete — the server refuses the same thing, this is so nobody
	// finds that out after picking twenty units.
	let specQuery = $derived(bundleType?.id ? getBundleTypeSpec(bundleType.id) : null);
	let spec = $derived(specQuery?.current ?? null);
	let specLines = $derived(spec?.lines ?? []);
	let selectedCounts = $derived(countProducts(selectedAssets));
	let shortfall = $derived(specShortfall(specLines, selectedCounts));
	let stillMissing = $derived(shortfall.reduce((total, line) => total + line.missing, 0));
	let fitsType = $derived(specLines.length === 0 || matchesSpec(specLines, selectedCounts));

	// A unit belongs to one kit at a time and an accessory follows its parent,
	// so neither is on offer — the same rule the bundle page's picker applies.
	// Nor is a product the type doesn't hold.
	let pickerUnits = $derived<PickerUnit[]>(
		availableAssets
			.filter((a) => !a.bundleId && !a.parentAssetId && isBookableStatus(a.status))
			.filter((a) => limitFor(a.productId) > 0)
			.map((a) => ({
				id: a.id,
				productId: a.productId,
				productName: a.product.name,
				productCaption: a.product.caption,
				manufacturerName: a.product.manufacturer?.name ?? null,
				imagePath: a.product.imagePath,
				assetTag: a.assetTag,
				serialNumber: a.serialNumber,
				locationName: a.location?.name ?? null
			}))
	);

	// A type that is already on the shelf holds a fixed number of each product,
	// and nothing it doesn't hold; a new type takes whatever it is given.
	function limitFor(productId: string) {
		if (specLines.length === 0) return Infinity;
		return specLines.find((line) => line.productId === productId)?.quantity ?? 0;
	}

	function removeSelected(id: string) {
		selectedIds = selectedIds.filter((selectedId) => selectedId !== id);
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
				caption: isNewBundleType ? bundleCaption.trim() || undefined : undefined,
				details: isNewBundleType ? bundleDetails.trim() || undefined : undefined,
				categoryId: isNewBundleType ? bundleCategoryId : undefined,
				tag: bundleTag.trim() || undefined,
				assetIds: selectedIds
			});
			toast.success('Bundle created!');
			goto(resolve(`assets/bundles/${bundle.id}`));
		} catch (err) {
			toast.error(getErrorMessage(err));
			saving = false;
		}
	}
</script>

<svelte:head><title>Create Bundle | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div>
		<Button variant="ghost" href={resolve('assets')} class="mb-2 -ml-3">← Back to Inventory</Button>
		<h1 class="text-3xl font-bold tracking-tight">Create Bundle</h1>
		<!-- The one place the wrong choice is actually made: someone with a case
		     of gear in front of them is here, and a device with its accessories
		     would have been the right answer about half the time. -->
		<p class="text-muted-foreground">
			A kit that is packed, booked and billed as one thing.
			<button
				type="button"
				class="text-primary underline underline-offset-4"
				onclick={() => (differenceOpen = true)}>Is this a bundle, or accessories?</button
			>
		</p>
	</div>

	<form onsubmit={handleSubmit} class="space-y-6">
		<!-- Bundle details -->
		<Card.Root class="overflow-visible">
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
						<div class="flex gap-2">
							<Input id="bundle-tag" bind:value={bundleTag} placeholder="e.g. Kit A" />
							<CameraScanButton onscan={(code) => (bundleTag = code)} />
						</div>
						<p class="text-xs text-muted-foreground">
							Distinguishes this physical instance from others of the same type.
						</p>
					</div>
				</div>
				{#if isNewBundleType}
					<div class="space-y-2">
						<Label for="bundle-caption"
							>Caption <span class="text-muted-foreground">(optional)</span></Label
						>
						<Input id="bundle-caption" bind:value={bundleCaption} placeholder="e.g. FOH Rack" />
						<p class="text-xs text-muted-foreground">
							What the team calls it. Shown next to the name in every list.
						</p>
					</div>
					<div class="space-y-2">
						<Label for="bundle-details"
							>Details <span class="text-muted-foreground">(optional)</span></Label
						>
						<textarea
							id="bundle-details"
							bind:value={bundleDetails}
							rows="3"
							class="w-full rounded-md border bg-background px-3 py-2 text-sm"></textarea>
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
				{#if specLines.length > 0}
					<div class="rounded-md border bg-muted/30 p-3">
						<p class="text-sm font-medium">
							{#if stillMissing === 0}
								This case holds the kit.
							{:else}
								This bundle type is already on the shelf, so this case has to hold the same gear.
							{/if}
						</p>
						<ul class="mt-2 space-y-1 text-sm">
							{#each shortfall as { line, have, missing } (line.productId)}
								<li class="flex items-center gap-2 {missing > 0 ? 'text-muted-foreground' : ''}">
									<span class="font-mono text-xs">{have}/{line.quantity}</span>
									<ProductThumb path={line.imagePath} alt={line.name} size={24} />
									{makerAndName(line.manufacturerName, line.name)}
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<!-- Selected assets -->
				{#if selectedAssets.length > 0}
					<div>
						<p class="mb-2 text-sm font-medium">
							Selected <span class="text-muted-foreground">({selectedAssets.length})</span>
						</p>
						<div class="overflow-x-auto rounded-md border">
							<table class="w-full text-sm">
								<tbody>
									{#each selectedAssets as asset (asset.id)}
										<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
											<td class="px-3 py-2 font-medium">
												<div class="flex items-center gap-2">
													<ProductThumb
														path={asset.product.imagePath}
														alt={asset.product.name}
														size={28}
													/>
													{asset.product.name}
												</div>
											</td>
											<td class="px-3 py-2 text-muted-foreground">
												{asset.product.manufacturer?.name}
											</td>
											<td class="px-3 py-2 font-mono text-xs">{asset.assetTag ?? '—'}</td>
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
				{#if selectedOrgId}
					<UnitPicker
						units={pickerUnits}
						bind:selected={selectedIds}
						bind:search={assetSearch}
						{limitFor}
					/>
				{/if}
			</Card.Content>
		</Card.Root>

		<div class="flex flex-row-reverse flex-wrap items-center justify-start gap-3">
			<Button
				icon="add"
				type="submit"
				disabled={saving || !bundleType?.name.trim() || !selectedOrgId || !fitsType}
			>
				{saving ? 'Creating…' : 'Create Bundle'}
			</Button>
			<Button icon="close" type="button" variant="outline" href={resolve('assets')}>Cancel</Button>
			{#if specLines.length > 0 && stillMissing > 0}
				<p class="mr-auto text-sm text-muted-foreground">
					{plural(stillMissing, [
						'One more unit and this case is the kit.',
						'# units short of the kit.'
					])}
				</p>
			{/if}
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
		selectedIds = [...selectedIds, ...created.map((a) => a.id)];
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

<BundleVsAccessoryInfo bind:open={differenceOpen} />
