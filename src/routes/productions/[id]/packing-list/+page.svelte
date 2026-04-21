<script lang="ts">
	import { page } from '$app/stores';
	import { getProduction } from '$lib/remote/productions.remote';
	import { onMount } from 'svelte';

	const productionId = $page.params.id as string;

	onMount(() => {
		const timer = window.setTimeout(() => window.print(), 500);
		return () => window.clearTimeout(timer);
	});
</script>

<svelte:head>
	<title>Packing List - {(await getProduction(productionId))?.name}</title>
</svelte:head>

{#if true}
	{@const production = await getProduction(productionId)}

	<div class="max-w-4xl mx-auto p-8 bg-white text-black min-h-screen">
		<div class="no-print mb-8">
			<button class="px-4 py-2 bg-zinc-900 text-white rounded" onclick={() => window.print()}>Print</button>
			<a href="/productions/{productionId}" class="ml-4 text-zinc-600 underline">Back</a>
		</div>

		<header class="mb-12 border-b-2 border-black pb-4">
			<div class="flex justify-between items-end">
				<div>
					<h1 class="text-4xl font-bold uppercase tracking-wider">Packing List</h1>
					<h2 class="text-2xl mt-2">{production?.name}</h2>
				</div>
				<div class="text-right">
					<p class="font-bold">{production?.organization.name}</p>
					<p>Date: {new Date().toLocaleDateString()}</p>
				</div>
			</div>
		</header>

		<table class="w-full text-left border-collapse">
			<thead>
				<tr class="border-b border-black">
					<th class="py-2 w-16 text-center">Check</th>
					<th class="py-2">Item Description</th>
					<th class="py-2">Manufacturer</th>
					<th class="py-2">S/N</th>
					<th class="py-2 text-right">Source Org</th>
				</tr>
			</thead>
			<tbody>
				{#each production?.items as item, i}
					<tr class="border-b border-zinc-200 {i % 2 === 0 ? 'bg-zinc-50' : ''}">
						<td class="py-3 text-center"><div class="w-5 h-5 border-2 border-black inline-block"></div></td>
						<td class="py-3 font-medium">{item.asset.product.name}</td>
						<td class="py-3">{item.asset.product.manufacturer.name}</td>
						<td class="py-3 font-mono text-sm">{item.asset.serialNumber || 'N/A'}</td>
						<td class="py-3 text-right">{item.asset.organization.name}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<div class="mt-16 grid grid-cols-2 gap-8">
			<div>
				<p class="mb-8">Prepared By:</p>
				<div class="border-b border-black w-64"></div>
			</div>
			<div>
				<p class="mb-8">Checked By:</p>
				<div class="border-b border-black w-64"></div>
			</div>
		</div>
	</div>
{/if}
