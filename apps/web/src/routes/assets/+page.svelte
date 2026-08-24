<script lang="ts">
	import { orgLabel } from '$lib/utils';
	import {
		getAssets,
		getCategories,
		getBundleTemplates,
		getRetiredAssets
	} from '$lib/remote/assets.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { Button } from '$lib/components/ui/button';
	import { CategorySelect } from '$lib/components/ui/category-select';
	import { CategoryPill } from '$lib/components/ui/category-pill';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import CheckoutBar from '$lib/components/ui/checkout-bar.svelte';
	import CsvImportModal from '$lib/components/CsvImportModal.svelte';
	import { AssetStatusBadge } from '$lib/components/ui/asset-status';

	let showImportModal = $state(false);

	// Sold and decommissioned units are out of the pool, so they get their own
	// filter rather than a share of the normal list.
	const RETIRED_FILTER = 'RETIRED';

	const statusFilterOptions = [
		['', 'All'],
		['AVAILABLE', 'Available'],
		['MAINTENANCE', 'Maintenance'],
		['BROKEN', 'Broken'],
		[RETIRED_FILTER, 'Sold / Decommissioned']
	] as const;

	// The filters live in the query string, so clicking into an asset and coming
	// back lands on the list as it was left. Read once here; the effect below
	// writes changes back.
	const initial = page.url.searchParams;
	const initialStatus = initial.get('status') ?? '';

	let filterOrgId = $state(initial.get('org') ?? '');
	let searchQuery = $state(initial.get('q') ?? '');
	let statusFilter = $state(
		statusFilterOptions.some(([value]) => value === initialStatus) ? initialStatus : ''
	);
	let categoryFilter = $state(initial.get('category') ?? '');
	let showBundleView = $state(initial.get('bundles') !== '0');
	let expanded = new SvelteMap<string, boolean>();
	let selectedAssetIds = new SvelteSet<string>();

	let showingRetired = $derived(statusFilter === RETIRED_FILTER);

	// replaceState, not a new history entry: every keystroke in the search box
	// would otherwise need its own Back press to get past.
	$effect(() => {
		const url = new URL(page.url);
		const params = {
			org: filterOrgId,
			q: searchQuery,
			status: statusFilter,
			category: categoryFilter,
			bundles: showBundleView ? '' : '0'
		};
		for (const [key, value] of Object.entries(params)) {
			if (value) url.searchParams.set(key, value);
			else url.searchParams.delete(key);
		}
		if (url.href === page.url.href) return;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- updating query params on the current route, not navigating to a typed path
		goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	});

	let orgs = $derived(await getMyOrgs());
	let assets = $derived(
		showingRetired
			? await getRetiredAssets(filterOrgId || undefined)
			: await getAssets(filterOrgId || undefined)
	);
	let categories = $derived(await getCategories());

	type Asset = Awaited<ReturnType<typeof getAssets>>[number];
	type TemplateData = Awaited<ReturnType<typeof getBundleTemplates>>[number];
	type BundleInstance = TemplateData['instances'][number];
	type BundleAsset = BundleInstance['assets'][number];

	let templates = $derived(
		showBundleView && !showingRetired
			? await getBundleTemplates(filterOrgId || undefined)
			: ([] as TemplateData[])
	);

	type Group = {
		productId: string;
		name: string;
		manufacturerName: string;
		categoryId: string;
		categoryName: string;
		categoryColor: string;
		available: number;
		maintenance: number;
		broken: number;
		assets: Asset[];
	};

	type InstanceGroup = BundleInstance & {
		filteredAssets: BundleAsset[];
		available: number;
		maintenance: number;
		broken: number;
	};

	type TemplateGroup = TemplateData & {
		instanceGroups: InstanceGroup[];
		totalAssets: number;
		// Bundle-instance counts (not asset counts) — how many physical kits of
		// this type are ready to send out vs. need attention.
		totalInstances: number;
		availableInstances: number;
		maintenanceInstances: number;
		brokenInstances: number;
	};

	// In bundle view, exclude bundled assets from product groups
	let baseAssets = $derived(showBundleView ? assets.filter((a) => !a.bundleId) : assets);

	let visibleAssets = $derived(
		baseAssets
			.filter((a) => (!statusFilter || showingRetired ? true : a.status === statusFilter))
			.filter((a) => (!categoryFilter ? true : a.product.categoryId === categoryFilter))
	);

	let groups = $derived(
		Object.values(
			visibleAssets.reduce<Record<string, Group>>((acc, asset) => {
				const pid = asset.product.id;
				if (!acc[pid]) {
					acc[pid] = {
						productId: pid,
						name: asset.product.name,
						manufacturerName: asset.product.manufacturer.name,
						categoryId: asset.product.categoryId,
						categoryName: asset.product.category.name,
						categoryColor: asset.product.category.color,
						available: 0,
						maintenance: 0,
						broken: 0,
						assets: []
					};
				}
				const g = acc[pid];
				g.assets.push(asset);
				if (asset.status === 'AVAILABLE') g.available++;
				else if (asset.status === 'MAINTENANCE') g.maintenance++;
				else if (asset.status === 'BROKEN') g.broken++;
				return acc;
			}, {})
		)
	);

	let searchTrimmed = $derived(searchQuery.toLowerCase().trim());
	let filteredGroups = $derived(
		!searchTrimmed
			? groups
			: groups.filter(
					(g) =>
						g.name.toLowerCase().includes(searchTrimmed) ||
						g.manufacturerName.toLowerCase().includes(searchTrimmed) ||
						g.categoryName.toLowerCase().includes(searchTrimmed) ||
						g.assets.some(
							(a) =>
								(a.serialNumber?.toLowerCase().includes(searchTrimmed) ?? false) ||
								(a.assetTag?.toLowerCase().includes(searchTrimmed) ?? false) ||
								(a.bundle?.template.name.toLowerCase().includes(searchTrimmed) ?? false) ||
								orgLabel(a.organization).toLowerCase().includes(searchTrimmed) ||
								a.organization.name.toLowerCase().includes(searchTrimmed)
						)
				)
	);

	let filteredBundles = $derived(
		!showBundleView || showingRetired
			? ([] as TemplateGroup[])
			: templates
					.map((t) => {
						const instanceGroups: InstanceGroup[] = t.instances.map((inst) => {
							const filteredAssets = inst.assets
								.filter((a) => !statusFilter || a.status === statusFilter)
								.filter((a) => !categoryFilter || a.product.categoryId === categoryFilter);
							return {
								...inst,
								filteredAssets,
								available: filteredAssets.filter((a) => a.status === 'AVAILABLE').length,
								maintenance: filteredAssets.filter((a) => a.status === 'MAINTENANCE').length,
								broken: filteredAssets.filter((a) => a.status === 'BROKEN').length
							};
						});
						return {
							...t,
							instanceGroups,
							totalAssets: instanceGroups.reduce((sum, i) => sum + i.filteredAssets.length, 0),
							totalInstances: instanceGroups.length,
							availableInstances: instanceGroups.filter(
								(i) => i.filteredAssets.length > 0 && i.maintenance === 0 && i.broken === 0
							).length,
							maintenanceInstances: instanceGroups.filter(
								(i) => i.broken === 0 && i.maintenance > 0
							).length,
							brokenInstances: instanceGroups.filter((i) => i.broken > 0).length
						};
					})
					.filter((t) => {
						if (!searchTrimmed) return t.totalAssets > 0;
						if (t.name.toLowerCase().includes(searchTrimmed)) return true;
						if (t.instances.some((i) => i.tag?.toLowerCase().includes(searchTrimmed))) return true;
						// Search full asset list so bundles surface even when status/category filter hides the match
						return t.instances.some((inst) =>
							inst.assets.some(
								(a) =>
									a.product.name.toLowerCase().includes(searchTrimmed) ||
									a.product.manufacturer.name.toLowerCase().includes(searchTrimmed) ||
									(a.serialNumber?.toLowerCase().includes(searchTrimmed) ?? false) ||
									(a.assetTag?.toLowerCase().includes(searchTrimmed) ?? false)
							)
						);
					})
	);

	function toggle(id: string) {
		expanded.set(id, !expanded.get(id));
	}

	let allFilteredAssetIds = $derived([
		...filteredBundles.flatMap((t) =>
			t.instanceGroups.flatMap((i) => i.filteredAssets.map((a) => a.id))
		),
		...filteredGroups.flatMap((g) => g.assets.map((a) => a.id))
	]);
	let allFilteredSelected = $derived(
		allFilteredAssetIds.length > 0 && allFilteredAssetIds.every((id) => selectedAssetIds.has(id))
	);
	let someFilteredSelected = $derived(allFilteredAssetIds.some((id) => selectedAssetIds.has(id)));

	function toggleSelectAll() {
		if (allFilteredSelected) {
			allFilteredAssetIds.forEach((id) => selectedAssetIds.delete(id));
		} else {
			allFilteredAssetIds.forEach((id) => selectedAssetIds.add(id));
		}
	}

	function indeterminate(node: HTMLInputElement, value: boolean) {
		node.indeterminate = value;
		return {
			update(v: boolean) {
				node.indeterminate = v;
			}
		};
	}

	// Nothing in the retired list can be checked out, so a selection carried
	// across the filter would only offer an action the server refuses.
	function setStatusFilter(value: string) {
		if ((value === RETIRED_FILTER) !== showingRetired) selectedAssetIds.clear();
		statusFilter = value;
	}

	let hasResults = $derived(
		showBundleView
			? filteredBundles.length > 0 || filteredGroups.length > 0
			: filteredGroups.length > 0
	);
