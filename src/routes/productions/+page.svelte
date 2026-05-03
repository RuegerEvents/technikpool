<script lang="ts">
	/* eslint-disable svelte/prefer-svelte-reactivity */
	import * as Card from '$lib/components/ui/card';
	import { DataView } from '$lib/components/ui/data-view';
	import type { Column } from '$lib/components/ui/data-view';
	import { getProductions } from '$lib/remote/productions.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { page } from '$app/state';

	let filterOrgId = $state(page.url.searchParams.get('org') || '');

	type Production = Awaited<ReturnType<typeof getProductions>>[number];

	const columns: Column<Production>[] = [
		{ key: 'name', label: 'Name', sortable: true, accessor: (r: Production) => r.name },
		{
			key: 'org',
			label: 'Organization',
			sortable: true,
			accessor: (r: Production) => r.organization.name
		},
		{
			key: 'kw',
			label: 'KW',
			sortable: true,
			accessor: (r: Production) => (r.startDate ? getISOWeek(r.startDate) : 0)
		},
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

	function getISOWeek(d: Date): number {
		const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
		date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
		const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
		return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
	}

	function formatDate(d: Date | null | undefined): string {
		if (!d) return '—';
		const date = new Date(d);
		const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
		return `${weekday} ${date.toLocaleDateString()}`;
	}

	let showArchive = $state(false);

	function isArchived(p: Production): boolean {
		const cutoff = new Date();
		cutoff.setMonth(cutoff.getMonth() - 1);
		const ref = p.endDate ?? p.startDate;
		return !!ref && new Date(ref) < cutoff;
	}

	function prodStatus(p: Production): 'past' | 'active' | 'upcoming' {
		const now = new Date();
		if (p.endDate && new Date(p.endDate) < now) return 'past';
		if (p.startDate && new Date(p.startDate) <= now && (!p.endDate || new Date(p.endDate) >= now))
			return 'active';
		return 'upcoming';
	}

	function prodRowClass(p: Production): string {
		const s = prodStatus(p);
		if (s === 'past') return 'opacity-40';
		if (s === 'active') return 'bg-primary/5';
		return '';
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
			<div class="flex items-center gap-4">
				<label class="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
					<input type="checkbox" bind:checked={showArchive} class="h-4 w-4 rounded border" />
					Show archive
				</label>
				<select
					bind:value={filterOrgId}
					class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
				>
					{#each orgs as org (org.id)}
						<option value={org.id}>{org.name}</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>

	{#key filterOrgId}
		{#if filterOrgId}
			{@const productions = await getProductions(filterOrgId)}
			{@const visibleProductions = showArchive
				? productions
				: productions.filter((p) => !isArchived(p))}
			{@const archivedCount = productions.filter(isArchived).length}
			<DataView
				rows={visibleProductions}
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
				rowClass={prodRowClass}
			>
				{#snippet card(prod)}
					<Card.Root
						class="h-full transition-colors group-hover:bg-muted/50 {prodStatus(prod) === 'active'
							? 'ring-1 ring-primary/50'
							: ''}"
					>
						<Card.Header>
							<Card.Title class="text-lg">{prod.name}</Card.Title>
							<Card.Description>
								<span class="block">{prod.organization.name}</span>
								{#if prod.startDate}
									<span class="block"
										>KW {getISOWeek(prod.startDate)} · {formatDate(prod.startDate)}{prod.endDate
											? ` – ${formatDate(prod.endDate)}`
											: ''}</span
									>
								{/if}
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
					{:else if key === 'org'}
						{prod.organization.name}
					{:else if key === 'kw'}
						{prod.startDate ? getISOWeek(prod.startDate) : '—'}
					{:else if key === 'startDate'}
						{formatDate(prod.startDate)}
					{:else if key === 'endDate'}
						{formatDate(prod.endDate)}
					{:else if key === 'items'}
						{prod.items?.length ?? 0}
					{/if}
				{/snippet}
			</DataView>
			{#if !showArchive && archivedCount > 0}
				<p class="text-center text-xs text-muted-foreground">
					{archivedCount}
					{archivedCount === 1 ? 'production' : 'productions'} older than 1 month hidden
				</p>
			{/if}
		{/if}
	{/key}
</div>
