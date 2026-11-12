<script lang="ts">
	import { orgLabel } from '#lib/utils.js';
	import { naturalCompare } from '#lib/sort.js';
	import { categoryLabel } from '#lib/category.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import {
		getOrgsWithoutInspectionInterval,
		getOverdueAssets
	} from '#lib/remote/inspections.remote.js';
	import { OrgBadge } from '#lib/components/ui/org-badge/index.js';
	import { OrgMultiSelect } from '#lib/components/ui/org-multi-select/index.js';
	import { ProductThumb } from '#lib/components/ui/product-thumb/index.js';
	import { ContentSkeleton } from '#lib/components/ui/skeleton/index.js';
	import { InspectionDialog } from '#lib/components/ui/inspection-dialog/index.js';
	import { formatInspectionDay, inspectionTypeLabel } from '#lib/inspection-ui.svelte.js';
	import { resolve } from '$app/paths';

	let overdueQuery = $derived(getOverdueAssets());
	let data = $derived(overdueQuery.current ?? { overdue: [], upcoming: [] });
	let missingIntervalQuery = $derived(getOrgsWithoutInspectionInterval());
	let missingInterval = $derived(missingIntervalQuery.current ?? []);

	type AssetRow = Awaited<ReturnType<typeof getOverdueAssets>>['overdue'][number];

	let target = $state<AssetRow | null>(null);
	let dialogOpen = $state(false);

	function openDialog(asset: AssetRow) {
		target = asset;
		dialogOpen = true;
	}

	// ── Filters ──────────────────────────────────────────────────────────────
	// All of it is narrowed here: the query already holds every unit due within
	// a year, so a filter is instant and a recorded inspection's refresh keeps
	// covering whatever is on screen.

	type Status = 'all' | 'never' | 'failed' | 'again';

	let search = $state('');
	let pickedOrgIds = $state<string[] | null>(null);
	let locationId = $state('');
	let categoryId = $state('');
	let typeId = $state('');
	let status = $state<Status>('all');
	let windowDays = $state(30);

	let allRows = $derived([...data.overdue, ...data.upcoming]);
	let types = $derived(
		[...new Map(allRows.map((a) => [a.type.id, a.type])).values()].sort(
			(a, b) => a.sortOrder - b.sortOrder
		)
	);

	// The orgs, shelves and categories that actually have something due, so no
	// option leads to an empty list.
	let orgs = $derived(
		[...new Map(allRows.map((a) => [a.organization.id, a.organization])).values()].sort((a, b) =>
			naturalCompare(orgLabel(a), orgLabel(b))
		)
	);
	// Every org until someone picks: a new org with units due shows up at once.
	let selectedOrgIds = $derived(pickedOrgIds ?? orgs.map((o) => o.id));
	let locations = $derived(
		[
			...new Map(
				allRows
					.filter((a) => selectedOrgIds.includes(a.organization.id))
					.map((a) => [a.location.id, { ...a.location, org: a.organization }])
			).values()
		].sort(
			(a, b) => naturalCompare(orgLabel(a.org), orgLabel(b.org)) || naturalCompare(a.name, b.name)
		)
	);
	let categories = $derived(
		[
			...new Map(
				allRows.flatMap((a) =>
					a.product.category ? [[a.product.category.id, a.product.category]] : []
				)
			).values()
		].sort((a, b) => a.sortOrder - b.sortOrder)
	);
	// A shelf of an org that was just deselected is no filter any more.
	let activeLocationId = $derived(locations.some((l) => l.id === locationId) ? locationId : '');

	let cutoff = $derived(new Date(Date.now() + windowDays * 86_400_000));

	function matches(asset: AssetRow) {
		if (!selectedOrgIds.includes(asset.organization.id)) return false;
		if (activeLocationId && asset.location.id !== activeLocationId) return false;
		if (categoryId && asset.product.category?.id !== categoryId) return false;
		if (typeId && asset.type.id !== typeId) return false;
		const last = asset.lastInspection;
		if (status === 'never' && last) return false;
		if (status === 'failed' && last?.result !== 'FAILED') return false;
		if (status === 'again' && (!last || last.result === 'FAILED')) return false;
		const q = search.trim().toLowerCase();
		if (!q) return true;
		return [
			asset.product.name,
			asset.product.manufacturer?.name,
			asset.assetTag,
			asset.serialNumber,
			`#${asset.orgIndex}`,
			asset.location.name
		].some((field) => field?.toLowerCase().includes(q));
	}

	let overdue = $derived(data.overdue.filter(matches));
	let upcoming = $derived(data.upcoming.filter((a) => a.nextDue <= cutoff).filter(matches));
	let filtered = $derived(
		search.trim() !== '' ||
			pickedOrgIds !== null ||
			activeLocationId !== '' ||
			categoryId !== '' ||
			typeId !== '' ||
			status !== 'all'
	);

	function resetFilters() {
		search = '';
		pickedOrgIds = null;
		locationId = '';
		categoryId = '';
		typeId = '';
		status = 'all';
	}

	const selectClass = 'h-10 rounded-md border border-input bg-background px-3 text-sm';
</script>

<svelte:head><title>Inspections | Technikpool</title></svelte:head>

<InspectionDialog
	bind:open={dialogOpen}
	assetIds={target ? [target.id] : []}
	typeId={target?.type.id}
	subject={target
		? `${target.product.name} · ${target.assetTag ?? target.serialNumber ?? `#${target.orgIndex}`}`
		: undefined}
/>

