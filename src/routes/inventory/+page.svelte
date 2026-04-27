<script lang="ts">
	import { DataView } from '$lib/components/ui/data-view';
	import type { Column } from '$lib/components/ui/data-view';
	import { getInventorySummary } from '$lib/remote/assets.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { page } from '$app/stores';

	let filterOrgId = $state($page.url.searchParams.get('org') || '');

	type Row = Awaited<ReturnType<typeof getInventorySummary>>[number];

	const columns: Column<Row>[] = [
		{ key: 'name', label: 'Product', sortable: true, accessor: (r: Row) => r.name },
		{
			key: 'manufacturer',
			label: 'Manufacturer',
			sortable: true,
			accessor: (r: Row) => r.manufacturer.name
		},
		{ key: 'total', label: 'Total', sortable: true, accessor: (r: Row) => r.total },
		{ key: 'available', label: 'Available', sortable: true, accessor: (r: Row) => r.available },
		{
			key: 'maintenance',
			label: 'Maintenance',
			sortable: true,
			accessor: (r: Row) => r.maintenance
		},
		{ key: 'broken', label: 'Broken', sortable: true, accessor: (r: Row) => r.broken }
	];
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Inventory</h1>
			<p class="text-muted-foreground">
				Product catalog — equipment models and their stock levels.
			</p>
		</div>
		<select
			bind:value={filterOrgId}
			class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
		>
			<option value="">All Organizations</option>
			{#each await getMyOrgs() as org (org.id)}
				<option value={org.id}>{org.name}</option>
			{/each}
		</select>
	</div>

	{#key filterOrgId}
		{@const rows = await getInventorySummary(filterOrgId || undefined)}
		<DataView
			{rows}
			{columns}
			storageKey="inventory_view"
			defaultView="table"
			searchFn={(r, q) =>
				r.name.toLowerCase().includes(q) || r.manufacturer.name.toLowerCase().includes(q)}
			searchPlaceholder="Search products…"
			addHref="/assets/new"
			addLabel="Add Asset"
			emptyTitle="No products in inventory"
			emptyDescription="Add assets to see your product catalog."
		>
			{#snippet card(row)}
				<div
					class="space-y-3 rounded-lg border bg-card p-4 transition-colors group-hover:bg-muted/50"
				>
					<div>
						<p class="font-semibold">{row.name}</p>
						<p class="text-sm text-muted-foreground">{row.manufacturer.name}</p>
					</div>
					<div class="grid grid-cols-2 gap-2 text-sm">
						<div class="rounded bg-green-100 px-2 py-1 text-center dark:bg-green-900/30">
							<div class="text-lg font-bold text-green-700 dark:text-green-400">
								{row.available}
							</div>
							<div class="text-xs text-green-600 dark:text-green-500">Available</div>
						</div>
						<div class="rounded bg-muted px-2 py-1 text-center">
							<div class="text-lg font-bold">{row.total}</div>
							<div class="text-xs text-muted-foreground">Total</div>
						</div>
					</div>
				</div>
			{/snippet}

			{#snippet cell(row, key)}
				{#if key === 'name'}
					<span class="font-medium">{row.name}</span>
				{:else if key === 'manufacturer'}
					{row.manufacturer.name}
				{:else if key === 'total'}
					<span class="font-mono tabular-nums">{row.total}</span>
				{:else if key === 'available'}
					<span class="font-mono text-green-700 tabular-nums dark:text-green-400"
						>{row.available}</span
					>
				{:else if key === 'maintenance'}
					<span
						class="font-mono tabular-nums {row.maintenance > 0
							? 'text-yellow-600 dark:text-yellow-400'
							: 'text-muted-foreground'}">{row.maintenance}</span
					>
				{:else if key === 'broken'}
					<span
						class="font-mono tabular-nums {row.broken > 0
							? 'text-red-600 dark:text-red-400'
							: 'text-muted-foreground'}">{row.broken}</span
					>
				{/if}
			{/snippet}
		</DataView>
	{/key}
</div>
