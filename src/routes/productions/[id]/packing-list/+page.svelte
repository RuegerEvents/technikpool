<script lang="ts">
	import { page } from '$app/stores';
	import { getProduction } from '$lib/remote/productions.remote';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';

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

	<div class="mx-auto min-h-screen max-w-4xl bg-white p-8 text-black">
		<div class="no-print mb-8">
			<button class="rounded bg-zinc-900 px-4 py-2 text-white" onclick={() => window.print()}
				>Print</button
			>
			<a href={resolve(`/productions/${productionId}`)} class="ml-4 text-zinc-600 underline">Back</a
			>
		</div>

		<header class="mb-12 border-b-2 border-black pb-4">
			<div class="flex items-end justify-between">
				<div>
					<h1 class="text-4xl font-bold tracking-wider uppercase">Packing List</h1>
					<h2 class="mt-2 text-2xl">{production?.name}</h2>
				</div>
				<div class="text-right">
					<p class="font-bold">{production?.organization.name}</p>
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
				{#each production?.items as item, i (item.id)}
					<tr class="border-b border-zinc-200 {i % 2 === 0 ? 'bg-zinc-50' : ''}">
						<td class="py-3 text-center"
							><div class="inline-block h-5 w-5 border-2 border-black"></div></td
						>
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
				<div class="w-64 border-b border-black"></div>
			</div>
			<div>
				<p class="mb-8">Checked By:</p>
				<div class="w-64 border-b border-black"></div>
			</div>
		</div>
	</div>
{/if}
