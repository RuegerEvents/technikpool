<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { DataView } from '$lib/components/ui/data-view';
	import type { Column } from '$lib/components/ui/data-view';
	import { getAssets } from '$lib/remote/assets.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { page } from '$app/stores';

	let filterOrgId = $state($page.url.searchParams.get('org') || '');

	type Asset = Awaited<ReturnType<typeof getAssets>>[number];

	const columns: Column<Asset>[] = [
		{ key: 'product', label: 'Product', sortable: true, accessor: (r: Asset) => r.product.name },
		{ key: 'manufacturer', label: 'Manufacturer', sortable: true, accessor: (r: Asset) => r.product.manufacturer.name },
		{ key: 'serialNumber', label: 'Serial Number', accessor: (r: Asset) => r.serialNumber },
		{ key: 'assetTag', label: 'Asset Tag', accessor: (r: Asset) => r.assetTag },
		{ key: 'bundle', label: 'Bundle', accessor: (r: Asset) => r.bundle?.name },
		{ key: 'status', label: 'Status', sortable: true, accessor: (r: Asset) => r.status },
		{ key: 'organization', label: 'Organization', sortable: true, accessor: (r: Asset) => r.organization.name }
	];

	const statusClass: Record<string, string> = {
		AVAILABLE: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
		MAINTENANCE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
		BROKEN: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
	};
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Assets</h1>
			<p class="text-muted-foreground">All individual equipment units across your organizations.</p>
		</div>
		<select
			bind:value={filterOrgId}
			class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
		>
			<option value="">All Organizations</option>
			{#each await getMyOrgs() as org}
				<option value={org.id}>{org.name}</option>
			{/each}
		</select>
	</div>

	{#key filterOrgId}
		{@const assets = await getAssets(filterOrgId || undefined)}
		<DataView
			rows={assets}
			{columns}
			storageKey="assets_view"
			defaultView="table"
			href={(a) => `/inventory/${a.id}`}
			searchFn={(a, q) =>
				a.product.name.toLowerCase().includes(q) ||
				a.product.manufacturer.name.toLowerCase().includes(q) ||
				(a.serialNumber?.toLowerCase().includes(q) ?? false) ||
				(a.assetTag?.toLowerCase().includes(q) ?? false) ||
				(a.bundle?.name.toLowerCase().includes(q) ?? false) ||
				a.organization.name.toLowerCase().includes(q)}
			searchPlaceholder="Search by product, S/N, bundle…"
			addHref="/assets/new"
			addLabel="Add Asset"
			emptyTitle="No assets found"
			emptyDescription="No equipment units in the selected organization."
		>
			{#snippet card(asset)}
				<Card.Root class="h-full transition-colors group-hover:bg-muted/50">
					<Card.Header>
						<Card.Title class="text-lg">{asset.product.name}</Card.Title>
						<Card.Description>{asset.product.manufacturer.name}</Card.Description>
					</Card.Header>
					<Card.Content>
						<div class="space-y-1 text-sm">
							<div class="flex items-center justify-between">
								<span class="text-muted-foreground">Status</span>
								<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {statusClass[asset.status] ?? statusClass.MAINTENANCE}">
									{asset.status}
								</span>
							</div>
							{#if asset.serialNumber}
								<div class="flex items-center justify-between">
									<span class="text-muted-foreground">S/N</span>
									<span class="font-mono text-xs">{asset.serialNumber}</span>
								</div>
							{/if}
							{#if asset.assetTag}
								<div class="flex items-center justify-between">
									<span class="text-muted-foreground">Tag</span>
									<span class="font-mono text-xs">{asset.assetTag}</span>
								</div>
							{/if}
							{#if asset.bundle}
								<div class="flex items-center justify-between">
									<span class="text-muted-foreground">Bundle</span>
									<span class="text-xs">{asset.bundle.name}</span>
								</div>
							{/if}
							<div class="pt-1 text-xs text-muted-foreground">{asset.organization.name}</div>
						</div>
					</Card.Content>
				</Card.Root>
			{/snippet}

			{#snippet cell(asset, key)}
				{#if key === 'product'}
					<span class="font-medium">{asset.product.name}</span>
				{:else if key === 'manufacturer'}
					{asset.product.manufacturer.name}
				{:else if key === 'status'}
					<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {statusClass[asset.status] ?? statusClass.MAINTENANCE}">
						{asset.status}
					</span>
				{:else if key === 'organization'}
					{asset.organization.name}
				{:else if key === 'serialNumber'}
					<span class="font-mono text-xs">{asset.serialNumber ?? '—'}</span>
				{:else if key === 'assetTag'}
					<span class="font-mono text-xs">{asset.assetTag ?? '—'}</span>
				{:else if key === 'bundle'}
					{#if asset.bundle}
						<a href="/assets/bundles/{asset.bundle.id}" class="text-xs hover:underline">{asset.bundle.name}</a>
					{:else}
						<span class="text-muted-foreground">—</span>
					{/if}
				{/if}
			{/snippet}
		</DataView>
	{/key}
</div>
