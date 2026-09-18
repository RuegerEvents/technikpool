<script lang="ts">
	import { categoryLabel } from '$lib/category';
	import { getErrorMessage, orgLabel, plural } from '$lib/utils';
	import {
		getBundles,
		getCategories,
		deleteProduct,
		getManufacturers,
		getProductCatalog,
		getProducts,
		mergeProducts,
		setOrgProductPrice,
		updateBundle,
		updateProduct
	} from '$lib/remote/assets.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { CategoryPill } from '$lib/components/ui/category-pill';
	import { CreatableSelect } from '$lib/components/ui/creatable-select';
	import { Modal } from '$lib/components/ui/modal';
	import { ProductThumb } from '$lib/components/ui/product-thumb';
	import {
		ProductFields,
		cableDraftFrom,
		cableInputFrom,
		type ProductDraft
	} from '$lib/components/ui/product-fields';
	import { resolve } from '$app/paths';
	import { browser } from '$app/environment';
	import { toast } from 'svelte-sonner';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';

	let { data } = $props();

	// ⌘ on a Mac, Ctrl everywhere else. Also keeps the symbol out of the
	// translation catalogue, where it has no business being.
	let modLabel = $derived(browser && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl');

	let filterOrgId = $state('');
	let searchQuery = $state('');
	// What still needs doing. 'price' is one org's price, never "any org's": a
	// price is that org's own fact, and a filter across several would keep a
	// product in the list that you have already priced for the org in front.
	let missing = $state<'none' | 'image' | 'price'>('none');
	// Accessory-only products are billed with the unit they hang off, so they
	// usually need no price of their own. Off unless asked.
	let includeAccessories = $state(false);

	// Read through the queries rather than awaited, so the page is on screen
	// while the catalogue is on its way. See CLAUDE.md, "Loading states".
	let orgs = $derived(getMyOrgs().current ?? []);
	let categories = $derived(getCategories().current ?? []);
	let manufacturers = $derived(getManufacturers().current ?? []);
	let productsQuery = $derived(getProductCatalog(filterOrgId || undefined));
	let products = $derived(productsQuery.current ?? []);

	type CatalogProduct = Awaited<ReturnType<typeof getProductCatalog>>[number];

	// Products are global, but editing one is an org-admin right. A member who
	// hasn't got it anywhere would only find that out when a save failed.
	let canEdit = $derived(
		data.isAdmin || orgs.some((o) => o.role === 'ADMIN' || o.role === 'OWNER')
	);

	// The orgs whose prices this user may set — prices are per-org, so the
	// wizard shows one price field per org here rather than one global one.
	let managedOrgs = $derived(
		orgs.filter((o) => data.isAdmin || o.role === 'ADMIN' || o.role === 'OWNER')
	);
	let managedOrgIdSet = $derived(new Set(managedOrgs.map((o) => o.id)));

	// With an org filter active the catalog only carries that org's price rows,
	// so only that org's field can be shown — a field initialised from the rows
	// that aren't there would read as "no price" and delete a stored one on save.
	let priceOrgs = $derived(
		filterOrgId ? managedOrgs.filter((o) => o.id === filterOrgId) : managedOrgs
	);

	// The "missing price" filter asks about exactly one org, and only one this
	// user may price for — so choosing it narrows the page to that org.
	let filterOrgManaged = $derived(managedOrgIdSet.has(filterOrgId));

	function showMissingPrice() {
		if (!filterOrgManaged) filterOrgId = managedOrgs[0]?.id ?? '';
		missing = 'price';
	}

	// Leaving the org the price filter was about ends the filter as well; it has
	// no answer for "all organizations" or for one whose prices aren't yours.
	function onOrgChange() {
		if (missing === 'price' && !filterOrgManaged) missing = 'none';
	}

	// Bundles only ever join the "missing price" list: their price is the one
	// field on them this page has anything to say about. Like a product's, it is
	// the org's own, so they are only read for an org this user prices for.
	let bundlesQuery = $derived(filterOrgManaged ? getBundles(filterOrgId) : null);
	let bundles = $derived(bundlesQuery?.current ?? []);

	type CatalogBundle = Awaited<ReturnType<typeof getBundles>>[number];

	// One list, two kinds of row. Ids are prefixed per table, so both kinds can
	// share `currentId` without colliding.
	type Entry =
		| { kind: 'product'; id: string; item: CatalogProduct }
		| { kind: 'bundle'; id: string; item: CatalogBundle };

	function bundleLabel(bundle: CatalogBundle) {
		return bundle.tag ? `${bundle.template.name} ${bundle.tag}` : bundle.template.name;
	}

	function storedBundlePrice(bundle: CatalogBundle): number | null {
		return bundle.netPurchasePrice == null ? null : Number(bundle.netPurchasePrice);
	}

	// What a bundle holds, one line per product — what its price is judged against.
	function bundleContents(bundle: CatalogBundle) {
		const lines: Record<string, { productId: string; label: string; count: number }> = {};
		for (const asset of bundle.assets) {
			lines[asset.productId] ??= {
				productId: asset.productId,
				label: `${asset.product.manufacturer.name} ${asset.product.name}`,
				count: 0
			};
			lines[asset.productId].count++;
		}
		return Object.values(lines);
	}

	function isAccessoryOnly(product: CatalogProduct) {
		return product.assetCount > 0 && product.accessoryCount === product.assetCount;
	}

	// Only products the org actually holds: a price is what a rental of its own
	// units is billed from, and one it owns none of has nothing to bill.
	function needsPrice(product: CatalogProduct) {
		if (product.assetCount === 0) return false;
		if (!includeAccessories && isAccessoryOnly(product)) return false;
		return storedPrice(product, filterOrgId) == null;
	}

	// Renaming or recategorizing follows the ownership rule the server
	// enforces: every org holding units must be one this user admins. Locked
	// fields are greyed out rather than failing on save.
	function isIdentityLocked(product: CatalogProduct) {
		if (data.isAdmin) return false;
		return product.owningOrgIds.some((id) => !managedOrgIdSet.has(id));
	}

	// The position is held as an id, not an index: a product that stops matching
	// the filter changes every index after it, and an index would then point at
	// whatever slid into its place.
	let currentId = $state('');

	let searchTrimmed = $derived(searchQuery.toLowerCase().trim());

	function matches(product: CatalogProduct) {
		if (missing === 'image' && product.imagePath) return false;
		if (missing === 'price' && !needsPrice(product)) return false;
		if (!searchTrimmed) return true;
		return (
			product.name.toLowerCase().includes(searchTrimmed) ||
			product.manufacturer.name.toLowerCase().includes(searchTrimmed) ||
			categoryLabel(product.category).toLowerCase().includes(searchTrimmed) ||
			// "everything with a TRUE1 end" is a question the name can't answer.
			[product.cableType, product.connectorA, product.connectorB].some((v) =>
				v?.toLowerCase().includes(searchTrimmed)
			)
		);
	}

	function matchesBundle(bundle: CatalogBundle) {
		if (missing !== 'price' || storedBundlePrice(bundle) != null) return false;
		if (!searchTrimmed) return true;
		return [bundle.template.name, bundle.tag, categoryLabel(bundle.template.category)].some((v) =>
			v?.toLowerCase().includes(searchTrimmed)
		);
	}

	let entries = $derived<Entry[]>([
		...products.map((p) => ({ kind: 'product' as const, id: p.id, item: p })),
		...bundles.map((b) => ({ kind: 'bundle' as const, id: b.id, item: b }))
	]);

	// Whatever is in front stays in the list even once it stops matching: giving
	// a product the image it was missing is exactly what drops it out of the
	// "missing image" filter, and the list must not shift out from under the
	// person who just did that. It leaves as soon as they move on.
	let visible = $derived(
		entries.filter(
			(e) => e.id === currentId || (e.kind === 'product' ? matches(e.item) : matchesBundle(e.item))
		)
	);

	let missingImageCount = $derived(products.filter((p) => !p.imagePath).length);
	// Only meaningful once the catalog is scoped to that org — across all of
	// them, unit counts and price rows belong to several orgs at once.
	let missingPriceCount = $derived(
		filterOrgManaged
			? products.filter(needsPrice).length +
					bundles.filter((b) => storedBundlePrice(b) == null).length
			: null
	);

	let index = $derived(
		Math.max(
			0,
			visible.findIndex((p) => p.id === currentId)
		)
	);
	let entry = $derived(visible.at(index));
	let current = $derived(entry?.kind === 'product' ? entry.item : undefined);
	let currentBundle = $derived(entry?.kind === 'bundle' ? entry.item : undefined);

	let draft = $state<ProductDraft>({
		name: '',
		categoryId: '',
		imagePath: '',
		netPurchasePrice: undefined,
		cable: null,
		isLicense: false
	});
	let manufacturer = $state<{ id: string | null; name: string } | null>(null);
	// One price per org the user manages — prices are per-org, and undefined
	// means "no price set for this org".
	let priceDrafts = $state<Record<string, number | undefined>>({});
	let draftFor = $state('');
	let saving = $state(false);

	function storedPrice(product: CatalogProduct, orgId: string): number | undefined {
		const row = product.prices.find((p) => p.organizationId === orgId);
		return row == null ? undefined : Number(row.netPurchasePrice);
	}

	// The draft follows whatever product is in front — an effect rather than a
	// derived, because from there on it is the user's own state to edit.
	$effect(() => {
		const product = current;
		if (!product || product.id === draftFor) return;
		draftFor = product.id;
		manufacturer = { id: product.manufacturerId, name: product.manufacturer.name };
		draft = {
			name: product.name,
			categoryId: product.categoryId,
			imagePath: product.imagePath ?? '',
			netPurchasePrice: undefined,
			cable: cableDraftFrom(product),
			isLicense: product.isLicense
		};
	});

	// Price drafts additionally follow the org filter: switching it swaps which
	// price rows the catalog even carries, so stale drafts for the previous
	// selection must not survive into a save.
	let pricesFor = $state('');
	$effect(() => {
		const product = current;
		const key = `${product?.id ?? ''}:${filterOrgId}`;
		if (!product || key === pricesFor) return;
		pricesFor = key;
		priceDrafts = Object.fromEntries(
			priceOrgs.map((org) => [org.id, storedPrice(product, org.id)])
		);
	});

	let bundlePriceDraft = $state<number | null | undefined>(null);
	let bundleDraftFor = $state('');
	$effect(() => {
		const bundle = currentBundle;
		if (!bundle || bundle.id === bundleDraftFor) return;
		bundleDraftFor = bundle.id;
		bundlePriceDraft = storedBundlePrice(bundle);
	});
	let bundleDirty = $derived(
		!!currentBundle &&
			bundleDraftFor === currentBundle.id &&
			(bundlePriceDraft ?? null) !== storedBundlePrice(currentBundle)
	);

	let identityLocked = $derived(!!current && isIdentityLocked(current));

	// What a cable is counts as identity here for the same reason the server
	// treats it as such: it decides which product a unit belongs to.
	let cableDraftInput = $derived(cableInputFrom(draft.cable));
	let cableDirty = $derived(
		!!current &&
			draftFor === current.id &&
			((cableDraftInput?.cableType ?? null) !== current.cableType ||
				(cableDraftInput?.connectorA ?? null) !== current.connectorA ||
				(cableDraftInput?.connectorB ?? null) !== current.connectorB ||
				(cableDraftInput?.lengthCm ?? null) !== current.lengthCm)
	);

	let identityDirty = $derived(
		!!current &&
			draftFor === current.id &&
			(draft.name.trim() !== current.name ||
				manufacturer?.id !== current.manufacturerId ||
				draft.categoryId !== current.categoryId ||
				draft.isLicense !== current.isLicense ||
				cableDirty)
	);
	let imageDirty = $derived(
		!!current && draftFor === current.id && draft.imagePath.trim() !== (current.imagePath ?? '')
	);
	let dirtyPriceOrgIds = $derived(
		current && draftFor === current.id
			? priceOrgs
					.map((org) => org.id)
					.filter(
						(orgId) => (priceDrafts[orgId] ?? null) !== (storedPrice(current!, orgId) ?? null)
					)
			: []
	);
	let dirty = $derived(identityDirty || imageDirty || dirtyPriceOrgIds.length > 0 || bundleDirty);

	async function saveBundle(bundle: CatalogBundle): Promise<boolean> {
		saving = true;
		try {
			// Refreshes getBundles itself.
			await updateBundle({ bundleId: bundle.id, netPurchasePrice: bundlePriceDraft ?? null });
			return true;
		} catch (err) {
			toast.error(getErrorMessage(err));
			return false;
		} finally {
			saving = false;
		}
	}

	/** Returns whether the save went through, so a caller can hold position on failure. */
	async function save(): Promise<boolean> {
		if (!dirty || saving) return true;
		if (currentBundle) return saveBundle(currentBundle);
		if (!current) return true;
		if (!draft.name.trim()) {
			toast.error('Product name is required');
			return false;
		}
		if (!manufacturer?.id) {
			toast.error('Manufacturer is required');
			return false;
		}
		saving = true;
		try {
			if (identityDirty || imageDirty) {
				await updateProduct({
					productId: current.id,
					// Locked identity fields are greyed out in the form; not sending
					// them keeps an image-only save from tripping the server's
					// ownership check on an unchanged name.
					...(identityLocked
						? {}
						: {
								name: draft.name,
								manufacturerId: manufacturer.id,
								categoryId: draft.categoryId,
								cable: cableDraftInput,
								isLicense: draft.isLicense
							}),
					imagePath: draft.imagePath
				});
			}
			for (const orgId of dirtyPriceOrgIds) {
				await setOrgProductPrice({
					organizationId: orgId,
					productId: current.id,
					netPurchasePrice: priceDrafts[orgId] ?? null
				});
			}
			await getProductCatalog(filterOrgId || undefined).refresh();
			return true;
		} catch (err) {
			toast.error(getErrorMessage(err));
			return false;
		} finally {
			saving = false;
		}
	}

	async function saveAndStay() {
		const wasBundle = !!currentBundle;
		if (await save()) toast.success(wasBundle ? 'Bundle updated' : 'Product updated');
	}

	async function go(delta: number) {
		// Read the target before saving: the save can re-filter the list underneath.
		const target = visible[index + delta];
		if (dirty && !(await save())) return;
		if (target) currentId = target.id;
		else if (delta > 0) toast.success('That was the last product');
	}

	// Switching by click saves too — the whole point of the wizard is not having
	// to remember to.
	async function select(row: Entry) {
		if (row.id === currentId) return;
		if (dirty && !(await save())) return;
		currentId = row.id;
	}

	// ── Merging a duplicate away ──────────────────────────────────────────────
	// Two rows for one device is the failure mode this catalogue has: nothing
	// stops a second "Robin 600" from being typed in next to "Robe Robin 600",
	// and once both hold units, every count is half right. The wizard is where
	// they are noticed — stepping through the catalogue is exactly the activity
	// that puts two spellings of one lamp under your nose.

	// The picker lists *every* product, not the org catalogue behind this page:
	// a duplicate that ended up with no units at all is invisible here and is
	// the easiest kind to clean up.
	let allProducts = $derived(getProducts().current ?? []);
	type GlobalProduct = Awaited<ReturnType<typeof getProducts>>[number];

	let mergeOpen = $state(false);
	let mergePick = $state<{ id: string | null; name: string } | null>(null);
	// Which of the two names survives. Defaults to the card in front, because
	// that is the one whose fields are being curated — but only defaults: the
	// moment a duplicate turns up you know which spelling is right, and being
	// sent to the other card first to act on it is how the wrong one wins.
	let keepCurrent = $state(true);
	let merging = $state(false);

	let mergeOptions = $derived(
		current
			? allProducts
					.filter((p) => p.id !== current.id)
					.map((p) => ({ id: p.id, name: `${p.manufacturer.name} ${p.name}` }))
			: []
	);

	let picked = $derived<GlobalProduct | null>(
		allProducts.find((p) => p.id === mergePick?.id) ?? null
	);
	let survivor = $derived(keepCurrent ? current : picked);
	let absorbed = $derived(keepCurrent ? picked : current);

	// Only the units this page can see. A product with units in an organization
	// the user isn't in is not counted here and not mergeable either — the
	// command refuses it by name rather than moving somebody else's inventory.
	let unitCount = $derived(new Map(products.map((p) => [p.id, p.assetCount])));
	let movingCount = $derived(absorbed ? (unitCount.get(absorbed.id) ?? 0) : 0);

	// Name, manufacturer and category are the survivor's; an image is not
	// identity but work someone did, so the merge keeps it when the survivor
	// has none. Said out loud here because it is the one part of the operation
	// that isn't obvious from picking a side. (Per-org prices move over the
	// same way — each org keeps its own — noted statically below.)
	let inheritsImage = $derived(
		!!survivor && !!absorbed && !survivor.imagePath && !!absorbed.imagePath
	);

	function openMerge() {
		mergePick = null;
		keepCurrent = true;
		mergeOpen = true;
	}

	async function doMerge() {
		if (!survivor || !absorbed || merging) return;
		if (dirty && !(await save())) return;
		merging = true;
		try {
			const { movedAssets } = await mergeProducts({
				targetProductId: survivor.id,
				sourceProductId: absorbed.id
			});
			// The absorbed product may have been the card in front, and the survivor
			// may have just inherited an image or a price — so both the position and
			// the draft have to be pointed at what actually exists now.
			currentId = survivor.id;
			draftFor = '';
			pricesFor = '';
			mergeOpen = false;
			toast.success(plural(movedAssets, ['Merged — # unit moved', 'Merged — # units moved']));
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			merging = false;
		}
	}

	let deleteOpen = $state(false);
	let deleting = $state(false);

	async function doDelete() {
		if (!current || current.hasAssets || deleting) return;
		const deletedId = current.id;
		const nextId = visible[index + 1]?.id ?? visible[index - 1]?.id ?? '';
		deleting = true;
		try {
			await deleteProduct(deletedId);
			currentId = nextId;
			draftFor = '';
			pricesFor = '';
			deleteOpen = false;
			toast.success('Product deleted');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			deleting = false;
		}
	}

	function scrollIntoViewWhenActive(node: HTMLElement, active: boolean) {
		if (active) node.scrollIntoView({ block: 'nearest' });
		return {
			update(nowActive: boolean) {
				if (nowActive) node.scrollIntoView({ block: 'nearest' });
			}
		};
	}

	// Plain arrows only when the caret isn't in a field and no dropdown owns
	// them; everything else needs a modifier, so it works while typing.
	const FIELD_SELECTOR =
		'input, textarea, select, [contenteditable="true"], [aria-expanded="true"]';

	// Keys are compared lowercased throughout: an uppercase string literal inside
	// a function is exactly what wuchale extracts, and a translated 'ArrowRight'
	// would leave the shortcut answering to a key nobody can press.
	function handleKeydown(e: KeyboardEvent) {
		// The merge dialog focuses its own panel, which is not a field — so
		// without this, an arrow key aimed at nothing steps the wizard behind it
		// and the dialog ends up describing a product that is no longer in front.
		if (!entry || mergeOpen) return;
		const mod = e.metaKey || e.ctrlKey;
		const key = e.key.toLowerCase();
		const step = key === 'arrowright' ? 1 : key === 'arrowleft' ? -1 : 0;

		if (mod && key === 'enter') {
			e.preventDefault();
			go(1);
			return;
		}
		if (mod && key === 's') {
			e.preventDefault();
			saveAndStay();
			return;
		}
		if (step === 0) return;
		if (!mod && (e.target as HTMLElement | null)?.closest(FIELD_SELECTOR)) return;
		e.preventDefault();
		go(step);
	}
</script>

<svelte:head><title>Products | Technikpool</title></svelte:head>
<svelte:window onkeydown={handleKeydown} />

<div class="space-y-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Products</h1>
			<p class="text-muted-foreground">
				Step through the catalog and fill in what's missing — one product at a time.
			</p>
		</div>
		<select
			bind:value={filterOrgId}
			onchange={onOrgChange}
			class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
		>
			<option value="">All Organizations</option>
			{#each orgs as org (org.id)}<option value={org.id}>{orgLabel(org)}</option>{/each}
		</select>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<input
			type="search"
			bind:value={searchQuery}
			placeholder="Search by product, manufacturer, category…"
			class="h-10 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
		/>
		<div class="flex items-center gap-1">
			<button
				type="button"
				onclick={() => (missing = 'none')}
				class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {missing === 'none'
					? 'bg-primary text-primary-foreground'
					: 'bg-muted text-muted-foreground hover:bg-muted/70'}">All products</button
			>
			<button
				type="button"
				onclick={() => (missing = 'image')}
				class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {missing === 'image'
					? 'bg-primary text-primary-foreground'
					: 'bg-muted text-muted-foreground hover:bg-muted/70'}"
				>Missing image ({missingImageCount})</button
			>
			{#if managedOrgs.length > 0}
				<button
					type="button"
					onclick={showMissingPrice}
					class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {missing === 'price'
						? 'bg-primary text-primary-foreground'
						: 'bg-muted text-muted-foreground hover:bg-muted/70'}"
				>
					{#if missingPriceCount == null}Missing price{:else}Missing price ({missingPriceCount}){/if}
				</button>
			{/if}
		</div>
		{#if missing === 'price'}
			<label class="flex items-center gap-2 text-sm text-muted-foreground">
				<input type="checkbox" bind:checked={includeAccessories} class="h-4 w-4" />
				Include accessories
			</label>
		{/if}
	</div>

	{#if !canEdit}
		<div class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
			You can look through the catalog, but editing a product needs admin or owner rights in one of
			your organizations.
		</div>
	{/if}

	{#if !productsQuery.ready || (missing === 'price' && bundlesQuery && !bundlesQuery.ready)}
		<ContentSkeleton shape="table" count={8} error={productsQuery.error ?? bundlesQuery?.error} />
	{:else if visible.length === 0}
		<div class="rounded-md border">
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<p class="text-lg font-medium">
					{products.length === 0 ? 'No products yet' : 'Nothing left to edit'}
				</p>
				<p class="text-sm text-muted-foreground">
					{products.length === 0
						? 'Products appear here once your organizations own assets.'
						: 'Every product in this filter is done.'}
				</p>
			</div>
		</div>
	{:else if entry}
		<div class="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] [&>*]:min-w-0">
			<Card.Root class="overflow-hidden">
				<Card.Header class="pb-3">
					<Card.Title class="text-base">Catalog</Card.Title>
					<Card.Description>{index + 1} of {visible.length}</Card.Description>
				</Card.Header>
				<Card.Content class="max-h-[32rem] overflow-y-auto p-0">
					{#each visible as row (row.id)}
						{@const active = row.id === entry.id}
						<button
							type="button"
							use:scrollIntoViewWhenActive={active}
							onclick={() => select(row)}
							class="flex w-full items-center gap-3 border-b px-4 py-2.5 text-left transition-colors last:border-0 {active
								? 'bg-muted'
								: 'hover:bg-muted/40'}"
						>
							{#if row.kind === 'product'}
								{@const product = row.item}
								<ProductThumb path={product.imagePath} alt={product.name} size={32} />
								<span class="min-w-0 flex-1">
									<span class="block truncate text-sm font-medium">{product.name}</span>
									<span class="block truncate text-xs text-muted-foreground"
										>{product.manufacturer.name}</span
									>
								</span>
								{#if !product.imagePath}
									<span
										class="shrink-0 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
										>No image</span
									>
								{/if}
							{:else}
								<ProductThumb path={row.item.imagePath} alt={bundleLabel(row.item)} size={32} />
								<span class="min-w-0 flex-1">
									<span class="block truncate text-sm font-medium">{bundleLabel(row.item)}</span>
									<!-- Untagged cases of one type share a name; where they are is
									     what tells them apart in this list. -->
									<span class="block truncate text-xs text-muted-foreground"
										>Bundle{#if row.item.location}
											· {row.item.location.name}{/if}</span
									>
								</span>
							{/if}
						</button>
					{/each}
				</Card.Content>
			</Card.Root>

			<!-- The card clips to its rounded corners, cutting off any picker that
			     opens past its edge. Nothing in this one is full-bleed. -->
			<Card.Root class="overflow-visible">
				{#if current}
					<Card.Header>
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0">
								<Card.Title class="flex items-center gap-2">
									{current.manufacturer.name}
									{current.name}
									{#if dirty}
										<span
											class="h-2 w-2 shrink-0 rounded-full bg-yellow-500"
											title="Unsaved changes"
										></span>
									{/if}
								</Card.Title>
								<Card.Description class="flex flex-wrap items-center gap-2 pt-1">
									<CategoryPill
										name={categoryLabel(current.category)}
										color={current.category.color}
									/>
									<span>{current.assetCount} units</span>
									<a
										href="{resolve('/assets')}?q={encodeURIComponent(current.name)}"
										class="underline-offset-2 hover:text-foreground hover:underline"
										>View in Devices →</a
									>
								</Card.Description>
							</div>
							<div class="flex flex-wrap items-center gap-3">
								{#if canEdit}
									{#if !current.hasAssets}
										<Button variant="destructive" size="sm" onclick={() => (deleteOpen = true)}
											>Delete unused</Button
										>
									{/if}
									<Button icon="merge" variant="outline" size="sm" onclick={openMerge}
										>Merge duplicate…</Button
									>
								{/if}
								<span class="font-mono text-sm text-muted-foreground tabular-nums"
									>{index + 1} / {visible.length}</span
								>
							</div>
						</div>
					</Card.Header>
					<Card.Content>
						{#if identityLocked}
							<div class="mb-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
								Units of this product belong to organizations you don't administer, so its name,
								manufacturer and category are locked here. Your image contribution and your own
								organization's price still save.
							</div>
						{/if}
						<div class="mb-4 space-y-2">
							<p class="text-sm font-medium">Manufacturer</p>
							<CreatableSelect
								items={manufacturers}
								bind:value={manufacturer}
								allowCreate={false}
								disabled={!canEdit || identityLocked}
								placeholder="Search manufacturers…"
							/>
						</div>
						<ProductFields
							{categories}
							bind:value={draft}
							idPrefix="wizard"
							showPrice={false}
							identityDisabled={!canEdit || identityLocked}
						/>
						{#if priceOrgs.length > 0}
							<div class="mt-4 space-y-2">
								<p class="text-sm font-medium">Net purchase price (€)</p>
								<p class="text-sm text-muted-foreground">
									Per organization — what that organization's rental rate is calculated from. Other
									organizations set their own price.
								</p>
								{#each priceOrgs as org (org.id)}
									<div class="flex items-center gap-3">
										<span class="w-40 truncate text-sm">{orgLabel(org)}</span>
										<input
											type="number"
											min="0"
											step="0.01"
											placeholder="Unknown"
											bind:value={priceDrafts[org.id]}
											class="h-10 w-40 rounded-md border border-input bg-background px-3 py-2 text-right text-sm focus:ring-2 focus:ring-ring focus:outline-none"
										/>
									</div>
								{/each}
							</div>
						{/if}
					</Card.Content>
				{:else if currentBundle}
					<Card.Header>
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0">
								<Card.Title class="flex items-center gap-2">
									{bundleLabel(currentBundle)}
									{#if dirty}
										<span
											class="h-2 w-2 shrink-0 rounded-full bg-yellow-500"
											title="Unsaved changes"
										></span>
									{/if}
								</Card.Title>
								<Card.Description class="flex flex-wrap items-center gap-2 pt-1">
									<span class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">Bundle</span>
									<CategoryPill
										name={categoryLabel(currentBundle.template.category)}
										color={currentBundle.template.category.color}
									/>
									<span>{currentBundle.assets.length} units</span>
									<a
										href={resolve(`/assets/bundles/${currentBundle.id}`)}
										class="underline-offset-2 hover:text-foreground hover:underline"
										>Open bundle →</a
									>
								</Card.Description>
							</div>
							<span class="font-mono text-sm text-muted-foreground tabular-nums"
								>{index + 1} / {visible.length}</span
							>
						</div>
					</Card.Header>
					<Card.Content class="space-y-4">
						<div class="space-y-2">
							<p class="text-sm font-medium">Net purchase price (€)</p>
							<p class="text-sm text-muted-foreground">
								If set, offers and invoices bill this bundle as one line at this price. Left empty,
								its contents are billed one by one.
							</p>
							<input
								type="number"
								min="0"
								step="0.01"
								placeholder="Unknown"
								bind:value={bundlePriceDraft}
								class="h-10 w-40 rounded-md border border-input bg-background px-3 py-2 text-right text-sm focus:ring-2 focus:ring-ring focus:outline-none"
							/>
						</div>
						<div class="space-y-2">
							<p class="text-sm font-medium">Contents</p>
							{#if currentBundle.assets.length === 0}
								<p class="text-sm text-muted-foreground">This bundle is empty.</p>
							{:else}
								<ul class="space-y-1 text-sm text-muted-foreground">
									{#each bundleContents(currentBundle) as line (line.productId)}
										<li>{line.count}× {line.label}</li>
									{/each}
								</ul>
							{/if}
						</div>
					</Card.Content>
				{/if}
				<Card.Footer class="flex flex-wrap items-center justify-between gap-3">
					<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
						<kbd class="rounded border px-1.5 py-0.5 font-mono">←</kbd>
						<kbd class="rounded border px-1.5 py-0.5 font-mono">→</kbd>
						<span>step</span>
						<kbd class="rounded border px-1.5 py-0.5 font-mono">{modLabel}↵</kbd>
						<span>save &amp; next</span>
						<kbd class="rounded border px-1.5 py-0.5 font-mono">{modLabel}S</kbd>
						<span>save</span>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<Button
							icon="back"
							variant="outline"
							onclick={() => go(-1)}
							disabled={index === 0 || saving}
						>
							Previous
						</Button>
						<Button icon="save" variant="outline" onclick={saveAndStay} disabled={!dirty || saving}>
							{saving ? 'Saving…' : 'Save'}
						</Button>
						<Button icon="forward" onclick={() => go(1)} disabled={saving}>
							{index + 1 === visible.length ? 'Save & finish' : 'Save & next'}
						</Button>
					</div>
				</Card.Footer>
			</Card.Root>
		</div>
	{/if}
</div>

<Modal bind:open={mergeOpen} title="Merge duplicate product" size="lg" dismissible={!merging}>
	{#snippet description()}
		Two entries for one device split its units in half, and every count built on them is half right.
		Pick the other entry, then say which of the two names is the one to keep.
	{/snippet}

	{#snippet children()}
		<div class="space-y-5">
			<CreatableSelect
				items={mergeOptions}
				bind:value={mergePick}
				allowCreate={false}
				disabled={merging}
				placeholder="Search the whole catalog for the duplicate…"
			/>

			{#if survivor && absorbed}
				<fieldset class="space-y-2">
					<legend class="pb-2 text-sm font-medium">Which name is right?</legend>
					{#each [{ product: current, keep: true }, { product: picked, keep: false }] as choice (choice.keep)}
						{#if choice.product}
							<label
								class="flex items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-muted/40"
							>
								<input
									type="radio"
									name="mergeSurvivor"
									checked={keepCurrent === choice.keep}
									onchange={() => (keepCurrent = choice.keep)}
									disabled={merging}
									class="mt-0.5 h-4 w-4"
								/>
								<span class="min-w-0 flex-1">
									<span class="block font-medium"
										>{choice.product.manufacturer.name}
										{choice.product.name}</span
									>
									<span class="block text-xs text-muted-foreground">
										{categoryLabel(choice.product.category)} ·
										{plural(unitCount.get(choice.product.id) ?? 0, ['# unit here', '# units here'])}
									</span>
								</span>
							</label>
						{/if}
					{/each}
				</fieldset>

				<div class="space-y-1.5 rounded-md bg-muted/50 p-3 text-sm">
					<p>
						<span class="font-medium">{absorbed.manufacturer.name} {absorbed.name}</span> is
						deleted.
						{plural(movingCount, ['Its # unit becomes', 'Its # units become'])}
						<span class="font-medium">{survivor.manufacturer.name} {survivor.name}</span> — same tags,
						same history, same accessories.
					</p>
					{#if inheritsImage}
						<p class="text-muted-foreground">The image comes along — this entry has none.</p>
					{/if}
					<p class="text-muted-foreground">
						Purchase prices are each organization's own and move over with the merge — an
						organization that priced both entries keeps the surviving entry's price.
					</p>
					{#if survivor.manufacturerId !== absorbed.manufacturerId}
						<p class="text-muted-foreground">
							Different manufacturers: the units end up under
							<span class="font-medium">{survivor.manufacturer.name}</span>.
						</p>
					{/if}
					<p class="text-muted-foreground">
						Offers and invoices already written are not touched — they say what they said.
					</p>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<Button icon="close" variant="outline" onclick={() => (mergeOpen = false)} disabled={merging}>
			Cancel
		</Button>
		<Button icon="merge" onclick={doMerge} disabled={!picked || merging}>
			{merging ? 'Merging…' : 'Merge'}
		</Button>
	{/snippet}
</Modal>

<Modal bind:open={deleteOpen} title="Delete unused product" dismissible={!deleting}>
	{#snippet description()}
		This permanently removes the catalogue entry. Products with any units, including retired units,
		cannot be deleted.
	{/snippet}

	{#if current}
		<p class="text-sm">
			Delete <span class="font-medium">{current.manufacturer.name} {current.name}</span>?
		</p>
	{/if}

	{#snippet footer()}
		<Button icon="close" variant="outline" onclick={() => (deleteOpen = false)} disabled={deleting}
			>Cancel</Button
		>
		<Button
			icon="delete"
			variant="destructive"
			onclick={doDelete}
			disabled={!current || current.hasAssets || deleting}
		>
			{deleting ? 'Deleting…' : 'Delete product'}
		</Button>
	{/snippet}
</Modal>
