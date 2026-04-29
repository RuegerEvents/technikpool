<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { DataView } from '$lib/components/ui/data-view';
	import type { Column } from '$lib/components/ui/data-view';
	import { getProductions } from '$lib/remote/productions.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { page } from '$app/stores';

	let filterOrgId = $state($page.url.searchParams.get('org') || '');

	type Production = Awaited<ReturnType<typeof getProductions>>[number];

	const columns: Column<Production>[] = [
		{ key: 'name', label: 'Name', sortable: true, accessor: (r: Production) => r.name },
		{
			key: 'startDate',
			label: 'Start Date',
			sortable: true,
			accessor: (r: Production) => r.startDate?.toISOString() ?? ''
		},
		{
			key: 'endDate',
			label: 'End Date',
			sortable: true,
			accessor: (r: Production) => r.endDate?.toISOString() ?? ''
		},
		{
			key: 'items',
			label: 'Items Booked',
			sortable: true,
			accessor: (r: Production) => r.items?.length ?? 0
		}
	];

	function formatDate(d: Date | null | undefined): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString();
	}
</script>

<svelte:head><title>Productions | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Productions</h1>
			<p class="text-muted-foreground">Manage events and equipment bookings.</p>
		</div>
		{#if true}
			{@const orgs = await getMyOrgs()}
			{#if !filterOrgId && orgs[0]}
				{((filterOrgId = orgs[0].id), '')}
			{/if}
			<select
				bind:value={filterOrgId}
				class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
			>
				{#each orgs as org (org.id)}
					<option value={org.id}>{org.name}</option>
				{/each}
			</select>
		{/if}
	</div>

	{#key filterOrgId}
		{#if filterOrgId}
			{@const productions = await getProductions(filterOrgId)}
			<DataView
				rows={productions}
				{columns}
				storageKey="productions_view"
				defaultView="cards"
				href={(p) => `/productions/${p.id}`}
				searchFn={(p, q) => p.name.toLowerCase().includes(q)}
				searchPlaceholder="Search productions…"
				addHref="/productions/new"
				addLabel="New Production"
				emptyTitle="No productions found"
				emptyDescription="Create a new production to start checking out equipment."
			>
				{#snippet card(prod)}
					<Card.Root class="h-full transition-colors group-hover:bg-muted/50">
						<Card.Header>
							<Card.Title class="text-lg">{prod.name}</Card.Title>
							<Card.Description>
								{formatDate(prod.startDate)}{prod.endDate ? ` – ${formatDate(prod.endDate)}` : ''}
							</Card.Description>
						</Card.Header>
						<Card.Content>
							<div class="flex items-center justify-between text-sm">
								<span class="text-muted-foreground">Items Booked</span>
								<span class="font-medium">{prod.items?.length ?? 0}</span>
							</div>
						</Card.Content>
					</Card.Root>
				{/snippet}

				{#snippet cell(prod, key)}
					{#if key === 'name'}
						<span class="font-medium">{prod.name}</span>
					{:else if key === 'startDate'}
						{formatDate(prod.startDate)}
					{:else if key === 'endDate'}
						{formatDate(prod.endDate)}
					{:else if key === 'items'}
						{prod.items?.length ?? 0}
					{/if}
				{/snippet}
			</DataView>
		{/if}
	{/key}
</div>
