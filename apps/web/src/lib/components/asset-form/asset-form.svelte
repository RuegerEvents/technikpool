<script lang="ts" module>
	/**
	 * A product already in the catalogue, picked instead of typed. `reset` takes
	 * this where it would otherwise take a name, so a picker that lists products
	 * under its units can hand one straight over with nothing left to fill in.
	 */
	export type NewAssetSeed = {
		manufacturer: { id: string | null; name: string };
		product: { id: string; name: string };
	};
</script>

<script lang="ts">
	// The one form that registers equipment. /assets/new shows it whole; the
	// "new device" dialog (NewAssetModal) shows it compact, for one cable that
	// turned out not to be in the system while packing a case or fitting a unit.
	// Both are the same form so a fix reaches both — they used to be two, and
	// did not.
	//
	// What the two differ in is passed in, not decided here:
	// - `orgs`: a choice of organization (the page); without it the unit's org
	//   is `organizationId` (the dialog knows it from the unit or kit).
	// - `parentAssetId` / `bundleId`: where the unit lands — as an accessory of
	//   a unit, or into a kit — created already in place.
	// - `locations`: offer a location. Left out where the destination decides it
	//   (an accessory sits where its unit sits).
	// - `compact`: no per-unit serial grid, no pasted tag list, at most 20.
	//   Those belong to registering a delivery.
	//
	// A cable is described rather than picked: its ends and length are what
	// make it that product. So the cable tab skips the manufacturer and product
	// pickers for the same fields the product form has, and the server files it
	// with no manufacturer — reusing an identical cable product where the
	// catalogue already has one.
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { CameraScanButton } from '#lib/components/ui/camera-scan/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { AssetTagInput } from '#lib/components/ui/asset-tag-input/index.js';
	import { ProductThumb } from '#lib/components/ui/product-thumb/index.js';
	import { CreatableSelect } from '#lib/components/ui/creatable-select/index.js';
	import { ImageUpload } from '#lib/components/ui/image-upload/index.js';
	import {
		LocationSelect,
		defaultLocationFor,
		type LocationOption
	} from '#lib/components/ui/location-select/index.js';
	import {
		ProductFields,
		cableInputFrom,
		type ProductDraft
	} from '#lib/components/ui/product-fields/index.js';
	import SerialNumberWarning from '#lib/components/SerialNumberWarning.svelte';
	import AssetTagHint from './asset-tag-hint.svelte';
	import { previewAutoTags } from '#lib/asset-tag-preview.js';
	import { manufacturerIdOf, withNoManufacturer } from '#lib/no-manufacturer.svelte.js';
	import { messageForErrorCode } from '#lib/error-messages.svelte.js';
	import { getErrorMessage, orgLabel, plural } from '#lib/utils.js';
	import { getNextAssetTag } from '#lib/remote/orgs.remote.js';
	import {
		createAssets,
		getCategories,
		getDefaultLocations,
		getManufacturers,
		getProductAccessoryProfile,
		getProducts
	} from '#lib/remote/assets.remote.js';

	type Selection = { id: string | null; name: string } | null;
	type Kind = 'device' | 'cable';
	type Org = { id: string; name: string; shortName: string | null; assetIdPrefix: string };

	type Props = {
		/** The org the units belong to; with `orgs`, the one picked from them. */
		organizationId?: string;
		/** Orgs to pick from. Left out where the destination fixes the org. */
		orgs?: Org[];
		parentAssetId?: string;
		bundleId?: string;
		/** Offer a location picker with these; left out where the destination decides. */
		locations?: LocationOption[];
		/** The location to start on — the kit's own, or the unit being copied. */
		locationId?: string;
		/** Accessories are labelled far less often than they aren't. */
		defaultNoTag?: boolean;
		compact?: boolean;
		/** What to start with — see `reset`. Applied once, when the form appears. */
		seed?: string | NewAssetSeed;
		/** The form's id, for a submit button outside it (a dialog's footer). */
		formId: string;
		/** While the units are being created. */
		saving?: boolean;
		/** How many units, for a caller's button. */
		quantity?: number;
		onCreated: (created: Awaited<ReturnType<typeof createAssets>>) => void;
	};

	let {
		organizationId = $bindable(''),
		orgs,
		parentAssetId,
		bundleId,
		locations,
		locationId,
		defaultNoTag = false,
		compact = false,
		seed: initialSeed,
		formId,
		saving = $bindable(false),
		quantity = $bindable(1),
		onCreated
	}: Props = $props();

	let MAX_UNITS = $derived(compact ? 20 : 50);

	// ── Organization and location ───────────────────────────────────────────────
	$effect(() => {
		if (orgs && orgs.length > 0 && !orgs.some((o) => o.id === organizationId)) {
			organizationId = orgs[0].id;
		}
	});
	let orgPrefix = $derived(orgs?.find((o) => o.id === organizationId)?.assetIdPrefix ?? null);

	let chosenLocationId = $state('');
	let ownLocations = $derived((locations ?? []).filter((l) => l.organizationId === organizationId));
	// Held, not read inline, so the star is in hand by the time it is needed.
	let defaultsQuery = $derived(getDefaultLocations());
	// The org the location was last chosen for: another org's units start on its own shelf.
	let locationOrgId = '';
	$effect(() => {
		if (!locations || !organizationId) return;
		if (locations.length === 0) {
			chosenLocationId = '';
			return;
		}
		// Wait for the star, or the first shelf would be picked and stay picked.
		if (!defaultsQuery.ready) return;
		if (locationOrgId !== organizationId || !locations.some((l) => l.id === chosenLocationId)) {
			locationOrgId = organizationId;
			chosenLocationId =
				locationId && locations.some((l) => l.id === locationId)
					? locationId
					: defaultLocationFor(locations, organizationId, defaultsQuery.current);
		}
	});

	// ── What is being registered ────────────────────────────────────────────────
	let kind = $state<Kind>('device');
	let manufacturer = $state<Selection>(null);
	let newManufacturerLogoPath = $state('');
	let product = $state<Selection>(null);
	// A product typed in rather than picked is described in the product dialog
	// — category, photo, price, and whether it is a cable or a license — and is
	// a draft until the units are saved. Null until that dialog is confirmed.
	let pendingProduct = $state<ProductDraft | null>(null);
	let productDraft = $state<ProductDraft>(emptyProductDraft());
	let productDialogOpen = $state(false);
	let cableDraft = $state<ProductDraft>(emptyCableDraft());
	// Remounts the product picker when the manufacturer changes, so a stale
	// selection can't survive into a different catalogue.
	let manufacturerKey = $state(0);
	// What was typed into the picker that sent the dialog here: the name of a
	// product nobody has registered yet, described once the maker is known.
	let seed = $state('');

	let categoriesQuery = $derived(getCategories());
	let categories = $derived(categoriesQuery.current ?? []);
	let manufacturersQuery = $derived(getManufacturers());
	let manufacturers = $derived(manufacturersQuery.current ?? []);
	// undefined while the manufacturer is one being typed in: it has no products yet.
	let chosenManufacturerId = $derived(manufacturer ? manufacturerIdOf(manufacturer) : undefined);
	let isNewProduct = $derived(kind === 'device' && product !== null && product.id === null);

	// What the org's other units of the chosen product carry. A fixture is
	// registered without its brackets far more often than someone means to leave
	// them off, so it is asked here — never for an accessory, which is already
	// one level deep and has none of its own.
	// Read without awaiting: a form that suspends holds back the page around it.
	let accessoryQuery = $derived(
		kind === 'device' && organizationId && product?.id && !parentAssetId
			? getProductAccessoryProfile({ productId: product.id, organizationId })
			: null
	);
	let accessoryProfile = $derived(accessoryQuery?.current ?? null);
	let accessorySummary = $derived(
		accessoryProfile?.accessories.map((a) => `${a.perUnit}× ${a.name}`).join(' · ') ?? ''
	);
	let copyAccessories = $state(true);
	// Where those copies come from. Off by default: a unit being registered now
	// is usually a delivery, and a delivery arrives with its own cables.
	let reuseAccessories = $state(false);
	let reusableSummary = $derived(
		accessoryProfile?.accessories
			.filter((a) => a.freeStock > 0)
			.map((a) => `${a.freeStock}× ${a.name}`)
			.join(' · ') ?? ''
	);

	// An unclassified thing is Miscellaneous until someone says otherwise.
	// Refills for every new draft.
	$effect(() => {
		if (productDraft.categoryId) return;
		const misc = categories.find((c) => c.name.toLowerCase() === 'miscellaneous');
		if (misc) productDraft.categoryId = misc.id;
	});
	$effect(() => {
		if (cableDraft.categoryId) return;
		const misc = categories.find((c) => c.name.toLowerCase() === 'miscellaneous');
		if (misc) cableDraft.categoryId = misc.id;
	});

	// A fresh object every time, and every field of it: ProductFields keys its
	// "is the name still the derived one?" bookkeeping to the draft it was
	// handed, and carrying the last product's photo or price into the next one
	// is how two devices in a row used to share a picture.
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

	function emptyCableDraft(): ProductDraft {
		return {
			...emptyProductDraft(),
			cable: { cableType: '', connectorA: '', connectorB: '', lengthM: '', ways: [] }
		};
	}

	/** Opens the product dialog for a name typed into the picker, or to edit the draft again. */
	function describeProduct(name: string) {
		productDraft =
			pendingProduct && pendingProduct.name === name
				? { ...pendingProduct }
				: { ...emptyProductDraft(), name };
		productDialogOpen = true;
	}

	function confirmProduct() {
		if (!productDraft.name.trim()) {
			toast.error('Please choose or name a product');
			return;
		}
		if (!productDraft.categoryId) {
			toast.error('A new product needs a category');
			return;
		}
		pendingProduct = { ...productDraft, name: productDraft.name.trim() };
		product = { id: null, name: pendingProduct.name };
		// A cable or a license rarely carries a sticker — set on the way in only,
		// so unticking it afterwards sticks.
		if (cableInputFrom(pendingProduct.cable) || pendingProduct.isLicense) noTag = true;
		productDialogOpen = false;
	}

	function cancelProduct() {
		productDialogOpen = false;
		// Typed and then abandoned: nothing to create it from.
		if (!pendingProduct) product = null;
	}

	function removeNewProduct() {
		product = null;
		pendingProduct = null;
		manufacturerKey++;
	}

	function handleManufacturer(sel: Selection) {
		manufacturer = sel;
		product = null;
		pendingProduct = null;
		manufacturerKey++;
		if (seed && sel) {
			describeProduct(seed);
			seed = '';
		}
	}

	function setKind(next: Kind) {
		kind = next;
		// A cable goes without a sticker far more often than with one. Switching
		// back restores what this form defaults to.
		noTag = next === 'cable' || defaultNoTag;
	}

	// ── Units: how many, tags and serials ───────────────────────────────────────
	let noTag = $state(false);
	let items = $state<{ serialNumber: string; assetTag: string }[]>([
		{ serialNumber: '', assetTag: '' }
	]);
	// Where the org numbers units created without a tag, the next number — so a
	// blank field says what it will become. Null where it doesn't.
	let nextTagQuery = $derived(organizationId ? getNextAssetTag(organizationId) : null);
	let nextTag = $derived(nextTagQuery?.current ?? null);
	let autoTags = $derived(
		previewAutoTags(
			nextTag,
			items.map((item) => item.assetTag)
		)
	);
	// Serials one per unit in the full form; in the compact one only for a
	// single unit — several at once are a delivery of identical things, and the
	// serials can go on afterwards.
	let askSerials = $derived(kind === 'device' && (!compact || quantity === 1));

	function setQuantity(n: number) {
		quantity = Math.max(1, Math.min(MAX_UNITS, Math.round(n) || 1));
		// Keeps what was already typed; a shorter list drops the tail.
		items = Array.from(
			{ length: quantity },
			(_, i) => items[i] ?? { serialNumber: '', assetTag: '' }
		);
	}

	// A list of tags in one go — pasted from a spreadsheet, or scanned one after
	// another with a handheld in keyboard mode, which ends every code with Enter.
	// Each line becomes a unit; serial numbers typed so far stay on their row.
	let tagListOpen = $state(false);
	let tagListText = $state('');
	let tagList = $derived(
		tagListText
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean)
	);

	function openTagList() {
		tagListText = items
			.map((item) => item.assetTag.trim())
			.filter(Boolean)
			.join('\n');
		tagListOpen = true;
	}

	function applyTagList() {
		if (tagList.length === 0 || tagList.length > MAX_UNITS) return;
		const serials = items.map((item) => item.serialNumber);
		quantity = tagList.length;
		items = tagList.map((assetTag, i) => ({ assetTag, serialNumber: serials[i] ?? '' }));
		noTag = false;
		tagListOpen = false;
	}

	/**
	 * Starts the form over — before a dialog opens, and after "create another".
	 * A string is whatever was typed into the picker that sent us here, almost
	 * always the name of a product nobody has registered yet; a `NewAssetSeed`
	 * is one that already exists, and fills both pickers in. `keepPlacement`
	 * leaves org, location and how many alone: the next unit of a delivery goes
	 * where the last one went.
	 */
	export function reset(
		seedValue: string | NewAssetSeed = '',
		{ keepPlacement = false }: { keepPlacement?: boolean } = {}
	) {
		const preselected = typeof seedValue === 'string' ? null : seedValue;
		kind = 'device';
		manufacturer = preselected?.manufacturer ?? null;
		product = preselected?.product ?? null;
		newManufacturerLogoPath = '';
		pendingProduct = null;
		productDraft = emptyProductDraft();
		productDialogOpen = false;
		cableDraft = emptyCableDraft();
		noTag = defaultNoTag;
		copyAccessories = true;
		reuseAccessories = false;
		if (!keepPlacement) {
			quantity = 1;
			locationOrgId = '';
			chosenLocationId =
				locationId ??
				(locations && organizationId
					? defaultLocationFor(locations, organizationId, defaultsQuery.current)
					: '');
		}
		items = Array.from({ length: quantity }, () => ({ serialNumber: '', assetTag: '' }));
		manufacturerKey++;
		seed = typeof seedValue === 'string' ? seedValue.trim() : '';
	}

	// A dialog's contents appear with it, so each opening starts here.
	onMount(() => reset(initialSeed ?? ''));

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!organizationId) return;
		const cable = kind === 'cable' ? cableInputFrom(cableDraft.cable) : null;
		if (kind === 'cable') {
			if (!cable) {
				toast.error('Describe the cable — its ends, a length or a type');
				return;
			}
			if (!cableDraft.name.trim()) {
				toast.error('Please name the cable');
				return;
			}
			if (!cableDraft.categoryId) {
				toast.error('A new product needs a category');
				return;
			}
		} else {
			if (!manufacturer?.name.trim()) {
				toast.error('Please choose or name a manufacturer');
				return;
			}
			if (!product?.name.trim()) {
				toast.error('Please choose or name a product');
				return;
			}
			if (isNewProduct && !pendingProduct) {
				describeProduct(product.name);
				return;
			}
		}
		if (locations && !chosenLocationId) {
			toast.error('Please select a location');
			return;
		}
		// A blank tag is the org's next number where it numbers its units, and a
		// unit someone forgot everywhere else — a tag is what is on the sticker.
		if (!noTag && !nextTag && items.some((item) => !item.assetTag.trim())) {
			toast.error(messageForErrorCode('asset_tag_required'));
			return;
		}

		saving = true;
		try {
			const productRef =
				kind === 'cable'
					? {
							// No manufacturer on purpose — see the note at the top.
							newProductName: cableDraft.name.trim(),
							newProductImagePath: cableDraft.imagePath || undefined,
							newProductCable: cable ?? undefined,
							categoryId: cableDraft.categoryId
						}
					: {
							manufacturerId: chosenManufacturerId ?? undefined,
							newManufacturerName: manufacturer?.id ? undefined : manufacturer?.name.trim(),
							newManufacturerLogoPath: manufacturer?.id
								? undefined
								: newManufacturerLogoPath || undefined,
							productId: product?.id ?? undefined,
							...(product?.id || !pendingProduct
								? {}
								: {
										newProductName: pendingProduct.name,
										newProductImagePath: pendingProduct.imagePath || undefined,
										newProductNetPurchasePrice: pendingProduct.netPurchasePrice,
										newProductCable: cableInputFrom(pendingProduct.cable) ?? undefined,
										newProductIsLicense: pendingProduct.isLicense || undefined,
										categoryId: pendingProduct.categoryId
									}),
							copyProductAccessories:
								copyAccessories && (accessoryProfile?.accessories.length ?? 0) > 0
									? true
									: undefined,
							reuseExistingAccessories:
								copyAccessories && reuseAccessories && reusableSummary ? true : undefined
						};
			const created = await createAssets({
				organizationId,
				// Overridden server-side by the parent's or the kit's own location
				// where there is one, but the command always requires a location.
				locationId: chosenLocationId || locationId || '',
				parentAssetId,
				bundleId,
				...productRef,
				items: items.map((item) => ({
					serialNumber: askSerials ? item.serialNumber.trim() || undefined : undefined,
					assetTag: noTag ? undefined : item.assetTag.trim() || undefined,
					noAssetTag: noTag || undefined
				}))
			});
			onCreated(created);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving = false;
		}
	}
