<script lang="ts">
	import { getErrorMessage, orgLabel } from '$lib/utils';
	import { getCategories, getProductCatalog, updateProduct } from '$lib/remote/assets.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { CategoryPill } from '$lib/components/ui/category-pill';
	import { ProductThumb } from '$lib/components/ui/product-thumb';
	import { ProductFields, type ProductDraft } from '$lib/components/ui/product-fields';
	import { resolve } from '$app/paths';
	import { browser } from '$app/environment';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	// ⌘ on a Mac, Ctrl everywhere else. Also keeps the symbol out of the
	// translation catalogue, where it has no business being.
	let modLabel = $derived(browser && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl');

	let filterOrgId = $state('');
	let searchQuery = $state('');
	let onlyMissingImage = $state(false);

	let orgs = $derived(await getMyOrgs());
	let categories = $derived(await getCategories());
	let products = $derived(await getProductCatalog(filterOrgId || undefined));

	type CatalogProduct = Awaited<ReturnType<typeof getProductCatalog>>[number];

	// Products are global, but editing one is an org-admin right. A member who
	// hasn't got it anywhere would only find that out when a save failed.
	let canEdit = $derived(
		data.isAdmin || orgs.some((o) => o.role === 'ADMIN' || o.role === 'OWNER')
	);

	// The position is held as an id, not an index: a product that stops matching
	// the filter changes every index after it, and an index would then point at
	// whatever slid into its place.
	let currentId = $state('');

	let searchTrimmed = $derived(searchQuery.toLowerCase().trim());

	function matches(product: CatalogProduct) {
		if (onlyMissingImage && product.imageUrl) return false;
		if (!searchTrimmed) return true;
		return (
			product.name.toLowerCase().includes(searchTrimmed) ||
			product.manufacturer.name.toLowerCase().includes(searchTrimmed) ||
			product.category.name.toLowerCase().includes(searchTrimmed)
		);
	}

	// Whatever is in front stays in the list even once it stops matching: giving
	// a product the image it was missing is exactly what drops it out of the
	// "missing image" filter, and the list must not shift out from under the
	// person who just did that. It leaves as soon as they move on.
	let visible = $derived(products.filter((p) => p.id === currentId || matches(p)));

	let missingImageCount = $derived(products.filter((p) => !p.imageUrl).length);

	let index = $derived(
		Math.max(
			0,
			visible.findIndex((p) => p.id === currentId)
		)
	);
	let current = $derived(visible.at(index));

	let draft = $state<ProductDraft>({ name: '', categoryId: '', imageUrl: '' });
	let draftFor = $state('');
	let saving = $state(false);

	// The draft follows whatever product is in front — an effect rather than a
	// derived, because from there on it is the user's own state to edit.
	$effect(() => {
		const product = current;
		if (!product || product.id === draftFor) return;
		draftFor = product.id;
		draft = {
			name: product.name,
			categoryId: product.categoryId,
			imageUrl: product.imageUrl ?? ''
		};
	});

	let dirty = $derived(
		!!current &&
			draftFor === current.id &&
			(draft.name.trim() !== current.name ||
				draft.categoryId !== current.categoryId ||
				draft.imageUrl.trim() !== (current.imageUrl ?? ''))
	);

	/** Returns whether the save went through, so a caller can hold position on failure. */
	async function save(): Promise<boolean> {
		if (!current || !dirty || saving) return true;
		if (!draft.name.trim()) {
			toast.error('Product name is required');
			return false;
		}
		saving = true;
		try {
			await updateProduct({
				productId: current.id,
				name: draft.name,
				categoryId: draft.categoryId,
				imageUrl: draft.imageUrl
			});
			return true;
		} catch (err) {
			toast.error(getErrorMessage(err));
			return false;
		} finally {
			saving = false;
		}
	}

	async function saveAndStay() {
		if (await save()) toast.success('Product updated');
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
	async function select(product: CatalogProduct) {
		if (product.id === currentId) return;
		if (dirty && !(await save())) return;
		currentId = product.id;
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
		if (!current) return;
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
				onclick={() => (onlyMissingImage = false)}
				class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {!onlyMissingImage
					? 'bg-primary text-primary-foreground'
					: 'bg-muted text-muted-foreground hover:bg-muted/70'}">All products</button
			>
			<button
				type="button"
				onclick={() => (onlyMissingImage = true)}
				class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {onlyMissingImage
					? 'bg-primary text-primary-foreground'
					: 'bg-muted text-muted-foreground hover:bg-muted/70'}"
				>Missing image ({missingImageCount})</button
			>
		</div>
	</div>

	{#if !canEdit}
		<div class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
			You can look through the catalog, but editing a product needs admin or owner rights in one of
			your organizations.
		</div>
	{/if}

	{#if visible.length === 0}
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
	{:else if current}
		<div class="grid gap-6 lg:grid-cols-[22rem_1fr]">
			<Card.Root class="overflow-hidden">
				<Card.Header class="pb-3">
					<Card.Title class="text-base">Catalog</Card.Title>
					<Card.Description>{index + 1} of {visible.length}</Card.Description>
				</Card.Header>
				<Card.Content class="max-h-[32rem] overflow-y-auto p-0">
					{#each visible as product (product.id)}
						{@const active = product.id === current.id}
						<button
							type="button"
							use:scrollIntoViewWhenActive={active}
							onclick={() => select(product)}
							class="flex w-full items-center gap-3 border-b px-4 py-2.5 text-left transition-colors last:border-0 {active
								? 'bg-muted'
								: 'hover:bg-muted/40'}"
						>
							<ProductThumb src={product.imageUrl} alt={product.name} size={32} />
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm font-medium">{product.name}</span>
								<span class="block truncate text-xs text-muted-foreground"
									>{product.manufacturer.name}</span
								>
							</span>
							{#if !product.imageUrl}
								<span
									class="shrink-0 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
									>No image</span
								>
							{/if}
						</button>
					{/each}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="min-w-0">
							<Card.Title class="flex items-center gap-2">
								{current.manufacturer.name}
								{current.name}
								{#if dirty}
									<span class="h-2 w-2 shrink-0 rounded-full bg-yellow-500" title="Unsaved changes"
									></span>
								{/if}
							</Card.Title>
							<Card.Description class="flex flex-wrap items-center gap-2 pt-1">
								<CategoryPill name={current.category.name} color={current.category.color} />
								<span>{current.assetCount} units</span>
								<a
									href="{resolve('/assets')}?q={encodeURIComponent(current.name)}"
									class="underline-offset-2 hover:text-foreground hover:underline"
									>View in Devices →</a
								>
							</Card.Description>
						</div>
						<span class="font-mono text-sm text-muted-foreground tabular-nums"
							>{index + 1} / {visible.length}</span
						>
					</div>
				</Card.Header>
				<Card.Content>
					<ProductFields {categories} bind:value={draft} idPrefix="wizard" />
				</Card.Content>
				<Card.Footer class="flex flex-wrap items-center justify-between gap-3">
					<div class="flex items-center gap-2 text-xs text-muted-foreground">
						<kbd class="rounded border px-1.5 py-0.5 font-mono">←</kbd>
						<kbd class="rounded border px-1.5 py-0.5 font-mono">→</kbd>
						<span>step</span>
						<kbd class="rounded border px-1.5 py-0.5 font-mono">{modLabel}↵</kbd>
						<span>save &amp; next</span>
						<kbd class="rounded border px-1.5 py-0.5 font-mono">{modLabel}S</kbd>
						<span>save</span>
					</div>
					<div class="flex items-center gap-2">
						<Button variant="outline" onclick={() => go(-1)} disabled={index === 0 || saving}>
							Previous
						</Button>
						<Button variant="outline" onclick={saveAndStay} disabled={!dirty || saving}>
							{saving ? 'Saving…' : 'Save'}
						</Button>
						<Button onclick={() => go(1)} disabled={saving}>
							{index + 1 === visible.length ? 'Save & finish' : 'Save & next'}
						</Button>
					</div>
				</Card.Footer>
			</Card.Root>
		</div>
	{/if}
</div>
