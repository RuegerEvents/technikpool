<script lang="ts" module>
	/**
	 * A product already in the catalogue, picked instead of typed. `reset` takes
	 * this where it would otherwise take a name, so a picker that lists products
	 * under its units can hand one straight over with nothing left to fill in.
	 */
	export type NewAssetSeed = {
		manufacturer: { id: string; name: string };
		product: { id: string; name: string };
	};

	/** What `bind:this` gives a caller. */
	export type NewAssetModalHandle = { reset: (seed?: string | NewAssetSeed) => void };
</script>

<script lang="ts">
	// Registering a unit at the moment you need it, rather than being sent to
	// /assets/new and back to put it where it belongs. Two places need exactly
	// this: an accessory on the asset detail page, and a member on the bundle
	// page. They differ only in where the unit lands and whether a location has
	// to be asked for, so both go through `createAssets` with `parentAssetId` or
	// `bundleId` set and the unit is created already in place.
	//
	// This is deliberately smaller than /assets/new: no image, no price, no
	// per-unit serial grid. Those belong to registering a shipment; this is one
	// cable that turned out not to be in the system.
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Modal } from '$lib/components/ui/modal';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CreatableSelect } from '$lib/components/ui/creatable-select';
	import { CategorySelect } from '$lib/components/ui/category-select';
	import { ImageUpload } from '$lib/components/ui/image-upload';
	import { getErrorMessage } from '$lib/utils';
	import { toast } from 'svelte-sonner';
	import {
		createAssets,
		getCategories,
		getManufacturers,
		getProductAccessoryProfile,
		getProducts
	} from '$lib/remote/assets.remote';

	type Selection = { id: string | null; name: string } | null;
	type LocationOption = { id: string; name: string; address?: { city: string | null } | null };

	type Props = {
		open: boolean;
		organizationId: string;
		heading: string;
		/** Where the unit lands. Exactly one — an accessory's kit is its parent's. */
		parentAssetId?: string;
		bundleId?: string;
		/**
		 * Offer a location picker. Leave unset where the destination already
		 * decides it (a parent's location, a kit's own) — asking would imply a
		 * choice the server is going to override.
		 */
		locations?: LocationOption[];
		locationId?: string;
		/** Accessories are labelled far less often than they aren't. */
		defaultNoTag?: boolean;
		description?: Snippet;
		/** The created units, so a caller collecting them can take them straight. */
		onCreated?: (assets: Awaited<ReturnType<typeof createAssets>>) => void;
	};

	let {
		open = $bindable(false),
		organizationId,
		heading,
		parentAssetId,
		bundleId,
		locations,
		locationId,
		defaultNoTag = false,
		description,
		onCreated
	}: Props = $props();

	let manufacturer = $state<Selection>(null);
	let product = $state<Selection>(null);
	let categoryId = $state('');
	let quantity = $state(1);
	let tag = $state('');
	let serial = $state('');
	// Set from `defaultNoTag` by reset(), which every caller runs before opening —
	// reading the prop here would capture only its first value.
	let noTag = $state(false);
	let imagePath = $state('');
	let chosenLocationId = $state('');
	let saving = $state(false);
	// Remounts the product picker when the manufacturer changes, so a stale
	// selection can't survive into a different catalogue.
	let manufacturerKey = $state(0);
	let seed = $state('');

	// Gated on `open`: this component is mounted on three pages and spends most
	// of its life closed, and an async derived nothing reads until it opens is
	// both a wasted round trip and the await_waterfall warning.
	let categories = $derived(open ? await getCategories() : []);
	let manufacturers = $derived(open ? await getManufacturers() : []);
	let productsForManufacturer = $derived(
		open && manufacturer?.id ? await getProducts(manufacturer.id) : []
	);
	// A brand-new product needs a category and is the only case where a photo can
	// be set: the image belongs to the product, and an existing one already has
	// its own (edited from the asset detail page, where it applies to every unit).
	let isNewProduct = $derived(product !== null && product.id === null);

	// What the org's other units of the chosen product already carry. Only asked
	// once an existing product is picked, and never for an accessory: that is
	// already one level deep, and an accessory has no accessories of its own.
	let copyable = $derived(
		open && product?.id && !parentAssetId
			? await getProductAccessoryProfile({ productId: product.id, organizationId })
			: null
	);
	let copyableSummary = $derived(
		copyable?.accessories.map((a) => `${a.perUnit}× ${a.name}`).join(' · ') ?? ''
	);
	let copyAccessories = $state(true);

	// Same defaulting the product wizard uses: an unclassified thing is
	// Miscellaneous until someone says otherwise. Refills after every reset.
	$effect(() => {
		if (categoryId) return;
		const misc = categories.find((c) => c.name.toLowerCase() === 'miscellaneous');
		if (misc) categoryId = misc.id;
	});

	/**
	 * Call before setting `open` — resets the form and seeds the product. A
	 * string is whatever was typed into the picker that sent us here, which is
	 * almost always the name of a product nobody has registered yet; a
	 * `NewAssetSeed` is one that already exists, and fills both pickers in.
	 */
	export function reset(seedValue: string | NewAssetSeed = '') {
		const preselected = typeof seedValue === 'string' ? null : seedValue;
		manufacturer = preselected?.manufacturer ?? null;
		product = preselected?.product ?? null;
		categoryId = '';
		quantity = 1;
		tag = '';
		serial = '';
		noTag = defaultNoTag;
		imagePath = '';
		copyAccessories = true;
		chosenLocationId = locationId ?? locations?.[0]?.id ?? '';
		manufacturerKey++;
		seed = typeof seedValue === 'string' ? seedValue.trim() : '';
	}

	function handleManufacturer(sel: Selection) {
		manufacturer = sel;
		product = seed ? { id: null, name: seed } : null;
		manufacturerKey++;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!manufacturer?.name.trim()) {
			toast.error('Please choose or name a manufacturer');
			return;
		}
		if (!product?.name.trim()) {
			toast.error('Please choose or name a product');
			return;
		}
		if (isNewProduct && !categoryId) {
			toast.error('A new product needs a category');
			return;
		}
		if (locations && !chosenLocationId) {
			toast.error('Please select a location');
			return;
		}
		saving = true;
		try {
			const created = await createAssets({
				organizationId,
				// Overridden server-side by the parent's or the kit's own location
				// where there is one, but the command always requires a location.
				locationId: chosenLocationId || locationId || '',
				parentAssetId,
				bundleId,
				manufacturerId: manufacturer.id ?? undefined,
				newManufacturerName: manufacturer.id ? undefined : manufacturer.name.trim(),
				productId: product.id ?? undefined,
				newProductName: product.id ? undefined : product.name.trim(),
				newProductImagePath: product.id ? undefined : imagePath || undefined,
				categoryId: product.id ? undefined : categoryId,
				copyProductAccessories:
					copyAccessories && (copyable?.accessories.length ?? 0) > 0 ? true : undefined,
				items: Array.from({ length: quantity }, () => ({
					// A serial number and a typed tag identify one physical unit, so
					// they are only offered when exactly one is being created.
					serialNumber: quantity === 1 ? serial.trim() || undefined : undefined,
					assetTag: quantity === 1 && !noTag ? tag.trim() || undefined : undefined,
					noAssetTag: noTag || undefined
				}))
			});
			open = false;
			onCreated?.(created);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving = false;
		}
	}