<div class="space-y-8">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Inspections</h1>
		<p class="text-muted-foreground">
			Overdue and upcoming inspections across your orgs, one row per device and inspection type. A
			device that was never inspected for a type, or whose last inspection of it failed, is due at
			once.
		</p>
	</div>

	{#each missingInterval as org (`${org.id}:${org.type.id}`)}
		<div class="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
			<p>
				<span class="font-medium">{orgLabel(org)}</span> has no interval for
				<span class="font-medium">{inspectionTypeLabel(org.type)}</span>. Its new units that need
				this inspection get none, so they are never due for it and never listed here.
			</p>
			{#if org.canEdit}
				<Button variant="link" class="h-auto p-0" href={resolve(`orgs/${org.id}`)}
					>Set the interval in the org settings</Button
				>
			{:else}
				<p class="text-muted-foreground">The org's owner can set one in its settings.</p>
			{/if}
		</div>
	{/each}

	<div class="flex flex-wrap items-center gap-3">
		<Input
			type="search"
			bind:value={search}
			placeholder="Search product, tag, serial number…"
			class="h-10 w-full sm:w-64"
		/>
		<OrgMultiSelect
			{orgs}
			value={selectedOrgIds}
			class="w-full sm:w-56"
			onchange={(next) => (pickedOrgIds = next)}
		/>
		<select bind:value={locationId} class={selectClass} aria-label="Location">
			<option value="">All locations</option>
			{#each locations as location (location.id)}
				<option value={location.id}
					>{orgs.length > 1 ? `${orgLabel(location.org)} · ` : ''}{location.name}</option
				>
			{/each}
		</select>
		<select bind:value={typeId} class={selectClass} aria-label="Inspection type">
			<option value="">All inspection types</option>
			{#each types as type (type.id)}
				<option value={type.id}>{inspectionTypeLabel(type)}</option>
			{/each}
		</select>
		<select bind:value={categoryId} class={selectClass} aria-label="Category">
			<option value="">All categories</option>
			{#each categories as category (category.id)}
				<option value={category.id}>{categoryLabel(category)}</option>
			{/each}
		</select>
		<select bind:value={status} class={selectClass} aria-label="Status">
			<option value="all">Any status</option>
			<option value="never">Never inspected</option>
			<option value="failed">Last inspection failed</option>
			<option value="again">Due again</option>
		</select>
		<select bind:value={windowDays} class={selectClass} aria-label="Due soon within">
			<option value={30}>Due soon: 30 days</option>
			<option value={90}>Due soon: 90 days</option>
			<option value={180}>Due soon: 6 months</option>
			<option value={365}>Due soon: 1 year</option>
		</select>
		{#if filtered}
			<Button variant="ghost" onclick={resetFilters}>Reset filters</Button>
		{/if}
	</div>

	{#if !overdueQuery.ready}
		<ContentSkeleton shape="table" count={5} error={overdueQuery.error} />
	{:else}
		<div>
			<h2 class="mb-3 text-xl font-semibold text-destructive">
				Overdue ({overdue.length})
			</h2>
			{#if overdue.length === 0}
				<Card.Root
					><Card.Content class="py-8 text-center text-muted-foreground"
						>{filtered ? 'Nothing overdue matches the filters.' : 'Nothing overdue.'}</Card.Content
					></Card.Root
				>
			{:else}
				{@render assetTable(overdue, true)}
			{/if}
		</div>

		<div>
			<h2 class="mb-3 text-xl font-semibold">
				Due soon ({upcoming.length})
			</h2>
			{#if upcoming.length === 0}
				<Card.Root
					><Card.Content class="py-8 text-center text-muted-foreground"
						>{filtered
							? 'Nothing due in this period matches the filters.'
							: 'Nothing due in this period.'}</Card.Content
					></Card.Root
				>
			{:else}
				{@render assetTable(upcoming, false)}
			{/if}
		</div>
	{/if}
</div>

{#snippet assetTable(rows: AssetRow[], isOverdue: boolean)}
	<div class="overflow-x-auto rounded-md border">
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b bg-muted/30">
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Asset</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Org</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Last inspection</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Due</th>
					<th class="w-32 px-4 py-3"></th>
				</tr>
			</thead>
			<tbody>
				{#each rows as asset (asset.key)}
					<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
						<td class="px-4 py-3">
							<div class="flex items-center gap-2">
								<ProductThumb path={asset.product.imagePath} alt={asset.product.name} />
								<div>
									<a
										href={resolve(`assets/${asset.id}`)}
										class="font-medium underline-offset-2 hover:underline">{asset.product.name}</a
									>
									<p class="text-xs text-muted-foreground">
										{asset.assetTag ?? asset.serialNumber ?? '—'}
									</p>
								</div>
							</div>
						</td>
						<td class="px-4 py-3 whitespace-nowrap">{inspectionTypeLabel(asset.type)}</td>
						<td class="px-4 py-3">
							<OrgBadge
								name={orgLabel(asset.organization)}
								color={asset.organization.color}
								avatarLabel={asset.organization.avatarLabel}
							/>
						</td>
						<td class="px-4 py-3 text-muted-foreground">{asset.location.name}</td>
						<td class="px-4 py-3">
							{#if asset.lastInspection}
								{formatInspectionDay(asset.lastInspection.performedAt)}
								{#if asset.lastInspection.result === 'FAILED'}
									<span class="ml-1 text-xs font-medium text-destructive">Failed</span>
								{/if}
							{:else}
								<span class="text-muted-foreground">Never inspected</span>
							{/if}
						</td>
						<td class="px-4 py-3 {isOverdue ? 'font-medium text-destructive' : ''}"
							>{formatInspectionDay(asset.nextDue)}</td
						>
						<td class="px-4 py-3 text-right">
							<Button size="sm" variant="outline" onclick={() => openDialog(asset)}
								>Record inspection</Button
							>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/snippet}
