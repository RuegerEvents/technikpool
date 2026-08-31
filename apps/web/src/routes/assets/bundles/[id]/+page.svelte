<script lang="ts">
	import { categoryLabel } from '$lib/category';
	import { imageSrc } from '$lib/images';
	import { getErrorMessage, orgLabel, plural } from '$lib/utils';
	import { DropdownMenu } from 'bits-ui';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Modal } from '$lib/components/ui/modal';
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
		getProducts,
		addAssetToBundle,
		removeAssetFromBundle,
		updateBundleTemplate,
		updateBundle,
		regenerateBundleImage,
		convertBundleToAccessories
	} from '$lib/remote/assets.remote';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { AssetStatusBadge } from '$lib/components/ui/asset-status';
	import { NewAssetModal, type NewAssetModalHandle } from '$lib/components/ui/new-asset-modal';

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
	let regeneratingImage = $state(false);
	let converting = $state(false);
	let convertOpen = $state(false);
	let mainAssetId = $state('');

	function openConvert() {
		mainAssetId = bundle.assets.find((asset) => !asset.parentAssetId)?.id ?? '';
		convertOpen = true;
	}

	async function handleConvert() {
		if (!mainAssetId) return;
		converting = true;
		try {
			const result = await convertBundleToAccessories({ bundleId, mainAssetId });
			toast.success(
				`Bundle converted — ${plural(result.accessories, ['1 accessory', '# accessories'])} attached`
			);
			await goto(resolve(`/assets/${result.assetId}`));
		} catch (err) {
			toast.error(getErrorMessage(err));
			converting = false;
		}
	}

	async function handleRegenerateImage() {
		regeneratingImage = true;
		try {
			await regenerateBundleImage(bundleId);
			toast.success('Bundle image regenerated');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			regeneratingImage = false;
		}
	}

	// Accessories mirror their parent's bundleId, so they are members of this kit
	// — but they are shown under the unit they are attached to, not as peers, and
	// they can't be removed from here: they leave when the parent does.
	let visibleBundleAssets = $derived.by(() => {
		const filtered = !categoryFilter
			? bundle.assets
			: bundle.assets.filter((a) => a.product.categoryId === categoryFilter);
		const memberIds = new Set(filtered.map((a) => a.id));
		const isNested = (a: (typeof filtered)[number]) =>
			a.parentAssetId !== null && memberIds.has(a.parentAssetId);
		return filtered
			.filter((a) => !isNested(a))
			.flatMap((a) => [
				{ asset: a, nested: false },
				...filtered.filter((c) => c.parentAssetId === a.id).map((c) => ({ asset: c, nested: true }))
			]);
	});

	let availableToAdd = $derived.by(() => {
		const bundleAssetIds = new Set(bundle.assets.map((a) => a.id));
		const q = searchQuery.toLowerCase().trim();
		return allAssets.filter((a) => {
			if (bundleAssetIds.has(a.id)) return false;
			if (a.bundle) return false;
			// An accessory is in whatever kit its parent is in — adding the parent
			// brings it along, and there is no way to add it on its own.
			if (a.parentAssetId) return false;
			if (!q) return true;
			return (
				a.product.name.toLowerCase().includes(q) ||
				a.product.manufacturer.name.toLowerCase().includes(q) ||
				(a.serialNumber?.toLowerCase().includes(q) ?? false)
			);
		});
	});

	// Same idea as the accessory picker on the asset detail page: the unit you
	// want in a kit is often one nobody has registered yet, and being sent to
	// /assets/new and back to add it is the long way round. Created straight
	// into this bundle, so it can't be left loose if something fails.
	let newOpen = $state(false);
	let newAssetModal = $state<NewAssetModalHandle | null>(null);

	function openNewAsset() {
		// The search box is where someone has just failed to find it, so whatever
		// they typed is the best guess at the product name.
		newAssetModal?.reset(searchQuery);
		newOpen = true;
	}

	// Under the loose units, the catalogue. A kit is usually short of a product
	// the pool knows perfectly well and has no spare unit of — every one of them
	// is already in another case — so the list that ends in "nothing matches"
	// carries on into "register one of these instead".
	let catalogue = $derived(await getProducts());
	let productMatches = $derived.by(() => {
		const q = searchQuery.toLowerCase().trim();
		return catalogue
			.map((p) => ({ ...p, label: `${p.manufacturer.name} ${p.name}` }))
			.filter((p) => !q || p.label.toLowerCase().includes(q));
	});

	function openNewAssetOfProduct(p: (typeof productMatches)[number]) {
		newAssetModal?.reset({
			manufacturer: { id: p.manufacturerId, name: p.manufacturer.name },
			product: { id: p.id, name: p.name }
		});
		newOpen = true;
	}

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
			<Button icon="back" variant="outline" href={resolve('/assets')}>Back to Devices</Button>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							class="flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							aria-label="More actions"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="currentColor"
							>
								<circle cx="5" cy="12" r="1.75" />
								<circle cx="12" cy="12" r="1.75" />
								<circle cx="19" cy="12" r="1.75" />
							</svg>
						</button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content
						align="end"
						sideOffset={4}
						class="z-50 min-w-[190px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
					>
						<DropdownMenu.Item
							disabled={bundle.assets.length < 2}
							onSelect={openConvert}
							class="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent"
						>
							Convert to device
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
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
					<Button icon="edit" variant="outline" onclick={() => (editingBundle = true)}>Edit</Button>
				</div>
			</Card.Header>
			<Card.Content>
				<div class="space-y-4">
					<div class="space-y-2">
						{#if bundle.imagePath}
							<img
								src={imageSrc(bundle.imagePath)}
								alt={`Generated preview of ${bundle.template.name}`}
								class="aspect-[4/3] w-full rounded-md border bg-muted/30 object-contain"
							/>
						{/if}
						<Button variant="outline" disabled={regeneratingImage} onclick={handleRegenerateImage}>
							{regeneratingImage ? 'Regenerating…' : 'Regenerate image'}
						</Button>
					</div>
					<div class="space-y-2">
						<Label>Organization</Label>
						<Input value={orgLabel(bundle.template.organization)} disabled />
					</div>
					<div class="space-y-2">
						<Label>Name</Label>
						<Input value={bundle.template.name} disabled />
					</div>
					<div class="space-y-2">
						<Label>Category</Label>
						<div
							class="flex h-10 items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
						>
							<CategoryPill
								name={categoryLabel(bundle.template.category)}
								color={bundle.template.category.color}
							/>
						</div>
					</div>
					<div class="space-y-2">
						<Label>Description</Label>
						<Input value={bundle.template.description ?? '—'} disabled />
					</div>
					<div class="space-y-2">
						<Label>Tag</Label>
						<Input value={bundle.tag ?? '—'} disabled />
					</div>
					<div class="space-y-2">
						<Label>Net purchase price (€)</Label>
						<Input
							value={bundle.netPurchasePrice
								? Number(bundle.netPurchasePrice).toLocaleString('de-DE', {
										style: 'currency',
										currency: 'EUR'
									})
								: 'Not set'}
							disabled
						/>
						<p class="text-xs text-muted-foreground">Billed as one line on offers.</p>
					</div>
					<div class="space-y-2">
						<Label>Location</Label>
						<Input value={bundle.location?.name ?? 'No location'} disabled />
					</div>
				</div>
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
								{#each visibleBundleAssets as { asset, nested } (asset.id)}
									<!-- The whole row navigates, as it does on the Devices list, but the
									     product name is a real anchor so the unit can be opened in a new
									     tab and reached by keyboard. -->
									<tr
										class="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
										onclick={() => goto(resolve(`/assets/${asset.id}`))}
									>
										<td class="px-4 py-3 {nested ? 'pl-10' : ''}">
											<div class="flex items-center gap-2">
												{#if nested}
													<span class="text-muted-foreground">↳</span>
												{/if}
												<ProductThumb path={asset.product.imagePath} alt={asset.product.name} />
												<CategoryPill
													name={categoryLabel(asset.product.category)}
													color={asset.product.category.color}
												/>
												<a
													href={resolve(`/assets/${asset.id}`)}
													class="font-medium hover:underline"
													onclick={(e) => e.stopPropagation()}>{asset.product.name}</a
												>
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
											{#if !nested}
												<Button
													size="sm"
													variant="outline"
													disabled={working}
													onclick={(e) => {
														e.stopPropagation();
														handleRemove(asset.id);
													}}>Remove</Button
												>
											{/if}
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

<Modal bind:open={convertOpen} title="Convert Bundle to Device" dismissible={!converting}>
	{#snippet description()}
		Choose the main device. Every other device in this bundle will become its accessory. The bundle
		instance will be removed; its bundle price and tag will no longer apply. Existing bookings stay
		intact as individual device bookings.
	{/snippet}
	<div class="space-y-4">
		<fieldset class="space-y-2" aria-label="Choose main device">
			{#each bundle.assets as asset (asset.id)}
				<label
					class="flex items-center gap-3 rounded-md border p-3 {asset.parentAssetId
						? 'cursor-not-allowed opacity-50'
						: 'cursor-pointer hover:bg-muted/40'}"
				>
					<input
						type="radio"
						name="main-device"
						value={asset.id}
						bind:group={mainAssetId}
						disabled={asset.parentAssetId !== null || converting}
					/>
					<ProductThumb path={asset.product.imagePath} alt={asset.product.name} />
					<span class="min-w-0">
						<span class="block truncate font-medium">{asset.product.name}</span>
						<span class="block text-xs text-muted-foreground">
							{asset.product.manufacturer.name}{asset.assetTag
								? ` · ${asset.assetTag}`
								: ''}{#if asset.parentAssetId}
								· already an accessory
							{/if}
						</span>
					</span>
				</label>
			{/each}
		</fieldset>
	</div>
	{#snippet footer()}
		<Button
			icon="close"
			variant="outline"
			disabled={converting}
			onclick={() => (convertOpen = false)}
		>
			Cancel
		</Button>
		<Button disabled={converting || !mainAssetId} onclick={handleConvert}>
			{converting ? 'Converting…' : 'Convert bundle'}
		</Button>
	{/snippet}
</Modal>

<Modal bind:open={showAddModal} title="Add Assets to Bundle" size="xl">
	{#snippet description()}
		Only devices without a bundle can be added.
	{/snippet}
	{#snippet headerActions()}
		<Button icon="add" size="sm" disabled={working} onclick={openNewAsset}>New device</Button>
		<Button icon="close" variant="outline" size="sm" onclick={() => (showAddModal = false)}>
			Close
		</Button>
	{/snippet}
	<input
		type="search"
		bind:value={searchQuery}
		placeholder="Search assets…"
		class="mb-3 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
	/>

	{#if availableToAdd.length === 0}
		<p class="text-sm text-muted-foreground">
			{searchQuery.trim()
				? `Nothing here matches "${searchQuery.trim()}".`
				: 'No assets available to add.'}
		</p>
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
									<ProductThumb path={asset.product.imagePath} alt={asset.product.name} />
									<div>
										<p class="font-medium">{asset.product.name}</p>
										<p class="text-xs text-muted-foreground">
											{asset.product.manufacturer.name}
										</p>
									</div>
								</div>
							</td>
							<td class="px-3 py-2 font-mono text-xs">{asset.serialNumber ?? '—'}</td>
							<td class="px-3 py-2 text-xs text-muted-foreground">{orgLabel(asset.organization)}</td
							>
							<td class="px-3 py-2 text-right">
								<Button size="sm" disabled={working} onclick={() => handleAdd(asset.id)}>Add</Button
								>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<!-- The catalogue, under the units. Everything above is a unit standing
	     loose in the warehouse; below is every product the system knows, so a
	     kit short of a thing the pool has no spare of is one click from having
	     one registered straight into it. -->
	<p class="mt-4 mb-2 text-xs font-medium text-muted-foreground">Register a new unit of…</p>
	{#if productMatches.length === 0}
		{#if searchQuery.trim()}
			<p class="text-sm text-muted-foreground">
				No product matches "{searchQuery.trim()}" either.
			</p>
		{/if}
		<Button size="sm" class="mt-3" disabled={working} onclick={openNewAsset}>
			{searchQuery.trim() ? `Register "${searchQuery.trim()}" as a new device` : 'New device'}
		</Button>
	{:else}
		<ul class="max-h-56 divide-y overflow-y-auto rounded-md border">
			{#each productMatches as p (p.id)}
				<li class="flex items-center gap-2 bg-background px-3 py-2">
					<ProductThumb path={p.imagePath} alt={p.name} />
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">{p.name}</p>
						<p class="text-xs text-muted-foreground">{p.manufacturer.name}</p>
					</div>
					<Button
						size="sm"
						variant="outline"
						disabled={working}
						onclick={() => openNewAssetOfProduct(p)}>New</Button
					>
				</li>
			{/each}
		</ul>
	{/if}
</Modal>

<NewAssetModal
	bind:this={newAssetModal}
	bind:open={newOpen}
	organizationId={bundle.template.organizationId}
	bundleId={bundle.id}
	heading="New device"
	{locations}
	locationId={bundle.locationId ?? undefined}
	onCreated={(created) => {
		searchQuery = '';
		toast.success(
			created.length === 1
				? 'Device created and added'
				: `${created.length} devices created and added`
		);
	}}
>
	{#snippet description()}
		Registered and put into {bundle.template.name}{bundle.tag ? ` (${bundle.tag})` : ''} in one step.
	{/snippet}
</NewAssetModal>

<Modal bind:open={editingBundle} title="Edit Bundle" dismissible={!savingBundle}>
	{#snippet description()}
		Name, category, pricing, and location.
	{/snippet}
	<form id="edit-bundle-form" class="space-y-4" onsubmit={handleBundleSave}>
		<div class="space-y-2">
			<Label for="name">Name</Label>
			<Input id="name" bind:value={bundleDraft.name} />
			<p class="text-xs text-muted-foreground">Shared with every instance of this bundle type.</p>
		</div>
		<div class="space-y-2">
			<Label>Category</Label>
			<CategorySelect {categories} bind:value={bundleDraft.categoryId} />
		</div>
		<div class="space-y-2">
			<Label for="description"
				>Description <span class="text-muted-foreground">(optional)</span></Label
			>
			<Input
				id="description"
				bind:value={bundleDraft.description}
				placeholder="What's in this bundle?"
			/>
		</div>
		<div class="space-y-2">
			<Label for="tag">Tag <span class="text-muted-foreground">(optional)</span></Label>
			<Input id="tag" bind:value={bundleDraft.tag} placeholder="e.g. Kit A" />
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
			/>
			<p class="text-xs text-muted-foreground">Billed as one line on offers.</p>
		</div>
		<div class="space-y-2">
			<Label for="location">Location</Label>
			<select
				id="location"
				bind:value={bundleDraft.locationId}
				class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
			>
				<option value="">No location</option>
				{#each locations as loc (loc.id)}
					{@const city = loc.address?.city?.trim()}
					{@const line1 = loc.address?.line1?.trim()}
					{@const addrParts = [line1, city].filter(Boolean).join(', ')}
					<option value={loc.id}>{addrParts ? `${loc.name} (${addrParts})` : loc.name}</option>
				{/each}
			</select>
		</div>
	</form>
	{#snippet footer()}
		<Button
			icon="close"
			type="button"
			variant="outline"
			onclick={() => (editingBundle = false)}
			disabled={savingBundle}
		>
			Cancel
		</Button>
		<Button
			type="submit"
			form="edit-bundle-form"
			disabled={savingBundle || !bundleDraft.name.trim()}
		>
			{savingBundle ? 'Saving…' : 'Save'}
		</Button>
	{/snippet}
</Modal>
