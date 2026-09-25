<script lang="ts">
	import { productLabel } from '$lib/product-label';
	import { categoryLabel } from '$lib/category';
	import { cableTwinGroups, cableTwinKey } from '$lib/cable';
	import { getErrorMessage, orgLabel } from '$lib/utils';
	import {
		getBundles,
		getCategories,
		getManufacturers,
		getProductCatalog,
		getProducts,
		updateBundle
	} from '$lib/remote/assets.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { CategoryPill } from '$lib/components/ui/category-pill';
	import { ProductThumb } from '$lib/components/ui/product-thumb';
	import { ProductEditor } from '$lib/components/ui/product-editor';
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
	// 'twin' is the odd one out — nothing is missing, there is one entry too
	// many: a cable the catalogue holds a second time under another name.
	let missing = $state<'none' | 'image' | 'price' | 'twin'>('none');
	// Accessory-only products are billed with the unit they hang off, so they
	// usually need no price of their own. Off unless asked.
	let includeAccessories = $state(false);

	// Read through the queries rather than awaited, so the page is on screen
	// while the catalogue is on its way. See CLAUDE.md, "Loading states".
	let orgsQuery = $derived(getMyOrgs());
	let orgs = $derived(orgsQuery.current ?? []);
	let categoriesQuery = $derived(getCategories());
	let categories = $derived(categoriesQuery.current ?? []);
	let manufacturersQuery = $derived(getManufacturers());
	let manufacturers = $derived(manufacturersQuery.current ?? []);
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
				label: productLabel(asset.product),
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

	// The position is held as an id, not an index: a product that stops matching
	// the filter changes every index after it, and an index would then point at
	// whatever slid into its place.
	let currentId = $state('');

	let searchTrimmed = $derived(searchQuery.toLowerCase().trim());

	function matches(product: CatalogProduct) {
		if (missing === 'image' && product.imagePath) return false;
		if (missing === 'price' && !needsPrice(product)) return false;
		if (missing === 'twin' && !hasTwin(product)) return false;
		if (!searchTrimmed) return true;
		return (
			product.name.toLowerCase().includes(searchTrimmed) ||
			(product.manufacturer?.name.toLowerCase().includes(searchTrimmed) ?? false) ||
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

	let saving = $state(false);
	// The editor's own state, read so a step knows whether it has to save first.
	let productDirty = $state(false);
	let editorModalOpen = $state(false);
	let editor = $state<ReturnType<typeof ProductEditor>>();

	function storedPrice(product: CatalogProduct, orgId: string): number | undefined {
		const row = product.prices.find((p) => p.organizationId === orgId);
		return row == null ? undefined : Number(row.netPurchasePrice);
	}

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

	let dirty = $derived((!!current && productDirty) || bundleDirty);

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
		if (!current || !editor) return true;
		return editor.save();
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

	// ── Duplicates ────────────────────────────────────────────────────────────
	// Two rows for one device is the failure mode this catalogue has, and the
	// wizard is where they are noticed. Merging one away is the editor's job;
	// finding them is this list's.
	let allProductsQuery = $derived(getProducts());
	let allProducts = $derived(allProductsQuery.current ?? []);

	// Cables are where duplicates can be *found* rather than stumbled over: the
	// name is free text, but what the cable is sits in columns. Grouped over the
	// whole catalogue for the same reason the picker lists it — the other half of
	// a pair may be an entry nobody here holds units of. See `cableTwinKey`.
	let twinGroups = $derived(cableTwinGroups(allProducts));

	function hasTwin(product: CatalogProduct) {
		const key = cableTwinKey(product);
		return !!key && twinGroups.has(key);
	}

	let twinCount = $derived(products.filter(hasTwin).length);

	let unitCounts = $derived(new Map(products.map((p) => [p.id, p.assetCount])));

	// Where the editor's delete lands: the neighbour of the deleted product,
	// read while it is still in the list.
	let afterDelete = '';

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
		if (!entry || editorModalOpen) return;
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
			<!-- Only once there is one: unlike a missing image, most catalogues never
			     have a duplicate cable, and a permanent "(0)" is a button to nowhere. -->
			{#if twinCount > 0 || missing === 'twin'}
				<button
					type="button"
					onclick={() => (missing = 'twin')}
					class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {missing === 'twin'
						? 'bg-primary text-primary-foreground'
						: 'bg-muted text-muted-foreground hover:bg-muted/70'}"
					>Duplicate cables ({twinCount})</button
				>
			{/if}
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
			You can look through the catalog and add a picture where one is missing. Editing a product
			needs admin or owner rights in one of your organizations.
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
										>{product.manufacturer?.name}</span
									>
								</span>
								{#if hasTwin(product)}
									<span
										class="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-300"
										>Duplicate cable</span
									>
								{/if}
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

			{#if current}
				<ProductEditor
					bind:this={editor}
					product={current}
					{orgs}
					{categories}
					{manufacturers}
					{allProducts}
					{unitCounts}
					isAdmin={data.isAdmin}
					userId={data.user?.id}
					priceOrgId={filterOrgId}
					bind:dirty={productDirty}
					bind:saving
					bind:modalOpen={editorModalOpen}
					headerExtra={position}
					footerActions={wizardFooter}
					showProductLink
					idPrefix="wizard"
					onMerged={(survivorId) => (currentId = survivorId)}
					onBeforeDelete={() =>
						(afterDelete = visible[index + 1]?.id ?? visible[index - 1]?.id ?? '')}
					onDeleted={() => (currentId = afterDelete)}
				/>
			{:else if currentBundle}
				<Card.Root>
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
							{@render position()}
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
					<Card.Footer class="flex flex-wrap items-center justify-between gap-3">
						{@render wizardFooter()}
					</Card.Footer>
				</Card.Root>
			{/if}
		</div>
	{/if}
</div>

<!-- Last in the file on purpose: see CLAUDE.md on wuchale and snippets. -->
{#snippet position()}
	<span class="font-mono text-sm text-muted-foreground tabular-nums"
		>{index + 1} / {visible.length}</span
	>
{/snippet}

{#snippet wizardFooter()}
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
		<Button icon="back" variant="outline" onclick={() => go(-1)} disabled={index === 0 || saving}>
			Previous
		</Button>
		<Button icon="save" variant="outline" onclick={saveAndStay} disabled={!dirty || saving}>
			{saving ? 'Saving…' : 'Save'}
		</Button>
		<Button icon="forward" onclick={() => go(1)} disabled={saving}>
			{index + 1 === visible.length ? 'Save & finish' : 'Save & next'}
		</Button>
	</div>
{/snippet}
