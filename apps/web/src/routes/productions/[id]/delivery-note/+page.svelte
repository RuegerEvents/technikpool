<script lang="ts">
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
	<title>Delivery Note - {production.name}</title>
</svelte:head>

<div class="mx-auto min-h-screen max-w-4xl bg-white p-8 font-serif text-black">
	<div class="no-print mb-8">
		<button
			class="rounded bg-zinc-900 px-4 py-2 font-sans text-white"
			onclick={() => window.print()}>Print</button
		>
		<a href={resolve(`/productions/${productionId}`)} class="ml-4 font-sans text-zinc-600 underline"
			>Back</a
		>
	</div>

	<div class="mb-16 flex items-start justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-widest text-zinc-800 uppercase">Delivery Note</h1>
			<p class="mt-2 text-zinc-600">No. DN-{production.id.slice(0, 8).toUpperCase()}</p>
		</div>
		<div class="text-right">
			<h2 class="text-xl font-bold">{production.organization.name}</h2>
			<p class="text-zinc-600">Equipment Management</p>
		</div>
	</div>

	<div class="mb-12 grid grid-cols-2 gap-12">
		<div>
			<h3 class="mb-2 border-b border-black text-sm font-bold tracking-wider uppercase">
				Delivery To
			</h3>
			<p class="text-lg font-medium">{production.name}</p>
			{#if production.address}
				<p class="mt-1 text-zinc-700">
					{#if production.address.line1}{production.address.line1}<br />{/if}
					{#if production.address.line2}{production.address.line2}<br />{/if}
					{#if production.address.postalCode || production.address.city}
						{production.address.postalCode ?? ''} {production.address.city ?? ''}<br />
					{/if}
				</p>
			{/if}
			<p class="mt-1 text-zinc-700">
				Production Period:<br />
				{#if production.startDate}{new Date(production.startDate).toLocaleDateString()}{/if} –
				{#if production.endDate}{new Date(production.endDate).toLocaleDateString()}{/if}
			</p>
		</div>
		<div>
			<h3 class="mb-2 border-b border-black text-sm font-bold tracking-wider uppercase">Date</h3>
			<p>{new Date().toLocaleDateString()}</p>
		</div>
	</div>

	<table class="mt-8 w-full border-collapse text-left">
		<thead>
			<tr class="border-y-2 border-black">
				<th class="px-2 py-3">Qty</th>
				<th class="py-3">Description</th>
				<th class="py-3">Serial Number</th>
				<th class="py-3 text-right">Remarks</th>
			</tr>
		</thead>
		<tbody>
			{#each bundleGroups as group (group.bundleId)}
				<tr class="border-b border-zinc-200">
					<td class="px-2 py-4 text-center font-bold">1</td>
					<td class="py-4">
						<p class="font-medium">{group.bundleName}</p>
						<p class="text-sm text-zinc-600">
							Contains: {group.productCounts.map((p) => `${p.count}× ${p.name}`).join(', ')}
						</p>
					</td>
					<td class="py-4 font-mono text-sm">—</td>
					<td class="py-4 text-right"></td>
				</tr>
			{/each}
			{#each individualItems as item (item.id)}
				<tr class="border-b border-zinc-200">
					<td class="px-2 py-4 text-center font-bold">1</td>
					<td class="py-4">
						<p class="font-medium">{item.asset.product.name}</p>
						<p class="text-sm text-zinc-600">{item.asset.product.manufacturer.name}</p>
						{#if item.accessories.length > 0}
							<p class="pl-4 text-sm text-zinc-600">↳ {accessorySummary(item.accessories)}</p>
						{/if}
					</td>
					<td class="py-4 font-mono text-sm">{item.asset.serialNumber || 'N/A'}</td>
					<td class="py-4 text-right"></td>
				</tr>
			{/each}
		</tbody>
	</table>

	<div class="mt-24 grid grid-cols-2 gap-16 border-t border-zinc-300 pt-8">
		<div class="text-center">
			<div class="mb-2 h-16 border-b border-black"></div>
			<p class="text-xs font-bold tracking-wider uppercase">Delivered By</p>
			<p class="mt-1 text-sm text-zinc-600">Signature & Date</p>
		</div>
		<div class="text-center">
			<div class="mb-2 h-16 border-b border-black"></div>
			<p class="text-xs font-bold tracking-wider uppercase">Received By</p>
			<p class="mt-1 text-sm text-zinc-600">Signature & Date</p>
		</div>
	</div>

	<div class="mt-16 text-center text-xs text-zinc-500 italic">
		Please verify all equipment is present and in good condition before signing.
	</div>
</div>
