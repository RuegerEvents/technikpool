<script lang="ts">
	/* eslint-disable svelte/prefer-svelte-reactivity */
	import * as Card from '$lib/components/ui/card';
	import { DataView } from '$lib/components/ui/data-view';
	import type { Column } from '$lib/components/ui/data-view';
	import { OrgMultiSelect } from '$lib/components/ui/org-multi-select';
	import { CalendarFeedButton } from '$lib/components/ui/calendar-feed';
	import { getProductions } from '$lib/remote/productions.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { canWrite } from '$lib/roles';
	import { page } from '$app/state';
	import { plural, orgLabel } from '$lib/utils';
	import { browser } from '$app/environment';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import { Hourglass } from '@lucide/svelte';

	const ORG_FILTER_STORAGE_KEY = 'productions.selectedOrgIds';
	const urlOrgId = page.url.searchParams.get('org');

	function readStoredOrgIds(): string[] | null {
		if (!browser) return null;
		try {
			const raw = localStorage.getItem(ORG_FILTER_STORAGE_KEY);
			return raw ? JSON.parse(raw) : null;
		} catch {
			return null;
		}
	}

	let storedOrgIds = $state<string[] | null>(urlOrgId ? [urlOrgId] : readStoredOrgIds());

	function setSelectedOrgIds(next: string[]) {
		storedOrgIds = next;
		if (browser) localStorage.setItem(ORG_FILTER_STORAGE_KEY, JSON.stringify(next));
	}

	type Production = Awaited<ReturnType<typeof getProductions>>[number];

	// One query for every org the user belongs to; the org filter is applied
	// client-side so toggling it never refetches.
	let orgsQuery = $derived(getMyOrgs());
	let orgs = $derived(orgsQuery.current ?? []);
	let productionsQuery = $derived(getProductions());
	let allProductions = $derived(productionsQuery.current ?? []);

	let selectedOrgIds = $derived(
		storedOrgIds
			? storedOrgIds.filter((id) => orgs.some((o) => o.id === id))
			: orgs.map((o) => o.id)
	);

	// A production another org runs is here because one of ours lends to it, and
	// it is filed under that org as well as its owner's.
	let productions = $derived(
		allProductions.filter(
			(p) =>
				selectedOrgIds.includes(p.organizationId) ||
				p.lentBy.some((id) => selectedOrgIds.includes(id))
		)
	);

	function isLentTo(p: Production): boolean {
		return p.lentBy.length > 0 && !orgs.some((o) => o.id === p.organizationId);
	}

	const columns: Column<Production>[] = [
		{ key: 'name', label: 'Name', sortable: true, accessor: (r: Production) => r.name },
		{
			key: 'org',
			label: 'Organization',
			sortable: true,
			accessor: (r: Production) => orgLabel(r.organization)
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

	let visibleProductions = $derived(
		showArchive ? productions : productions.filter((p) => !isArchived(p))
	);
	let archivedCount = $derived(productions.filter(isArchived).length);

	// Start and end come from a date input, so they are stored as midnight UTC of that day.
	// Measured against the clock, a production ending today was over at 00:00 — compare days.
	function dayKey(d: Date): string {
		return new Date(d).toISOString().slice(0, 10);
	}

	function todayKey(): string {
		const now = new Date();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		return `${now.getFullYear()}-${month}-${day}`;
	}

	function prodStatus(p: Production): 'cancelled' | 'past' | 'active' | 'upcoming' {
		if (p.cancelledAt) return 'cancelled';
		const today = todayKey();
		if (p.endDate && dayKey(p.endDate) < today) return 'past';
		if (p.startDate && dayKey(p.startDate) <= today) return 'active';
		return 'upcoming';
	}

	// Requests to other orgs nobody has answered yet — the flip side of the
	// dashboard's approvals queue, flagged so they are not forgotten.
	// Not on a production we only lend to: those are waiting on us, and the
	// dashboard's approvals queue is where they are answered.
	function pendingCount(p: Production): number {
		if (isLentTo(p)) return 0;
		return p.items?.filter((i) => i.status === 'PENDING').length ?? 0;
	}

	function prodRowClass(p: Production): string {
		const s = prodStatus(p);
		if (s === 'past' || s === 'cancelled') return 'opacity-40';
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
		<div class="flex flex-wrap items-center gap-4">
			<label class="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
				<input type="checkbox" bind:checked={showArchive} class="h-4 w-4 rounded border" />
				Show archive
			</label>
			<OrgMultiSelect
				{orgs}
				value={selectedOrgIds}
				class="w-full sm:w-56"
				onchange={setSelectedOrgIds}
			/>
			<CalendarFeedButton />
		</div>
	</div>

	{#if !productionsQuery.ready}
		<ContentSkeleton shape="cards" count={6} error={productionsQuery.error} />
	{:else if selectedOrgIds.length > 0}
		<DataView
			rows={visibleProductions}
			{columns}
			storageKey="productions_view"
			defaultView="cards"
			href={(p) => `/productions/${p.id}`}
			searchFn={(p, q) => p.name.toLowerCase().includes(q)}
			searchPlaceholder="Search productions…"
			addHref={orgs.some(canWrite) ? '/productions/new' : undefined}
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
						<Card.Title class="flex flex-wrap items-center gap-2 text-lg">
							<span class={prod.cancelledAt ? 'line-through' : ''}>{prod.name}</span>
							{#if !prod.cancelledAt && pendingCount(prod) > 0}
								{@render awaitingBadge(pendingCount(prod))}
							{/if}
							{#if prod.cancelledAt}
								<span
									class="rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive"
									>Cancelled</span
								>
							{/if}
							{#if isLentTo(prod)}
								{@render lentBadge()}
							{/if}
						</Card.Title>
						<Card.Description>
							<span class="block">{orgLabel(prod.organization)}</span>
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
					<span class="font-medium {prod.cancelledAt ? 'line-through' : ''}">{prod.name}</span>
					{#if !prod.cancelledAt && pendingCount(prod) > 0}
						<span class="ml-2">{@render awaitingBadge(pendingCount(prod))}</span>
					{/if}
					{#if prod.cancelledAt}
						<span
							class="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive"
							>Cancelled</span
						>
					{/if}
					{#if isLentTo(prod)}
						<span class="ml-2">{@render lentBadge()}</span>
					{/if}
				{:else if key === 'org'}
					{orgLabel(prod.organization)}
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
				{plural(archivedCount, [
					'# production older than 1 month hidden',
					'# productions older than 1 month hidden'
				])}
			</p>
		{/if}
	{/if}
</div>

{#snippet awaitingBadge(count: number)}
	<span
		class="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 align-middle text-xs font-medium text-amber-700 dark:text-amber-400"
		title={plural(count, [
			'# asset is waiting for approval by another organization',
			'# assets are waiting for approval by another organization'
		])}
	>
		<Hourglass aria-hidden="true" class="size-3" />
		{count}
	</span>
{/snippet}

{#snippet lentBadge()}
	<span
		class="rounded bg-muted px-1.5 py-0.5 align-middle text-xs font-medium text-muted-foreground"
		title="Another organization's production that yours lends equipment to">On loan</span
	>
{/snippet}
