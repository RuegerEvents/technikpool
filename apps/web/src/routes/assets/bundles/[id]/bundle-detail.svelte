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
	import { OrgBadge } from '$lib/components/ui/org-badge';
	import { Fact } from '$lib/components/ui/fact';
	import {
		Boxes,
		CircleAlert,
		CircleCheck,
		Euro,
		Layers,
		MapPin,
		Star,
		Tag,
		Trash2
	} from '@lucide/svelte';
	import {
		getBundle,
		getBundleTypeSpec,
		getCategories,
		getAssets,
		getLocations,
		getProducts,
		addAssetToBundle,
		removeAssetFromBundle,
		updateBundleTemplate,
		updateBundle,
		regenerateBundleImage,
		setBundleFeaturedProducts,
		convertBundleToAccessories,
		deleteBundle,
		duplicateBundle,
		getBundleCopyPlan
	} from '$lib/remote/assets.remote';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { canWrite } from '$lib/roles';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { AssetStatusBadge } from '$lib/components/ui/asset-status';
	import { NewAssetModal, type NewAssetModalHandle } from '$lib/components/ui/new-asset-modal';
	import { countProducts, roomFor, specShortfall } from '$lib/bundle-spec';

	// Mirrors MAX_BUNDLE_COPIES on the command, which refuses anything above it.
	const MAX_COPIES = 20;

	let { bundleId }: { bundleId: string } = $props();

	let bundle = $derived(await getBundle(bundleId));
	let allAssets = $derived(await getAssets());
	let categories = $derived(await getCategories());
	let locations = $derived(await getLocations(bundle.template.organizationId));

	// ── Duplicating ───────────────────────────────────────────────────────────
	// A copy is the same composition made of other units, because a fixture is in
	// one case at a time. So the one thing to settle is where those units come
	// from: off the shelf, as far as the shelf goes, or registered new. Building
	// a second case usually means assembling it from gear that is already here,
	// which is why the dialog starts on the shelf — but only when there is
	// anything on it.
	let copyOpen = $state(false);
	let copying = $state(false);
	let copyReuse = $state(true);
	let copies = $state(1);
	let copyDraft = $state({ tag: '', locationId: '' });

	function setCopies(n: number) {
		copies = Math.max(1, Math.min(MAX_COPIES, Math.floor(n) || 1));
	}

	let copyPlan = $derived(copyOpen ? await getBundleCopyPlan({ bundleId, copies }) : null);
	let canCopyFromStock = $derived((copyPlan?.fromStock ?? 0) > 0);
	let copyFromStock = $derived(canCopyFromStock && copyReuse);

	function openCopy() {
		copyDraft = { tag: '', locationId: bundle.locationId ?? '' };
		copyReuse = true;
		copies = 1;
		copyOpen = true;
	}

	async function handleCopy() {
		copying = true;
		try {
			const result = await duplicateBundle({
				bundleId,
				copies,
				// A tag names one case, so it is only asked for — and only sent —
				// when there is exactly one to name.
				tag: copies === 1 ? copyDraft.tag.trim() || undefined : undefined,
				locationId: copyDraft.locationId || undefined,
				reuseExistingAssets: copyFromStock || undefined
			});
			copyOpen = false;
			// Both numbers, because they mean different things to whoever counts the
			// shelf afterwards.
			const parts: string[] = [];
			if (result.reused > 0) parts.push(plural(result.reused, ['1 from stock', '# from stock']));
			if (result.created > 0)
				parts.push(plural(result.created, ['1 newly created', '# newly created']));
			const made = plural(result.bundleIds.length, ['Copy created', '# copies created']);
			toast.success(parts.length > 0 ? `${made} · ${parts.join(' · ')}` : made);
			// One copy is a place to go; several are a list to look at.
			await goto(
				result.bundleIds.length === 1
					? resolve(`/assets/bundles/${result.bundleIds[0]}`)
					: resolve('/assets/bundles')
			);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			copying = false;
		}
	}

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

	// ── Deleting the case ────────────────────────────────────────────────────
	// Two acts behind one button, so the choice is made in the dialog rather
	// than assumed: freeing the units back into the pool, or striking them off
	// it. Freeing is the default because it is the one that can be undone by
	// hand, and because a case is far more often wrong than its contents are.
	let deleteOpen = $state(false);
	let deleting = $state(false);
	let deleteAssets = $state<'keep' | 'delete'>('keep');

	function openDelete() {
		deleteAssets = 'keep';
		deleteOpen = true;
	}

	async function handleDelete() {
		deleting = true;
		try {
			const result = await deleteBundle({ bundleId, assets: deleteAssets });
			// An empty case has no tally worth reporting — "0 units are back in the
			// pool" is a sentence about nothing.
			toast.success(
				result.deletedAssets > 0
					? `Bundle deleted — ${plural(result.deletedAssets, ['1 unit deleted', '# units deleted'])}`
					: result.freedAssets > 0
						? `Bundle deleted — ${plural(result.freedAssets, ['1 unit is back in the pool', '# units are back in the pool'])}`
						: 'Bundle deleted'
			);
			await goto(resolve('/assets/bundles'));
		} catch (err) {
			toast.error(getErrorMessage(err));
			deleting = false;
		}
	}

	// ── Main devices ─────────────────────────────────────────────────────────
	// Which products the kit is *for*, so the preview draws those large and the
	// accompanying parts small. The mark is on the product and the bundle type,
	// not on the unit, so every case built to this spec is drawn the same way.
	let featuredProductIds = $derived(new Set(bundle.template.featuredProducts.map((p) => p.id)));
	let featuringProductId = $state('');

	async function toggleFeatured(productId: string) {
		const next = featuredProductIds.has(productId)
			? [...featuredProductIds].filter((id) => id !== productId)
			: [...featuredProductIds, productId];
		featuringProductId = productId;
		try {
			await setBundleFeaturedProducts({ templateId: bundle.templateId, productIds: next });
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			featuringProductId = '';
		}
	}

	// Same line `regenerateBundleImage` draws: anyone who may write to the org.
	// Read without awaiting, so the page doesn't wait on it — the button just
	// turns up once the answer is in.
	let myOrgs = $derived(getMyOrgs().current ?? []);
	let canRegenerateImage = $derived(
		page.data.isAdmin || myOrgs.some((o) => o.id === bundle.template.organizationId && canWrite(o))
	);

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

	// ── What this case has to hold ───────────────────────────────────────────
	// Every case of a bundle type holds the same gear, so once a second case
	// exists neither of them is a free selection any more. What a case is short
	// of is said plainly here — a fixture away for repair leaves an incomplete
	// kit, not a new kind of kit — and the picker offers only what fills a gap.
	// Putting something else in changes the type itself, which is what the
	// checkbox in the picker is for.
	let typeSpec = $derived(await getBundleTypeSpec(bundle.templateId));
	// A type's only case *is* the type: there is nothing for it to match.
	let specLines = $derived(typeSpec.instanceCount > 1 ? typeSpec.lines : []);
	let memberCounts = $derived(countProducts(bundle.assets.filter((a) => a.parentAssetId === null)));
	let shortfall = $derived(specShortfall(specLines, memberCounts));
	let missingUnits = $derived(shortfall.reduce((total, line) => total + line.missing, 0));
	let specTotal = $derived(specLines.reduce((total, line) => total + line.quantity, 0));
	let specHave = $derived(specTotal - missingUnits);

	let mainDeviceCount = $derived(bundle.assets.filter((a) => a.parentAssetId === null).length);
	let accessoryCount = $derived(bundle.assets.length - mainDeviceCount);
	// Deliberate, and the acknowledgement at the same time: ticking it is what
	// says the kit itself is changing.
	let changeType = $state(false);

	let availableToAdd = $derived.by(() => {
		const bundleAssetIds = new Set(bundle.assets.map((a) => a.id));
		const q = searchQuery.toLowerCase().trim();
		return allAssets.filter((a) => {
			if (bundleAssetIds.has(a.id)) return false;
			if (
				!changeType &&
				specLines.length > 0 &&
				roomFor(specLines, memberCounts, a.productId) === 0
			)
				return false;
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
		return (
			catalogue
				.map((p) => ({ ...p, label: `${p.manufacturer.name} ${p.name}` }))
				.filter((p) => !q || p.label.toLowerCase().includes(q))
				// Registering a unit straight into the kit answers to the type like
				// every other way in, so the catalogue is cut to the same list.
				.filter(
					(p) => changeType || specLines.length === 0 || roomFor(specLines, memberCounts, p.id) > 0
				)
		);
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
			await addAssetToBundle({ bundleId, assetId, allowTypeChange: changeType || undefined });
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
	<!-- The case at a glance: what it looks like, whether it is all there, and where. -->
	<div
		class="flex flex-col gap-6 rounded-xl bg-card p-6 shadow-xs ring-1 ring-foreground/10 lg:flex-row"
	>
		<!-- On a phone the image stacks above everything else, so the way back
		     would otherwise sit a whole picture further down. -->
		<div class="lg:hidden">
			<Button icon="back" variant="outline" href={resolve('/assets')}>Back to Devices</Button>
		</div>
		<div
			class="relative w-full shrink-0 overflow-hidden rounded-lg bg-muted/40 lg:w-96 lg:self-start"
		>
			{#if bundle.imagePath}
				<img
					src={imageSrc(bundle.imagePath)}
					alt={`Generated preview of ${bundle.template.name}`}
					class="aspect-[4/3] w-full object-contain"
				/>
			{:else}
				<div class="flex aspect-[4/3] w-full items-center justify-center text-muted-foreground">
					<Layers class="size-10" />
				</div>
			{/if}
			{#if canRegenerateImage}
				<!-- Top left: the drawing puts its own count badge in the top right. -->
				<Button
					icon="refresh"
					variant="outline"
					size="icon-sm"
					class="absolute top-2 left-2 bg-background/80 backdrop-blur-sm"
					title="Regenerate image"
					aria-label="Regenerate image"
					disabled={regeneratingImage}
					onclick={handleRegenerateImage}
				/>
			{/if}
		</div>

		<div class="flex min-w-0 flex-1 flex-col gap-4">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div class="min-w-0 space-y-2">
					<OrgBadge
						name={orgLabel(bundle.template.organization)}
						color={bundle.template.organization.color}
						avatarLabel={bundle.template.organization.avatarLabel}
						class="text-sm text-muted-foreground"
					/>
					<h1 class="text-3xl font-bold tracking-tight">{bundle.template.name}</h1>
					<div class="flex flex-wrap items-center gap-2">
						<CategoryPill
							name={categoryLabel(bundle.template.category)}
							color={bundle.template.category.color}
						/>
						{#if bundle.tag}
							<span
								class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs"
								title="Tag"
							>
								<Tag class="size-3 text-muted-foreground" />{bundle.tag}
							</span>
						{/if}
					</div>
				</div>
				<div class="flex flex-wrap gap-2">
					<Button icon="edit" variant="outline" onclick={() => (editingBundle = true)}>Edit</Button>
					<Button
						icon="print"
						variant="outline"
						href={resolve(`/assets/bundles/${bundleId}/inventory-list`)}
						target="_blank"
					>
						Print Inventory List
					</Button>
					<Button
						icon="back"
						variant="outline"
						class="hidden lg:inline-flex"
						href={resolve('/assets')}>Back to Devices</Button
					>
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
									onSelect={openCopy}
									class="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent"
								>
									Duplicate bundle
								</DropdownMenu.Item>
								<DropdownMenu.Item
									disabled={bundle.assets.length < 2}
									onSelect={openConvert}
									class="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent"
								>
									Convert to device
								</DropdownMenu.Item>
								<DropdownMenu.Separator class="my-1 h-px bg-border" />
								<DropdownMenu.Item
									onSelect={openDelete}
									class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive transition-colors outline-none hover:bg-destructive/10 data-[highlighted]:bg-destructive/10"
								>
									<Trash2 class="size-4" />
									Delete bundle
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Portal>
					</DropdownMenu.Root>
				</div>
			</div>

			{#if bundle.template.description}
				<p class="max-w-prose text-sm text-muted-foreground">{bundle.template.description}</p>
			{/if}

			{#if specLines.length > 0}
				<!-- Measured against the type: every case of it holds the same gear. -->
				<div class="space-y-2 rounded-lg border p-3">
					<div class="flex items-center justify-between gap-4 text-sm">
						{#if missingUnits === 0}
							<span class="inline-flex items-center gap-1.5 font-medium">
								<CircleCheck class="size-4 text-green-600 dark:text-green-500" />
								Complete — this case holds the kit.
							</span>
						{:else}
							<span class="inline-flex items-center gap-1.5 font-medium">
								<CircleAlert class="size-4 text-amber-600 dark:text-amber-500" />
								{plural(missingUnits, [
									'Incomplete — one unit short of the kit',
									'Incomplete — # units short of the kit'
								])}
							</span>
						{/if}
						<span class="shrink-0 text-xs text-muted-foreground tabular-nums">
							{specHave} / {specTotal}
						</span>
					</div>
					<div class="h-2 overflow-hidden rounded-full bg-muted">
						<div
							class="h-full rounded-full {missingUnits === 0
								? 'bg-green-600 dark:bg-green-500'
								: 'bg-amber-500'}"
							style="width: {specTotal > 0 ? (specHave / specTotal) * 100 : 100}%"
						></div>
					</div>
					{#if missingUnits > 0}
						<p class="text-xs text-muted-foreground">
							Missing: {shortfall
								.filter((line) => line.missing > 0)
								.map((line) => `${line.missing}× ${line.line.manufacturerName} ${line.line.name}`)
								.join(', ')}
						</p>
					{/if}
				</div>
			{/if}

			<dl class="mt-auto grid gap-4 border-t pt-4 sm:grid-cols-3">
				<Fact icon={Boxes} label="Devices">
					{mainDeviceCount}
					{#if accessoryCount > 0}
						<span class="font-normal text-muted-foreground">
							+ {plural(accessoryCount, ['1 accessory', '# accessories'])}
						</span>
					{/if}
				</Fact>
				<Fact icon={MapPin} label="Location">
					{#if bundle.location}
						{bundle.location.name}
					{:else}
						<span class="font-normal text-muted-foreground">No location</span>
					{/if}
				</Fact>
				{#if bundle.pricesVisible}
					<Fact icon={Euro} label="Net purchase price" hint="Billed as one line on offers.">
						{#if bundle.netPurchasePrice}
							{Number(bundle.netPurchasePrice).toLocaleString('de-DE', {
								style: 'currency',
								currency: 'EUR'
							})}
						{:else}
							<span class="font-normal text-muted-foreground">Not set</span>
						{/if}
					</Fact>
				{/if}
			</dl>
		</div>
	</div>

	<!-- Contained assets -->
	<!-- The card clips to its rounded corners, cutting off any picker that
	     opens past its edge. Nothing in this one is full-bleed. -->
	<Card.Root class="overflow-visible">
		<Card.Header>
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<Card.Title>Contained Assets</Card.Title>
					<Card.Description>Devices that belong to this bundle.</Card.Description>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<CategorySelect
						class="w-full sm:w-44"
						{categories}
						bind:value={categoryFilter}
						allowEmpty
						allLabel="All Categories"
					/>
					<Button icon="add" size="sm" onclick={() => (showAddModal = true)}>Add Assets</Button>
				</div>
			</div>
		</Card.Header>
		<Card.Content class="px-0">
			{#if bundle.assets.length === 0}
				<div class="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
					<Boxes class="size-8" />
					<p>No assets in this bundle yet. Click "Add Assets" to get started.</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-y bg-muted/30">
								<th class="px-6 py-3 text-left font-medium text-muted-foreground">Product</th>
								<th class="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
								<th class="px-4 py-3 text-left font-medium text-muted-foreground">Tag</th>
								<th class="px-4 py-3 text-left font-medium text-muted-foreground">Serial</th>
								<th class="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
								<th class="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
								<th
									class="px-4 py-3 text-center font-medium text-muted-foreground"
									title="Main device">Main</th
								>
								<th class="px-6 py-3"></th>
							</tr>
						</thead>
						<tbody>
							{#each visibleBundleAssets as { asset, nested } (asset.id)}
								<!-- The mark is per product, so every unit of one product shows the
								     same star and toggling any of them moves all of them. -->
								{@const featured = featuredProductIds.has(asset.productId)}
								<!-- The whole row navigates, as it does on the Devices list, but the
								     product name is a real anchor so the unit can be opened in a new
								     tab and reached by keyboard. -->
								<tr
									class="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
									onclick={() => goto(resolve(`/assets/${asset.id}`))}
								>
									<td class="px-6 py-3 {nested ? 'pl-12' : ''}">
										<div class="flex items-center gap-3">
											{#if nested}
												<span class="text-muted-foreground">↳</span>
											{/if}
											<ProductThumb
												path={asset.product.imagePath}
												alt={asset.product.name}
												size={nested ? 32 : 40}
											/>
											<div class="min-w-0">
												<a
													href={resolve(`/assets/${asset.id}`)}
													class="font-medium hover:underline"
													onclick={(e) => e.stopPropagation()}>{asset.product.name}</a
												>
												<p class="text-xs text-muted-foreground">
													{asset.product.manufacturer.name}
												</p>
											</div>
										</div>
									</td>
									<td class="px-4 py-3">
										<CategoryPill
											name={categoryLabel(asset.product.category)}
											color={asset.product.category.color}
										/>
									</td>
									<td class="px-4 py-3 font-mono text-xs">{asset.assetTag ?? '—'}</td>
									<td class="px-4 py-3 font-mono text-xs">{asset.serialNumber ?? '—'}</td>
									<td class="px-4 py-3">
										<AssetStatusBadge status={asset.status} class="px-2.5" />
									</td>
									<td class="px-4 py-3 text-sm text-muted-foreground">
										{asset.location?.name ?? '—'}
									</td>
									<td class="px-4 py-3 text-center">
										<button
											type="button"
											class="rounded-md p-1.5 transition-colors hover:bg-muted disabled:opacity-50 {featured
												? 'text-amber-500'
												: 'text-muted-foreground/40'}"
											disabled={featuringProductId !== ''}
											aria-pressed={featured}
											title={featured ? 'Main device of this kit' : 'Mark as a main device'}
											onclick={(e) => {
												e.stopPropagation();
												toggleFeatured(asset.productId);
											}}
										>
											<Star class="size-4" fill={featured ? 'currentColor' : 'none'} />
										</button>
									</td>
									<td class="px-6 py-3 text-right">
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

<Modal
	bind:open={copyOpen}
	title="Duplicate this bundle"
	size="lg"
	dismissible={!copying}
	onclose={() => (copyOpen = false)}
>
	{#snippet description()}
		Further instances of {bundle.template.name}, each with its own units.
	{/snippet}

	{#snippet children()}
		{#if copyPlan}
			<div class="space-y-5">
				{#if copyPlan.needed === 0}
					<p class="text-sm text-muted-foreground">
						This bundle is empty, so the copy will be too.
					</p>
				{:else}
					<div class="space-y-2">
						<p class="text-sm font-medium">
							{#if copies === 1}
								The copy needs {copyPlan.needed} units
							{:else}
								{copies} copies need {copyPlan.needed} units between them
							{/if}
						</p>
						<ul class="space-y-1 text-sm text-muted-foreground">
							{#each copyPlan.lines as line (line.productId)}
								<li>
									{line.needed}× {line.manufacturerName}
									{line.name}
									{#if line.fromStock > 0}
										<span class="text-xs">— {line.fromStock} free in the pool</span>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
					<div class="space-y-3">
						<label
							class="flex gap-3 rounded-md border p-3 text-sm {canCopyFromStock
								? 'cursor-pointer'
								: 'opacity-60'}"
						>
							<input
								type="radio"
								name="bundle-copy-source"
								class="mt-1"
								checked={copyFromStock}
								disabled={!canCopyFromStock || copying}
								onchange={() => (copyReuse = true)}
							/>
							<span>
								<span class="block font-medium">Take them out of stock</span>
								<span class="mt-1 block text-xs text-muted-foreground">
									{#if !canCopyFromStock}
										Nothing free to take right now — what the pool holds is already in a kit,
										attached, or booked.
									{:else if copyPlan.fromStock >= copyPlan.needed}
										Everything comes off the shelf. Nothing new is registered.
									{:else}
										{copyPlan.fromStock} come off the shelf; the remaining {copyPlan.needed -
											copyPlan.fromStock} are registered as new units.
									{/if}
								</span>
							</span>
						</label>
						<label class="flex cursor-pointer gap-3 rounded-md border p-3 text-sm">
							<input
								type="radio"
								name="bundle-copy-source"
								class="mt-1"
								checked={!copyFromStock}
								disabled={copying}
								onchange={() => (copyReuse = false)}
							/>
							<span>
								<span class="block font-medium">Register new units</span>
								<span class="mt-1 block text-xs text-muted-foreground">
									{copyPlan.needed} new units are registered. Whatever is on the shelf stays there.
								</span>
							</span>
						</label>
					</div>
				{/if}

				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="copy-count">How many copies</Label>
						<Input
							id="copy-count"
							type="number"
							min="1"
							max={MAX_COPIES}
							value={copies}
							disabled={copying}
							oninput={(e) => setCopies(e.currentTarget.valueAsNumber)}
						/>
						<p class="text-xs text-muted-foreground">
							Up to {MAX_COPIES} at a time, all drawing on the same shelf.
						</p>
					</div>
					{#if copies === 1}
						<div class="space-y-2">
							<Label for="copy-tag">Tag for the copy</Label>
							<Input id="copy-tag" bind:value={copyDraft.tag} disabled={copying} />
							<p class="text-xs text-muted-foreground">
								Optional, and how two kits of one type are told apart.
							</p>
						</div>
					{:else}
						<div class="space-y-2">
							<Label for="copy-tags-note">Tags</Label>
							<p id="copy-tags-note" class="pt-2 text-xs text-muted-foreground">
								A tag names one case, so the copies are made without one. Give each its own on its
								own page afterwards.
							</p>
						</div>
					{/if}
					<div class="space-y-2">
						<Label for="copy-location">Location</Label>
						<select
							id="copy-location"
							bind:value={copyDraft.locationId}
							disabled={copying}
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
						<p class="text-xs text-muted-foreground">
							Every unit in the copy is moved here. Leave it empty to keep each where it is.
						</p>
					</div>
				</div>
			</div>
		{/if}
	{/snippet}

	{#snippet footer()}
		<Button
			icon="close"
			type="button"
			variant="outline"
			onclick={() => (copyOpen = false)}
			disabled={copying}
		>
			Cancel
		</Button>
		<Button type="button" disabled={copying || copyPlan === null} onclick={handleCopy}>
			{copying ? 'Duplicating…' : plural(copies, ['Create the copy', 'Create # copies'])}
		</Button>
	{/snippet}
</Modal>

<Modal bind:open={convertOpen} title="Convert Bundle to Device" dismissible={!converting}>
	{#snippet description()}
		Choose the main device. Every other device in this bundle will become its accessory. The bundle
		instance will be removed; its bundle price and tag will no longer apply. Existing bookings stay
		intact as individual device bookings.
	{/snippet}
	{#snippet children()}
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
	{/snippet}
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
	{#snippet children()}
		<input
			type="search"
			bind:value={searchQuery}
			placeholder="Search assets…"
			class="mb-3 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
		/>

		{#if specLines.length > 0}
			<div class="mb-3 rounded-md border bg-muted/30 p-3 text-sm">
				<p>
					{#if missingUnits === 0}
						This case holds the kit, so only a change to the bundle type itself adds anything
						further.
					{:else}
						Offered here is what this case is short of:
						{shortfall
							.filter((line) => line.missing > 0)
							.map((line) => `${line.missing}× ${line.line.manufacturerName} ${line.line.name}`)
							.join(', ')}.
					{/if}
				</p>
				<label class="mt-2 flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
					<input type="checkbox" bind:checked={changeType} class="mt-0.5" />
					<span>
						Show everything in the pool. A unit this kit has no room for changes what the bundle
						type holds, and {plural(typeSpec.instanceCount - 1, [
							'the other case of it counts as incomplete from then on',
							'the other # cases of it count as incomplete from then on'
						])}.
					</span>
				</label>
			</div>
		{/if}

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
	{/snippet}
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
	{#snippet children()}
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
	{/snippet}
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

<Modal bind:open={deleteOpen} title="Delete this bundle?" dismissible={!deleting}>
	{#snippet description()}
		{bundle.template.name}{bundle.tag ? ` · ${bundle.tag}` : ''}
	{/snippet}
	{#snippet children()}
		<div class="space-y-4 text-sm">
			<!-- An empty case has nothing to decide about: keeping and deleting its
			     contents are the same act on nothing, and offering the choice would
			     only ask someone to think about it. -->
			{#if bundle.assets.length === 0}
				<p class="text-muted-foreground">
					This cannot be undone. The case is empty, so nothing but the case itself is removed.
				</p>
			{:else}
				<!-- No `plural` on "units" here: the count would have to carry a German
				     article with it, and the sentence reads the same either way. -->
				<p class="text-muted-foreground">
					This cannot be undone. The case stops existing; what happens to the units inside is up to
					you.
				</p>

				<div class="space-y-2">
					<label class="flex cursor-pointer gap-3 rounded-md border p-3 has-checked:border-primary">
						<input type="radio" class="mt-0.5" value="keep" bind:group={deleteAssets} />
						<span>
							<span class="font-medium">Keep the units</span>
							<span class="mt-1 block text-xs text-muted-foreground">
								They stay in the pool and go back to being loose equipment, with their tags, history
								and inspections untouched.
							</span>
						</span>
					</label>
					<label class="flex cursor-pointer gap-3 rounded-md border p-3 has-checked:border-primary">
						<input type="radio" class="mt-0.5" value="delete" bind:group={deleteAssets} />
						<span>
							<span class="font-medium">Delete the units as well</span>
							<span class="mt-1 block text-xs text-muted-foreground">
								For a case that was registered by mistake. Refused if any unit inside has been
								booked, scanned, inspected or billed — one that has been in use is decommissioned
								instead, so its history survives.
							</span>
						</span>
					</label>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<Button
			icon="close"
			type="button"
			variant="outline"
			onclick={() => (deleteOpen = false)}
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
			{deleting ? 'Deleting…' : 'Delete bundle'}
		</Button>
	{/snippet}
</Modal>
