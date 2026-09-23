<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { getStocktake } from '$lib/remote/stocktakes.remote';
	import { categoryLabel } from '$lib/category';
	import { orgLabel } from '$lib/utils';
	import { stocktakeStateLabel, unexpectedReasonLabel } from '$lib/stocktake-labels.svelte';

	const stocktakeId = $derived(page.params.id as string);
	// Awaited like every print route: a page about to be printed should arrive complete.
	let stocktake = $derived(await getStocktake(stocktakeId));
	type Item = (typeof stocktake.items)[number];

	onMount(() => {
		const timer = window.setTimeout(() => window.print(), 500);
		return () => window.clearTimeout(timer);
	});

	function sorted(items: Item[]) {
		return [...items].sort(
			(a, b) =>
				(a.expectedLocation?.name ?? '').localeCompare(b.expectedLocation?.name ?? '') ||
				a.asset.product.category.sortOrder - b.asset.product.category.sortOrder ||
				a.asset.product.name.localeCompare(b.asset.product.name) ||
				(a.asset.assetTag ?? '').localeCompare(b.asset.assetTag ?? '')
		);
	}

	let missing = $derived(
		sorted(stocktake.items.filter((i) => i.state === 'missing' || i.state === 'open'))
	);
	let unexpected = $derived(sorted(stocktake.items.filter((i) => i.state === 'unexpected')));
	let out = $derived(sorted(stocktake.items.filter((i) => i.state === 'out')));
	let attention = $derived(sorted(stocktake.items.filter((i) => i.needsAttention)));
	let found = $derived(sorted(stocktake.items.filter((i) => i.state === 'found')));
	let counters = $derived([
		...new Set(
			[
				...stocktake.items.map((i) => i.foundBy?.name || i.foundBy?.email),
				...stocktake.counts.map((c) => c.user.name || c.user.email)
			].filter(Boolean)
		)
	]);

	function name(i: Item) {
		const p = i.asset.product;
		return p.manufacturer ? `${p.manufacturer.name} ${p.name}` : p.name;
	}

	function formatDateTime(d: Date) {
		return new Date(d).toLocaleString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head><title>{stocktake.name}</title></svelte:head>

<div class="mx-auto max-w-4xl space-y-6 bg-white p-8 text-sm text-black print:p-0">
	<header class="space-y-1 border-b pb-4">
		<h1 class="text-2xl font-bold">{stocktake.name}</h1>
		<p>{stocktake.organization.name}</p>
		<p class="text-gray-600">
			Started {formatDateTime(stocktake.createdAt)} by {stocktake.createdBy.name ||
				stocktake.createdBy.email}
			{#if stocktake.closedAt}
				· Closed {formatDateTime(stocktake.closedAt)} by {stocktake.closedBy?.name ||
					stocktake.closedBy?.email}
			{:else}
				· Still open
			{/if}
		</p>
		<p class="text-gray-600">
			{stocktake.scope.locationIds.length === 0
				? 'All locations'
				: stocktake.countingLocations.map((l) => l.name).join(', ')}
			·
			{stocktake.scopeNames.categories.length === 0
				? 'All categories'
				: stocktake.scopeNames.categories.map((c) => categoryLabel(c)).join(', ')}
			{#if stocktake.scopeNames.products.length > 0}
				· {stocktake.scopeNames.products.map((p) => p.name).join(', ')}
			{/if}
		</p>
		{#if counters.length > 0}
			<p class="text-gray-600">Counted by {counters.join(', ')}</p>
		{/if}
	</header>

	<section class="grid grid-cols-4 gap-4 text-center">
		<div class="rounded border p-2">
			<p class="text-xl font-bold">{stocktake.progress.found} / {stocktake.progress.expected}</p>
			<p class="text-xs text-gray-600">Found</p>
		</div>
		<div class="rounded border p-2">
			<p class="text-xl font-bold">{stocktake.progress.expected - stocktake.progress.found}</p>
			<p class="text-xs text-gray-600">
				{stocktake.status === 'CLOSED' ? 'Missing' : 'Not counted yet'}
			</p>
		</div>
		<div class="rounded border p-2">
			<p class="text-xl font-bold">{stocktake.progress.out}</p>
			<p class="text-xs text-gray-600">Out on productions</p>
		</div>
		<div class="rounded border p-2">
			<p class="text-xl font-bold">{stocktake.progress.unexpected}</p>
			<p class="text-xs text-gray-600">Unexpected</p>
		</div>
	</section>

	{@render table(
		stocktake.status === 'CLOSED' ? stocktakeStateLabel('missing') : stocktakeStateLabel('open'),
		missing,
		(i) => i.expectedLocation?.name ?? ''
	)}
	{@render table(stocktakeStateLabel('unexpected'), unexpected, (i) =>
		[
			unexpectedReasonLabel(i.unexpectedReason),
			i.foundLocation?.name,
			i.asset.organizationId !== stocktake.organizationId ? orgLabel(i.asset.organization) : null
		]
			.filter(Boolean)
			.join(' · ')
	)}
	{@render table('Needs attention', attention, (i) => i.note ?? '')}
	{@render table(stocktakeStateLabel('out'), out, (i) => i.outProductionName ?? '')}

	{#if stocktake.products.length > 0}
		<section class="break-inside-avoid-page space-y-2">
			<h2 class="text-lg font-semibold">Untagged units</h2>
			<table class="w-full border-collapse">
				<tbody>
					{#each stocktake.products as p (p.product.id)}
						<tr class="border-b border-gray-300">
							<td class="py-1 pr-2">
								{p.product.manufacturer
									? `${p.product.manufacturer.name} ${p.product.name}`
									: p.product.name}
							</td>
							<td class="py-1 pr-2 text-gray-600">
								{p.locations.map((l) => `${l.location.name} ${l.counted}/${l.expected}`).join(', ')}
							</td>
							<td class="py-1 text-right font-medium {p.counted < p.expected ? 'text-red-700' : ''}"
								>{p.counted} / {p.expected}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}

	{@render table(stocktakeStateLabel('found'), found, (i) =>
		[i.foundLocation?.name, i.foundBy?.name || i.foundBy?.email].filter(Boolean).join(' · ')
	)}

	<section class="grid grid-cols-2 gap-12 pt-12">
		<div class="border-t border-black pt-1 text-xs">Date, signature</div>
		<div class="border-t border-black pt-1 text-xs">Date, signature</div>
	</section>

	<!-- Last on purpose: a snippet ends wuchale's extraction for plain text after it. -->
	{#snippet table(title: string, items: Item[], detail: (i: Item) => string)}
		{#if items.length > 0}
			<section class="break-inside-avoid-page space-y-2">
				<h2 class="text-lg font-semibold">{title} ({items.length})</h2>
				<table class="w-full border-collapse">
					<tbody>
						{#each items as i (i.assetId)}
							<tr class="border-b border-gray-300">
								<td class="py-1 pr-2 font-mono text-xs"
									>{i.asset.assetTag ?? i.asset.serialNumber ?? '—'}</td
								>
								<td class="py-1 pr-2">{name(i)}</td>
								<td class="py-1 pr-2 text-gray-600">{categoryLabel(i.asset.product.category)}</td>
								<td class="py-1 text-gray-600">{detail(i)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{/if}
	{/snippet}
</div>
