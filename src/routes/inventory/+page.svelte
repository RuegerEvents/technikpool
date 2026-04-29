<script lang="ts">
	import { getAssets } from '$lib/remote/assets.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { Button } from '$lib/components/ui/button';
	import { resolve } from '$app/paths';
	import { SvelteMap } from 'svelte/reactivity';

	let filterOrgId = $state('');
	let searchQuery = $state('');
	let expanded = new SvelteMap<string, boolean>();

	let orgs = $derived(await getMyOrgs());
	let assets = $derived(await getAssets(filterOrgId || undefined));

	type Asset = Awaited<ReturnType<typeof getAssets>>[number];
	type Group = {
		productId: string;
		name: string;
		manufacturerName: string;
		available: number;
		maintenance: number;
		broken: number;
		assets: Asset[];
	};

	let groups = $derived(
		Object.values(
			assets.reduce<Record<string, Group>>((acc, asset) => {
				const pid = asset.product.id;
				if (!acc[pid]) {
					acc[pid] = {
						productId: pid,
						name: asset.product.name,
						manufacturerName: asset.product.manufacturer.name,
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
						g.assets.some(
							(a) =>
								(a.serialNumber?.toLowerCase().includes(searchTrimmed) ?? false) ||
								(a.assetTag?.toLowerCase().includes(searchTrimmed) ?? false) ||
								(a.bundle?.name.toLowerCase().includes(searchTrimmed) ?? false) ||
								a.organization.name.toLowerCase().includes(searchTrimmed)
						)
				)
	);

	function toggle(productId: string) {
		expanded.set(productId, !expanded.get(productId));
	}

	const statusClass: Record<string, string> = {
		AVAILABLE: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
		MAINTENANCE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
		BROKEN: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
	};
</script>

<div class="space-y-6">
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
			<Button variant="outline" href={resolve('/assets/bundles')}>Bundles</Button>
			<Button href={resolve('/assets/new')}>Add Asset</Button>
		</div>
	</div>

	<input
		type="search"
		bind:value={searchQuery}
		placeholder="Search by product, manufacturer, S/N, tag, bundle…"
		class="h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
	/>

	{#if filteredGroups.length === 0}
		<div class="rounded-md border">
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<p class="text-lg font-medium">
					{assets.length === 0 ? 'No assets yet' : 'No results'}
				</p>
				<p class="text-sm text-muted-foreground">
					{assets.length === 0
						? 'Add assets to see your product catalog.'
						: 'Try a different search term.'}
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
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Product</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Manufacturer</th>
						<th class="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
						<th class="px-4 py-3 text-right font-medium text-muted-foreground">Available</th>
						<th class="px-4 py-3 text-right font-medium text-muted-foreground">Maint.</th>
						<th class="px-4 py-3 text-right font-medium text-muted-foreground">Broken</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredGroups as group (group.productId)}
						<tr
							class="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
							onclick={() => toggle(group.productId)}
						>
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
									<td colspan="6" class="px-4 py-2">
										<div class="flex items-center gap-6 pl-5 text-sm">
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
												{asset.status}
											</span>
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
