<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { getBundle, getAssets, addAssetToBundle, removeAssetFromBundle } from '$lib/remote/assets.remote';
	import { page } from '$app/stores';
	import { toast } from 'svelte-sonner';

	const bundleId = $page.params.id as string;

	let showAddModal = $state(false);
	let searchQuery = $state('');
	let working = $state(false);

	let allAssets = $state<Awaited<ReturnType<typeof getAssets>>>([]);
	let assetsLoaded = $state(false);

	$effect(() => {
		if (showAddModal && !assetsLoaded) {
			getAssets().then((a) => { allAssets = a; assetsLoaded = true; });
		}
	});

	async function handleAdd(assetId: string) {
		working = true;
		try {
			await addAssetToBundle({ bundleId, assetId });
			toast.success('Asset added to bundle');
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			working = false;
		}
	}

	async function handleRemove(assetId: string) {
		working = true;
		try {
			await removeAssetFromBundle({ bundleId, assetId });
			toast.success('Asset removed from bundle');
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			working = false;
		}
	}

	const statusClass: Record<string, string> = {
		AVAILABLE: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
		MAINTENANCE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
		BROKEN: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
	};
</script>

{#if true}
	{@const bundle = await getBundle(bundleId)}
	{#if !bundle}
		<p>Bundle not found.</p>
	{:else}
		<div class="space-y-6">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="text-3xl font-bold tracking-tight">{bundle.name}</h1>
					<p class="text-muted-foreground">{bundle.organization.name}{bundle.description ? ` — ${bundle.description}` : ''}</p>
				</div>
				<div class="flex gap-2">
					<Button variant="outline" href="/assets/bundles">Back</Button>
					<Button onclick={() => (showAddModal = !showAddModal)}>
						{showAddModal ? 'Close' : 'Add Assets'}
					</Button>
				</div>
			</div>

			{#if showAddModal}
				<Card.Root class="bg-muted/30">
					<Card.Header>
						<Card.Title>Add Assets to Bundle</Card.Title>
						<div class="mt-2">
							<input
								type="search"
								bind:value={searchQuery}
								placeholder="Search assets…"
								class="h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
							/>
						</div>
					</Card.Header>
					<Card.Content>
						{#if !assetsLoaded}
							<p class="text-sm text-muted-foreground">Loading…</p>
						{:else}
							{@const bundleAssetIds = new Set(bundle.assets.map((a) => a.id))}
							{@const q = searchQuery.toLowerCase().trim()}
							{@const available = allAssets.filter((a) => {
								if (bundleAssetIds.has(a.id)) return false;
								if (!q) return true;
								return a.product.name.toLowerCase().includes(q) ||
									a.product.manufacturer.name.toLowerCase().includes(q) ||
									(a.serialNumber?.toLowerCase().includes(q) ?? false);
							})}
							{#if available.length === 0}
								<p class="text-sm text-muted-foreground">No assets available to add.</p>
							{:else}
								<div class="max-h-64 overflow-y-auto rounded-md border">
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
											{#each available as asset}
												<tr class="border-b last:border-0 bg-background hover:bg-muted/30">
													<td class="px-3 py-2">
														<p class="font-medium">{asset.product.name}</p>
														<p class="text-xs text-muted-foreground">{asset.product.manufacturer.name}</p>
													</td>
													<td class="px-3 py-2 font-mono text-xs">{asset.serialNumber ?? '—'}</td>
													<td class="px-3 py-2 text-xs text-muted-foreground">{asset.organization.name}</td>
													<td class="px-3 py-2 text-right">
														<Button size="sm" disabled={working} onclick={() => handleAdd(asset.id)}>Add</Button>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						{/if}
					</Card.Content>
				</Card.Root>
			{/if}

			{#if bundle.assets.length === 0}
				<Card.Root>
					<Card.Content class="py-12 text-center text-muted-foreground">
						No assets in this bundle yet. Click "Add Assets" to get started.
					</Card.Content>
				</Card.Root>
			{:else}
				<Card.Root>
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b bg-muted/30">
									<th class="px-4 py-3 text-left font-medium text-muted-foreground">Product</th>
									<th class="px-4 py-3 text-left font-medium text-muted-foreground">Manufacturer</th>
									<th class="px-4 py-3 text-left font-medium text-muted-foreground">Serial Number</th>
									<th class="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
									<th class="px-4 py-3 text-left font-medium text-muted-foreground">Org</th>
									<th class="px-4 py-3"></th>
								</tr>
							</thead>
							<tbody>
								{#each bundle.assets as asset}
									<tr class="border-b last:border-0 hover:bg-muted/30 transition-colors">
										<td class="px-4 py-3 font-medium">{asset.product.name}</td>
										<td class="px-4 py-3 text-muted-foreground">{asset.product.manufacturer.name}</td>
										<td class="px-4 py-3 font-mono text-xs">{asset.serialNumber ?? '—'}</td>
										<td class="px-4 py-3">
											<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {statusClass[asset.status] ?? ''}">
												{asset.status}
											</span>
										</td>
										<td class="px-4 py-3 text-sm text-muted-foreground">{asset.organization.name}</td>
										<td class="px-4 py-3 text-right">
											<Button size="sm" variant="outline" disabled={working} onclick={() => handleRemove(asset.id)}>Remove</Button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</Card.Root>
			{/if}
		</div>
	{/if}
{/if}
