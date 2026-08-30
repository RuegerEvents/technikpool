<script lang="ts">
	import { orgLabel } from '$lib/utils';
	import { page } from '$app/state';
	import { getProduction } from '$lib/remote/productions.remote';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { SvelteMap } from 'svelte/reactivity';
	import { accessorySummary, nestAccessories } from '$lib/production-items';

	const productionId = $derived(page.params.id as string);
	let production = $derived(await getProduction(productionId));

	onMount(() => {
		const timer = window.setTimeout(() => window.print(), 500);
		return () => window.clearTimeout(timer);
	});

	type BundleGroup = {
		bundleId: string;
		bundleName: string;
		orgName: string;
		productCounts: Array<{ name: string; mfr: string; count: number }>;
	};

	let bundleGroups = $derived.by((): BundleGroup[] => {
		const map = new SvelteMap<string, BundleGroup>();
		for (const item of production.items) {
			if (!item.sourceBundle) continue;
			const bid = item.sourceBundle.id;
			if (!map.has(bid)) {
				map.set(bid, {
					bundleId: bid,
					bundleName: item.sourceBundle.template.name,
					orgName: orgLabel(item.asset.organization),
					productCounts: []
				});
			}
			const g = map.get(bid)!;
			const pc = g.productCounts.find((p) => p.name === item.asset.product.name);
			if (pc) {
				pc.count++;
			} else {
				g.productCounts.push({
					name: item.asset.product.name,
					mfr: item.asset.product.manufacturer.name,
					count: 1
				});
			}
		}
		return [...map.values()];
	});

	// Accessories nest under the unit they travel with. Inside a bundle group the
	// "Contains:" counts already include them — they mirror the parent's
	// bundleId — so only the individual lines need the treatment.
	let individualItems = $derived(nestAccessories(production.items.filter((i) => !i.sourceBundle)));
</script>

<svelte:head>
	<title>Packing List - {production.name}</title>
</svelte:head>

<div class="mx-auto min-h-screen max-w-4xl bg-white p-8 text-black">
	<div class="no-print mb-8">
		<button class="rounded bg-zinc-900 px-4 py-2 text-white" onclick={() => window.print()}
			>Print</button
		>
		<a href={resolve(`/productions/${productionId}`)} class="ml-4 text-zinc-600 underline">Back</a>
	</div>

	<header class="mb-12 border-b-2 border-black pb-4">
		<div class="flex items-end justify-between">
			<div>
				<h1 class="text-4xl font-bold tracking-wider uppercase">Packing List</h1>
				<h2 class="mt-2 text-2xl">{production.name}</h2>
				{#if production.address}
					<p class="mt-2 text-sm text-zinc-700">
						{#if production.address.line1}{production.address.line1}{/if}
						{#if production.address.line2}
							· {production.address.line2}
						{/if}
						{#if production.address.postalCode || production.address.city}
							· {production.address.postalCode ?? ''} {production.address.city ?? ''}
						{/if}
					</p>
				{/if}
			</div>
			<div class="text-right">
				<p class="font-bold">{production.organization.name}</p>
				<p>Date: {new Date().toLocaleDateString()}</p>
			</div>
		</div>
	</header>

	<table class="w-full border-collapse text-left">
		<thead>
			<tr class="border-b border-black">
				<th class="w-16 py-2 text-center">Check</th>
				<th class="py-2">Item Description</th>
				<th class="py-2">Manufacturer</th>
				<th class="py-2">S/N</th>
				<th class="py-2 text-right">Source Org</th>
			</tr>
		</thead>
		<tbody>
			{#each bundleGroups as group (group.bundleId)}
				<tr class="border-b border-zinc-300 bg-zinc-100">
					<td class="py-3 text-center">
						<div class="inline-block h-5 w-5 border-2 border-black"></div>
					</td>
					<td class="py-3" colspan="3">
						<p class="font-bold">{group.bundleName}</p>
						<p class="text-sm text-zinc-600">
							Contains: {group.productCounts.map((p) => `${p.count}× ${p.name}`).join(', ')}
						</p>
					</td>
					<td class="py-3 text-right">{group.orgName}</td>
				</tr>
			{/each}
			{#each individualItems as item, i (item.id)}
				<tr class="border-b border-zinc-200 {i % 2 === 0 ? 'bg-zinc-50' : ''}">
					<td class="py-3 text-center">
						<div class="inline-block h-5 w-5 border-2 border-black"></div>
					</td>
					<td class="py-3 font-medium">
						{item.asset.product.name}
						{#if item.accessories.length > 0}
							<!-- Tags rather than counts: someone is ticking physical
							     objects off against this sheet. -->
							<p class="pl-4 text-sm font-normal text-zinc-600">
								↳ {accessorySummary(item.accessories, { tags: true })}
							</p>
						{/if}
					</td>
					<td class="py-3">{item.asset.product.manufacturer.name}</td>
					<td class="py-3 font-mono text-sm">{item.asset.serialNumber || 'N/A'}</td>
					<td class="py-3 text-right">{orgLabel(item.asset.organization)}</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<div class="mt-16 grid grid-cols-2 gap-8">
		<div>
			<p class="mb-8">Prepared By:</p>
			<div class="w-64 border-b border-black"></div>
		</div>
		<div>
			<p class="mb-8">Checked By:</p>
			<div class="w-64 border-b border-black"></div>
		</div>
	</div>
</div>