</script>

<form id={formId} class="space-y-5" onsubmit={handleSubmit}>
	{#if orgs}
		<div class="space-y-2">
			<Label for="{formId}-org">Organization</Label>
			<select
				id="{formId}-org"
				bind:value={organizationId}
				required
				disabled={saving}
				class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
			>
				{#each orgs as org (org.id)}<option value={org.id}>{orgLabel(org)}</option>{/each}
			</select>
		</div>
	{/if}

	<!-- Two ways to say what is being registered, not two forms: how many, the
	     tags and the location below are the same either way. -->
	<div class="flex gap-1 rounded-md border p-1 text-sm">
		<button
			type="button"
			aria-pressed={kind === 'device'}
			disabled={saving}
			onclick={() => setKind('device')}
			class="flex-1 rounded px-3 py-1.5 transition-colors {kind === 'device'
				? 'bg-primary text-primary-foreground'
				: 'hover:bg-muted'}">Device</button
		>
		<button
			type="button"
			aria-pressed={kind === 'cable'}
			disabled={saving}
			onclick={() => setKind('cable')}
			class="flex-1 rounded px-3 py-1.5 transition-colors {kind === 'cable'
				? 'bg-primary text-primary-foreground'
				: 'hover:bg-muted'}">Cable</button
		>
	</div>

	{#if kind === 'device'}
		<div class="space-y-2">
			<Label>Manufacturer</Label>
			<CreatableSelect
				items={withNoManufacturer(manufacturers)}
				value={manufacturer}
				onchange={handleManufacturer}
				placeholder="Search or create manufacturer…"
				disabled={saving}
			/>
		</div>

		{#if manufacturer && manufacturer.id === null && !compact}
			<div class="space-y-2">
				<Label>Manufacturer logo</Label>
				<ImageUpload bind:value={newManufacturerLogoPath} label="Manufacturer logo" />
			</div>
		{/if}

		<!-- A manufacturer typed in just now has no products yet. -->
		{#if manufacturer}
			{#key manufacturerKey}
				{@const productsQuery =
					chosenManufacturerId === undefined ? null : getProducts(chosenManufacturerId)}
				{@const products = productsQuery?.current ?? []}
				<div class="space-y-2">
					<Label>Product Model</Label>
					{#if product && product.id === null && pendingProduct}
						<!-- Shown as picked, not left in the search field: there the list
						     reopened and still offered to create it, as if nothing had
						     happened. It is created along with the units. -->
						<div class="flex items-center gap-3 rounded-md border px-3 py-2">
							<ProductThumb
								path={pendingProduct.imagePath || null}
								alt={pendingProduct.name}
								size={36}
							/>
							<div class="min-w-0 flex-1">
								<p class="flex items-center gap-2 font-medium">
									<span class="truncate">{pendingProduct.name}</span>
									<span
										class="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300"
										>New</span
									>
								</p>
								<p class="text-xs text-muted-foreground">
									{categories.find((c) => c.id === pendingProduct?.categoryId)?.name ?? ''} · Created
									when the device is saved
								</p>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								disabled={saving}
								onclick={() => pendingProduct && describeProduct(pendingProduct.name)}>Edit</Button
							>
							<Button
								type="button"
								icon="close"
								variant="ghost"
								size="icon-sm"
								aria-label="Remove new product"
								title="Remove new product"
								disabled={saving}
								onclick={removeNewProduct}
							/>
						</div>
					{:else}
						<CreatableSelect
							items={products}
							value={product}
							onchange={(sel) => {
								product = sel;
								pendingProduct = null;
							}}
							oncreate={describeProduct}
							placeholder="Search or create product…"
							disabled={saving}
						/>
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
						disabled={saving}
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
							disabled={saving}
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
	{:else}
		<p class="text-xs text-muted-foreground">
			No manufacturer to pick: a cable is filed as Generic / unknown manufacturer, and a cable with
			the same ends and length already in the catalogue is reused rather than added twice.
		</p>
		<ProductFields
			{categories}
			bind:value={cableDraft}
			idPrefix="{formId}-cable"
			showPrice={false}
		/>
	{/if}

	{#if locations}
		<div class="space-y-2">
			<Label for="{formId}-location">Location</Label>
			<LocationSelect
				id="{formId}-location"
				{locations}
				ownerOrgId={organizationId}
				bind:value={chosenLocationId}
				disabled={saving}
			/>
			{#if organizationId && ownLocations.length === 0}
				<p class="text-sm text-muted-foreground">
					No locations yet. Create one in
					<a class="underline" href={resolve(`orgs/${organizationId}/locations`)}>Locations</a>.
				</p>
			{/if}
		</div>
	{/if}

	<div class="space-y-2">
		<Label for="{formId}-quantity">Quantity</Label>
		<Input
			id="{formId}-quantity"
			type="number"
			min="1"
			max={MAX_UNITS}
			value={quantity}
			oninput={(e) => setQuantity(Number(e.currentTarget.value))}
			disabled={saving}
			class="w-24"
		/>
	</div>

	<div class="space-y-1">
		<label class="flex cursor-pointer items-center gap-2 text-sm select-none">
			<input
				type="checkbox"
				bind:checked={noTag}
				disabled={saving}
				class="h-4 w-4 rounded border-input"
			/>
			No asset tag (e.g. cables, consumables)
		</label>
		<p class="text-xs text-muted-foreground">
			Without a tag the unit can't be scanned, and an inspection record has nothing to hang off — so
			anything DGUV-relevant wants one.
		</p>
	</div>

	{#if !noTag && !compact}
		<button
			type="button"
			onclick={openTagList}
			class="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
			>Paste or scan a list of tags…</button
		>
	{/if}

	{#if quantity > 1 && (!noTag || askSerials)}
		<div class="overflow-x-auto rounded-lg border">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b bg-muted/40">
						<th class="w-10 px-3 py-2 text-left font-medium text-muted-foreground">#</th>
						{#if !noTag}
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Asset Tag</th>
						{/if}
						{#if askSerials}
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Serial Number</th>
						{/if}
					</tr>
				</thead>
				<tbody>
					{#each items as item, i (i)}
						<tr class="border-b last:border-0">
							<td class="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
							{#if !noTag}
								<td class="px-3 py-2">
									<div class="flex gap-2">
										<AssetTagInput
											bind:value={item.assetTag}
											auto={autoTags[i]}
											disabled={saving}
											placeholder={orgPrefix ? `${orgPrefix}…` : 'Scan or type'}
											class="h-8 text-sm"
										/>
										<CameraScanButton
											class="size-8"
											disabled={saving}
											onscan={(code) => (item.assetTag = code)}
										/>
									</div>
								</td>
							{/if}
							{#if askSerials}
								<td class="px-3 py-2">
									<div class="flex gap-2">
										<Input
											bind:value={item.serialNumber}
											placeholder="S/N 123456"
											disabled={saving}
											class="h-8 text-sm"
										/>
										<CameraScanButton
											class="size-8"
											disabled={saving}
											onscan={(code) => (item.serialNumber = code)}
										/>
									</div>
									<SerialNumberWarning serialNumber={item.serialNumber} paused={saving} />
								</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if !noTag && !nextTag && nextTagQuery?.ready && organizationId}
			<AssetTagHint {organizationId} {items} />
		{/if}
	{:else if quantity === 1}
		{#if !noTag}
			<div class="space-y-2">
				<Label for="{formId}-tag">Asset Tag</Label>
				<div class="flex gap-2">
					<AssetTagInput
						id="{formId}-tag"
						bind:value={items[0].assetTag}
						auto={autoTags[0]}
						disabled={saving}
						placeholder={orgPrefix ? `${orgPrefix}…` : 'Scan or type the sticker'}
					/>
					<CameraScanButton disabled={saving} onscan={(code) => (items[0].assetTag = code)} />
				</div>
				{#if !nextTag && nextTagQuery?.ready && organizationId}
					<AssetTagHint {organizationId} {items} />
				{/if}
			</div>
		{/if}
		{#if askSerials}
			<div class="space-y-2">
				<Label for="{formId}-serial">Serial Number</Label>
				<div class="flex gap-2">
					<Input
						id="{formId}-serial"
						bind:value={items[0].serialNumber}
						placeholder="S/N 123456"
						disabled={saving}
					/>
					<CameraScanButton disabled={saving} onscan={(code) => (items[0].serialNumber = code)} />
				</div>
				<SerialNumberWarning serialNumber={items[0].serialNumber} paused={saving} />
			</div>
		{/if}
	{/if}
</form>

<!-- Stacked on top of a dialog the form may sit in; the modal stack keeps Escape to the top one. -->
<Modal bind:open={productDialogOpen} title="New product" size="xl" onclose={cancelProduct}>
	<!-- Body first, snippets after: see CLAUDE.md, wuchale. -->
	{#snippet children()}
		<ProductFields {categories} bind:value={productDraft} idPrefix="{formId}-product" />
	{/snippet}
	{#snippet description()}
		Fill in the details for the new product model. It is created along with the device.
	{/snippet}
	{#snippet footer()}
		<Button icon="add" type="button" onclick={confirmProduct}>Add Product</Button>
		<Button icon="close" type="button" variant="outline" onclick={cancelProduct}>Cancel</Button>
	{/snippet}
</Modal>

<Modal bind:open={tagListOpen} title="List of asset tags" size="md">
	{#snippet children()}
		<div class="space-y-2">
			<textarea
				bind:value={tagListText}
				rows="10"
				aria-label="Asset tags"
				placeholder="One tag per line"
				class="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-ring focus:outline-none"
			></textarea>
			<p class="text-sm text-muted-foreground">
				{#if tagList.length > MAX_UNITS}
					At most {MAX_UNITS} devices at a time.
				{:else}
					{plural(tagList.length, ['# device', '# devices'])}
				{/if}
			</p>
		</div>
	{/snippet}
	{#snippet description()}
		One tag per line. Paste them, or scan one after another with a handheld scanner — each scan ends
		the line. Every line becomes a device.
	{/snippet}
	{#snippet footer()}
		<Button disabled={tagList.length === 0 || tagList.length > MAX_UNITS} onclick={applyTagList}
			>Apply</Button
		>
		<Button icon="close" variant="outline" onclick={() => (tagListOpen = false)}>Cancel</Button>
	{/snippet}
</Modal>
