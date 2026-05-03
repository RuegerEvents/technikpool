<script lang="ts">
	import { getAssets, getCategories, getBundles } from '$lib/remote/assets.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { Button } from '$lib/components/ui/button';
	import { CategorySelect } from '$lib/components/ui/category-select';
	import { CategoryPill } from '$lib/components/ui/category-pill';
	import { resolve } from '$app/paths';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import CheckoutBar from '$lib/components/ui/checkout-bar.svelte';
	import CsvImportModal from '$lib/components/CsvImportModal.svelte';

	let showImportModal = $state(false);

	let filterOrgId = $state('');
	let searchQuery = $state('');
	let statusFilter = $state('');
	let categoryFilter = $state('');
	let showBundleView = $state(true);
	let expanded = new SvelteMap<string, boolean>();
	let selectedAssetIds = new SvelteSet<string>();

	let orgs = $derived(await getMyOrgs());
	let assets = $derived(await getAssets(filterOrgId || undefined));
	let categories = $derived(await getCategories());

	type Asset = Awaited<ReturnType<typeof getAssets>>[number];
	type BundleData = Awaited<ReturnType<typeof getBundles>>[number];
	type BundleAsset = BundleData['assets'][number];

	let bundles = $derived(
		showBundleView ? await getBundles(filterOrgId || undefined) : ([] as BundleData[])
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

	type BundleGroup = BundleData & {
		filteredAssets: BundleAsset[];
		available: number;
		maintenance: number;
		broken: number;
	};

	// In bundle view, exclude bundled assets from product groups
	let baseAssets = $derived(showBundleView ? assets.filter((a) => !a.bundleId) : assets);

	let visibleAssets = $derived(
		baseAssets
			.filter((a) => (!statusFilter ? true : a.status === statusFilter))
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
								(a.bundle?.name.toLowerCase().includes(searchTrimmed) ?? false) ||
								a.organization.name.toLowerCase().includes(searchTrimmed)
						)
				)
	);

	let filteredBundles = $derived(
		!showBundleView
			? ([] as BundleGroup[])
			: bundles
					.map((b) => {
						const filteredAssets = b.assets
							.filter((a) => !statusFilter || a.status === statusFilter)
							.filter((a) => !categoryFilter || a.product.categoryId === categoryFilter);
						return {
							...b,
							filteredAssets,
							available: filteredAssets.filter((a) => a.status === 'AVAILABLE').length,
							maintenance: filteredAssets.filter((a) => a.status === 'MAINTENANCE').length,
							broken: filteredAssets.filter((a) => a.status === 'BROKEN').length
						};
					})
					.filter((b) => {
						if (!searchTrimmed) return b.filteredAssets.length > 0;
						if (b.name.toLowerCase().includes(searchTrimmed)) return true;
						// Search full asset list so bundles surface even when status/category filter hides the match
						return b.assets.some(
							(a) =>
								a.product.name.toLowerCase().includes(searchTrimmed) ||
								a.product.manufacturer.name.toLowerCase().includes(searchTrimmed) ||
								(a.serialNumber?.toLowerCase().includes(searchTrimmed) ?? false) ||
								(a.assetTag?.toLowerCase().includes(searchTrimmed) ?? false)
						);
					})
	);

	function toggle(id: string) {
		expanded.set(id, !expanded.get(id));
	}

	let allFilteredAssetIds = $derived([
		...filteredBundles.flatMap((b) => b.filteredAssets.map((a) => a.id)),
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

	const statusFilterOptions = [
		['', 'All'],
		['AVAILABLE', 'Available'],
		['MAINTENANCE', 'Maintenance'],
		['BROKEN', 'Broken']
	] as const;

	const statusClass: Record<string, string> = {
		AVAILABLE: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
		MAINTENANCE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
		BROKEN: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
	};

	const statusLabels: Record<string, string> = {
		AVAILABLE: 'Available',
		MAINTENANCE: 'Maintenance',
		BROKEN: 'Broken'
	};

	let hasResults = $derived(
		showBundleView
			? filteredBundles.length > 0 || filteredGroups.length > 0
			: filteredGroups.length > 0
	);
</script>

<svelte:head><title>Inventory | Technikpool</title></svelte:head>

<div class="space-y-6 {selectedAssetIds.size > 0 ? 'pb-20' : ''}">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Inventory</h1>
			<p class="text-muted-foreground">Product catalog — click a row to see individual units.</p>
		</div>
		<div class="flex items-center gap-2">
			<select
				bind:value={filterOrgId}
				class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
			>
				<option value="">All Organizations</option>
				{#each orgs as org (org.id)}<option value={org.id}>{org.name}</option>{/each}
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
					onclick={() => (statusFilter = val)}
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
						{#each filteredBundles as bundle (bundle.id)}
							{@const bundleAssetIds = bundle.filteredAssets.map((a) => a.id)}
							{@const allInBundleSelected =
								bundleAssetIds.length > 0 && bundleAssetIds.every((id) => selectedAssetIds.has(id))}
							<tr
								class="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
								onclick={() => toggle(bundle.id)}
							>
								<td class="px-4 py-3">
									<input
										type="checkbox"
										checked={allInBundleSelected}
										onclick={(e) => {
											e.stopPropagation();
											if (allInBundleSelected) {
												bundleAssetIds.forEach((id) => selectedAssetIds.delete(id));
											} else {
												bundleAssetIds.forEach((id) => selectedAssetIds.add(id));
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
												bundle.id
											)
												? 'rotate-90'
												: ''}"
										>
											<path d="m9 18 6-6-6-6" />
										</svg>
										<span class="font-medium">{bundle.name}</span>
										<span
											class="rounded-full border border-border px-1.5 py-0.5 text-xs text-muted-foreground"
											>Bundle</span
										>
										<a
											href={resolve(`/assets/bundles/${bundle.id}`)}
											class="ml-auto text-xs text-muted-foreground hover:text-foreground"
											onclick={(e) => e.stopPropagation()}
										>
											View →
										</a>
									</div>
								</td>
								<td class="px-4 py-3 text-muted-foreground">—</td>
								<td class="px-4 py-3 text-muted-foreground">
									{bundle.location?.name ?? '—'}
								</td>
								<td class="px-4 py-3">
									{#if bundle.category}
										<CategoryPill name={bundle.category.name} color={bundle.category.color} />
									{/if}
								</td>
								<td class="px-4 py-3 text-right font-mono tabular-nums">
									{bundle.filteredAssets.length}
								</td>
								<td
									class="px-4 py-3 text-right font-mono text-green-700 tabular-nums dark:text-green-400"
								>
									{bundle.available}
								</td>
								<td
									class="px-4 py-3 text-right font-mono tabular-nums {bundle.maintenance > 0
										? 'text-yellow-600 dark:text-yellow-400'
										: 'text-muted-foreground'}"
								>
									{bundle.maintenance}
								</td>
								<td
									class="px-4 py-3 text-right font-mono tabular-nums {bundle.broken > 0
										? 'text-red-600 dark:text-red-400'
										: 'text-muted-foreground'}"
								>
									{bundle.broken}
								</td>
							</tr>
							{#if expanded.get(bundle.id)}
								{#each bundle.filteredAssets as asset (asset.id)}
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
												<span class="w-40 truncate text-xs font-medium">
													{asset.product.name}
												</span>
												<span class="w-36 font-mono text-xs text-muted-foreground">
													{asset.serialNumber ? `S/N: ${asset.serialNumber}` : '—'}
												</span>
												{#if asset.assetTag}
													<span class="text-xs text-muted-foreground">Tag: {asset.assetTag}</span>
												{/if}
												<span
													class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold {statusClass[
														asset.status
													] ?? ''}"
												>
													{statusLabels[asset.status] ?? asset.status}
												</span>
												{#if asset.location}
													<span class="text-xs text-muted-foreground">{asset.location.name}</span>
												{/if}
												<a
													href={resolve(`/inventory/${asset.id}`)}
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
											<span
												class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold {statusClass[
													asset.status
												] ?? ''}"
											>
												{statusLabels[asset.status] ?? asset.status}
											</span>
											{#if asset.location}
												<span class="text-xs text-muted-foreground">{asset.location.name}</span>
											{/if}
											<span class="flex-1 text-xs text-muted-foreground"
												>{asset.organization.name}</span
											>
											{#if asset.bundle}
												<a
													href={resolve(`/assets/bundles/${asset.bundle.id}`)}
													class="text-xs text-muted-foreground hover:underline"
													onclick={(e) => e.stopPropagation()}
												>
													{asset.bundle.name}
												</a>
											{/if}
											<a
												href={resolve(`/inventory/${asset.id}`)}
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

<CheckoutBar selectedIds={selectedAssetIds} onClear={() => selectedAssetIds.clear()} />

{#if showImportModal}
	<CsvImportModal onClose={() => (showImportModal = false)} />
{/if}