</script>

<Modal bind:open title={heading} dismissible={!saving} {description}>
	<form id="new-asset-form" class="space-y-4" onsubmit={handleSubmit}>
		<div class="space-y-2">
			<Label>Manufacturer</Label>
			<CreatableSelect
				items={manufacturers}
				value={manufacturer}
				onchange={handleManufacturer}
				oncreate={(name) => handleManufacturer({ id: null, name })}
				placeholder="Search or type a new one…"
				disabled={saving}
			/>
		</div>

		{#if manufacturer}
			{#key manufacturerKey}
				<div class="space-y-2">
					<Label>Product</Label>
					<CreatableSelect
						items={manufacturer.id ? productsForManufacturer : []}
						bind:value={product}
						placeholder="Search or type a new one…"
						disabled={saving}
					/>
				</div>
			{/key}
		{/if}

		{#if isNewProduct}
			<div class="space-y-2">
				<Label>Category</Label>
				<CategorySelect {categories} bind:value={categoryId} disabled={saving} />
				<p class="text-xs text-muted-foreground">
					"{product?.name}" is new, so it needs a category. It becomes a product like any other —
					the next unit of it is picked from the list.
				</p>
			</div>
			<div class="space-y-2">
				<Label>Product photo</Label>
				<ImageUpload bind:value={imagePath} label="Product photo" />
			</div>
		{/if}

		{#if copyable && copyable.accessories.length > 0}
			<label class="flex items-start gap-2 text-sm">
				<input
					type="checkbox"
					bind:checked={copyAccessories}
					disabled={saving}
					class="mt-0.5 h-4 w-4 rounded border-input"
				/>
				<span>
					Also create what the other units carry
					<span class="block text-xs text-muted-foreground">
						{copyableSummary} — each new unit gets its own, attached.
					</span>
				</span>
			</label>
		{/if}

		{#if locations}
			<div class="space-y-2">
				<Label for="newAssetLocation">Location</Label>
				<select
					id="newAssetLocation"
					bind:value={chosenLocationId}
					disabled={saving}
					class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#each locations as loc (loc.id)}
						{@const city = loc.address?.city?.trim()}
						<option value={loc.id}>{city ? `${loc.name} (${city})` : loc.name}</option>
					{/each}
				</select>
			</div>
		{/if}

		<div class="space-y-2">
			<Label for="newAssetQty">How many</Label>
			<Input
				id="newAssetQty"
				type="number"
				min="1"
				max="20"
				value={quantity}
				oninput={(e) => (quantity = Math.max(1, Math.min(20, Number(e.currentTarget.value) || 1)))}
				disabled={saving}
			/>
		</div>

		<label class="flex items-center gap-2 text-sm">
			<input
				type="checkbox"
				bind:checked={noTag}
				disabled={saving}
				class="h-4 w-4 rounded border-input"
			/>
			No asset tag
		</label>
		<p class="text-xs text-muted-foreground">
			Without a tag the unit can't be scanned, and an inspection record has nothing to hang off — so
			anything DGUV-relevant wants one.
		</p>

		{#if quantity === 1}
			<div class="space-y-2">
				<Label for="newAssetSerial">Serial number</Label>
				<Input id="newAssetSerial" bind:value={serial} disabled={saving} />
			</div>
			{#if !noTag}
				<div class="space-y-2">
					<Label for="newAssetTag">Asset tag</Label>
					<Input
						id="newAssetTag"
						bind:value={tag}
						disabled={saving}
						placeholder="Leave blank for the next free number"
					/>
				</div>
			{/if}
		{/if}
	</form>

	{#snippet footer()}
		<Button type="button" variant="outline" onclick={() => (open = false)} disabled={saving}>
			Cancel
		</Button>
		<!-- The submit lives in the footer, outside the <form> it submits — that is
		     what `form=` is for, and it keeps the buttons pinned while the fields
		     scroll. -->
		<Button type="submit" form="new-asset-form" disabled={saving}>
			{saving ? 'Creating…' : 'Create'}
		</Button>
	{/snippet}
</Modal>