</script>

<svelte:head><title>Devices | Technikpool</title></svelte:head>

<div class="space-y-6 {selectedAssetIds.size > 0 ? 'pb-20' : ''}">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Devices</h1>
			<p class="text-muted-foreground">Product catalog — click a row to see individual units.</p>
		</div>
		<div class="flex items-center gap-2">
			<select
				bind:value={filterOrgId}
				class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
			>
				<option value="">All Organizations</option>
				{#each orgs as org (org.id)}<option value={org.id}>{orgLabel(org)}</option>{/each}
			</select>
			<Button variant="outline" onclick={() => (showImportModal = true)}>Import CSV</Button>
			<Button variant="outline" href={resolve('/assets/bundles/new')}>Add Bundle</Button>
			<Button href={resolve('/assets/new')}>Add Asset</Button>
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<input
			type="search"
			bind:value={searchQuery}
			placeholder="Search by product, manufacturer, S/N, tag, bundle…"
			class="h-10 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
		/>
		<CategorySelect
			class="w-64"
			{categories}
			bind:value={categoryFilter}
			allowEmpty
			allLabel="All Categories"
		/>
		<div class="flex items-center gap-1">
			{#each statusFilterOptions as [val, label] (val)}
				<button
					type="button"
					onclick={() => setStatusFilter(val)}
					class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {statusFilter === val
						? 'bg-primary text-primary-foreground'
						: 'bg-muted text-muted-foreground hover:bg-muted/70'}">{label}</button
				>
			{/each}
		</div>
		<div class="ml-auto flex items-center gap-1">
			<button
				type="button"
				onclick={() => (showBundleView = true)}
				class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {showBundleView
					? 'bg-primary text-primary-foreground'
					: 'bg-muted text-muted-foreground hover:bg-muted/70'}">Bundle View</button
			>
			<button
				type="button"
				onclick={() => (showBundleView = false)}
				class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {!showBundleView
					? 'bg-primary text-primary-foreground'
					: 'bg-muted text-muted-foreground hover:bg-muted/70'}">All Products</button
			>
		</div>
	</div>

	{#if !hasResults}
		<div class="rounded-md border">
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<p class="text-lg font-medium">
					{assets.length === 0 ? 'No assets yet' : 'No results'}
				</p>
				<p class="text-sm text-muted-foreground">
					{assets.length === 0
						? 'Add assets to see your product catalog.'
						: 'Try a different search term or filter.'}
				</p>
				{#if assets.length === 0}
					<Button class="mt-4" variant="outline" href={resolve('/assets/new')}
						>Add your first asset</Button
					>
				{/if}
			</div>
		</div>
	{:else}
		<div class="rounded-md border">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b bg-muted/30">
						<th class="w-10 px-4 py-3">
							<input
								type="checkbox"
								checked={allFilteredSelected}
								use:indeterminate={someFilteredSelected && !allFilteredSelected}
								onclick={toggleSelectAll}
								class="h-4 w-4 cursor-pointer rounded border-input"
							/>
						</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Product</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Manufacturer</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
						<th class="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
						<th class="px-4 py-3 text-right font-medium text-muted-foreground">Available</th>
						<th class="px-4 py-3 text-right font-medium text-muted-foreground">Maint.</th>
						<th class="px-4 py-3 text-right font-medium text-muted-foreground">Broken</th>
					</tr>
				</thead>
				<tbody>
					{#if showBundleView}
						{#each filteredBundles as template (template.id)}
							{@const templateAssetIds = template.instanceGroups.flatMap((i) =>
								i.filteredAssets.map((a) => a.id)
							)}
							{@const allInTemplateSelected =
								templateAssetIds.length > 0 &&
								templateAssetIds.every((id) => selectedAssetIds.has(id))}
							<tr
								class="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
								onclick={() => toggle(template.id)}
							>
								<td class="px-4 py-3">
									<input
										type="checkbox"
										checked={allInTemplateSelected}
										onclick={(e) => {
											e.stopPropagation();
											if (allInTemplateSelected) {
												templateAssetIds.forEach((id) => selectedAssetIds.delete(id));
											} else {
												templateAssetIds.forEach((id) => selectedAssetIds.add(id));
											}
										}}
										class="h-4 w-4 cursor-pointer rounded border-input"
									/>
								</td>
								<td class="px-4 py-3">
									<div class="flex items-center gap-2">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											class="shrink-0 text-muted-foreground transition-transform {expanded.get(
												template.id
											)
												? 'rotate-90'
												: ''}"
										>
											<path d="m9 18 6-6-6-6" />
										</svg>
										<span class="font-medium">{template.name}</span>
										<span
											class="rounded-full border border-border px-1.5 py-0.5 text-xs text-muted-foreground"
											>Bundle</span
										>
									</div>
								</td>
								<td class="px-4 py-3 text-muted-foreground">—</td>
								<td class="px-4 py-3 text-muted-foreground">—</td>
								<td class="px-4 py-3">
									{#if template.category}
										<CategoryPill name={template.category.name} color={template.category.color} />
									{/if}
								</td>
								<td class="px-4 py-3 text-right font-mono tabular-nums">
									{template.totalInstances}
								</td>
								<td
									class="px-4 py-3 text-right font-mono text-green-700 tabular-nums dark:text-green-400"
								>
									{template.availableInstances}
								</td>
								<td
									class="px-4 py-3 text-right font-mono tabular-nums {template.maintenanceInstances >
									0
										? 'text-yellow-600 dark:text-yellow-400'
										: 'text-muted-foreground'}"
								>
									{template.maintenanceInstances}
								</td>
								<td
									class="px-4 py-3 text-right font-mono tabular-nums {template.brokenInstances > 0
										? 'text-red-600 dark:text-red-400'
										: 'text-muted-foreground'}"
								>
									{template.brokenInstances}
								</td>
							</tr>
							{#if expanded.get(template.id)}
								{#each template.instanceGroups as instance, i (instance.id)}
									{@const instanceAssetIds = instance.filteredAssets.map((a) => a.id)}
									{@const allInInstanceSelected =
										instanceAssetIds.length > 0 &&
										instanceAssetIds.every((id) => selectedAssetIds.has(id))}
									<tr
										class="cursor-pointer border-b bg-muted/10 transition-colors last:border-0 hover:bg-muted/30"
										onclick={() => toggle(instance.id)}
									>
										<td class="px-4 py-2">
											<input
												type="checkbox"
												checked={allInInstanceSelected}
												onclick={(e) => {
													e.stopPropagation();
													if (allInInstanceSelected) {
														instanceAssetIds.forEach((id) => selectedAssetIds.delete(id));
													} else {
														instanceAssetIds.forEach((id) => selectedAssetIds.add(id));
													}
												}}
												class="h-4 w-4 cursor-pointer rounded border-input"
											/>
										</td>
										<td colspan="7" class="px-4 py-2">
											<div class="flex items-center gap-6 text-sm">
												<span class="flex w-40 min-w-0 items-center gap-1.5">
													<svg
														xmlns="http://www.w3.org/2000/svg"
														width="12"
														height="12"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
														stroke-linecap="round"
														stroke-linejoin="round"
														class="shrink-0 text-muted-foreground transition-transform {expanded.get(
															instance.id
														)
															? 'rotate-90'
															: ''}"
													>
														<path d="m9 18 6-6-6-6" />
													</svg>
													<span class="truncate text-xs font-medium">
														{instance.tag ?? `Instance ${i + 1}`}
													</span>
												</span>
												{#if instance.location}
													<span class="text-xs text-muted-foreground">{instance.location.name}</span
													>
												{/if}
												<span class="text-xs text-muted-foreground">
													{instance.filteredAssets.length} items
												</span>
												<span class="text-xs text-green-700 dark:text-green-400">
													{instance.available} available
												</span>
												{#if instance.maintenance > 0}
													<span class="text-xs text-yellow-600 dark:text-yellow-400">
														{instance.maintenance} maint.
													</span>
												{/if}
												{#if instance.broken > 0}
													<span class="text-xs text-red-600 dark:text-red-400">
														{instance.broken} broken
													</span>
												{/if}
												<a
													href={resolve(`/assets/bundles/${instance.id}`)}
													class="ml-auto text-xs text-muted-foreground hover:text-foreground"
													onclick={(e) => e.stopPropagation()}
												>
													View →
												</a>
											</div>
										</td>
									</tr>
									{#if expanded.get(instance.id)}
										{#each instance.filteredAssets as asset (asset.id)}
											<tr class="border-b bg-muted/20 last:border-0">
												<td class="px-4 py-2 pl-8">
													<input
														type="checkbox"
														checked={selectedAssetIds.has(asset.id)}
														onclick={() => {
															if (selectedAssetIds.has(asset.id)) {
																selectedAssetIds.delete(asset.id);
															} else {
																selectedAssetIds.add(asset.id);
															}
														}}
														class="h-4 w-4 cursor-pointer rounded border-input"
													/>
												</td>
												<td colspan="7" class="px-4 py-2">
													<div class="flex items-center gap-6 text-sm">
														<span class="w-40 truncate text-xs font-medium">
															{asset.product.name}
														</span>
														<span class="w-36 font-mono text-xs text-muted-foreground">
															{asset.serialNumber ? `S/N: ${asset.serialNumber}` : '—'}
														</span>
														{#if asset.assetTag}
															<span class="text-xs text-muted-foreground"
																>Tag: {asset.assetTag}</span
															>
														{/if}
														<AssetStatusBadge status={asset.status} />
														{#if asset.location}
															<span class="text-xs text-muted-foreground"
																>{asset.location.name}</span
															>
														{/if}
														<a
															href={resolve(`/assets/${asset.id}`)}
															class="ml-auto text-xs text-muted-foreground hover:text-foreground"
															onclick={(e) => e.stopPropagation()}
														>
															View →
														</a>
													</div>
												</td>
											</tr>
										{/each}
									{/if}
								{/each}
							{/if}
						{/each}
					{/if}

					{#each filteredGroups as group (group.productId)}
						{@const groupAssetIds = group.assets.map((a) => a.id)}
						{@const allInGroupSelected =
							groupAssetIds.length > 0 && groupAssetIds.every((id) => selectedAssetIds.has(id))}
						<tr
							class="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
							onclick={() => toggle(group.productId)}
						>
							<td class="px-4 py-3">
								<input
									type="checkbox"
									checked={allInGroupSelected}
									onclick={(e) => {
										e.stopPropagation();
										if (allInGroupSelected) {
											groupAssetIds.forEach((id) => selectedAssetIds.delete(id));
										} else {
											groupAssetIds.forEach((id) => selectedAssetIds.add(id));
										}
									}}
									class="h-4 w-4 cursor-pointer rounded border-input"
								/>
							</td>
							<td class="px-4 py-3">
								<div class="flex items-center gap-2">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="shrink-0 text-muted-foreground transition-transform {expanded.get(
											group.productId
										)
											? 'rotate-90'
											: ''}"
									>
										<path d="m9 18 6-6-6-6" />
									</svg>
									<span class="font-medium">{group.name}</span>
								</div>
							</td>
							<td class="px-4 py-3 text-muted-foreground">{group.manufacturerName}</td>
							<td class="px-4 py-3 text-muted-foreground">—</td>
							<td class="px-4 py-3">
								<CategoryPill name={group.categoryName} color={group.categoryColor} />
							</td>
							<td class="px-4 py-3 text-right font-mono tabular-nums">
								{group.assets.length}
							</td>
							<td
								class="px-4 py-3 text-right font-mono text-green-700 tabular-nums dark:text-green-400"
							>
								{group.available}
							</td>
							<td
								class="px-4 py-3 text-right font-mono tabular-nums {group.maintenance > 0
									? 'text-yellow-600 dark:text-yellow-400'
									: 'text-muted-foreground'}"
							>
								{group.maintenance}
							</td>
							<td
								class="px-4 py-3 text-right font-mono tabular-nums {group.broken > 0
									? 'text-red-600 dark:text-red-400'
									: 'text-muted-foreground'}"
							>
								{group.broken}
							</td>
						</tr>
						{#if expanded.get(group.productId)}
							{#each group.assets as asset (asset.id)}
								<tr class="border-b bg-muted/10 last:border-0">
									<td class="px-4 py-2">
										<input
											type="checkbox"
											checked={selectedAssetIds.has(asset.id)}
											onclick={() => {
												if (selectedAssetIds.has(asset.id)) {
													selectedAssetIds.delete(asset.id);
												} else {
													selectedAssetIds.add(asset.id);
												}
											}}
											class="h-4 w-4 cursor-pointer rounded border-input"
										/>
									</td>
									<td colspan="7" class="px-4 py-2">
										<div class="flex items-center gap-6 text-sm">
											<span class="w-36 font-mono text-xs text-muted-foreground">
												{asset.serialNumber ? `S/N: ${asset.serialNumber}` : '—'}
											</span>
											{#if asset.assetTag}
												<span class="text-xs text-muted-foreground">Tag: {asset.assetTag}</span>
											{/if}
											<AssetStatusBadge status={asset.status} />
											{#if asset.location && !showingRetired}
												<span class="text-xs text-muted-foreground">{asset.location.name}</span>
											{/if}
											<span class="flex-1 text-xs text-muted-foreground"
												>{orgLabel(asset.organization)}</span
											>
											{#if asset.bundle}
												<a
													href={resolve(`/assets/bundles/${asset.bundle.id}`)}
													class="text-xs text-muted-foreground hover:underline"
													onclick={(e) => e.stopPropagation()}
												>
													{asset.bundle.template.name}
												</a>
											{/if}
											<a
												href={resolve(`/assets/${asset.id}`)}
												class="text-xs text-muted-foreground hover:text-foreground"
												onclick={(e) => e.stopPropagation()}
											>
												View →
											</a>
										</div>
									</td>
								</tr>
							{/each}
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

{#if !showingRetired}
	<CheckoutBar selectedIds={selectedAssetIds} onClear={() => selectedAssetIds.clear()} />
{/if}

{#if showImportModal}
	<CsvImportModal onClose={() => (showImportModal = false)} />
{/if}
