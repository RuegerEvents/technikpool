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
	<title>Delivery Note - {(await getProduction(productionId))?.name}</title>
</svelte:head>

{#if true}
	{@const production = await getProduction(productionId)}

	<div class="max-w-4xl mx-auto p-8 bg-white text-black min-h-screen font-serif">
		<div class="no-print mb-8">
			<button class="px-4 py-2 bg-zinc-900 text-white rounded font-sans" onclick={() => window.print()}>Print</button>
			<a href="/productions/{productionId}" class="ml-4 text-zinc-600 underline font-sans">Back</a>
		</div>

		<div class="flex justify-between items-start mb-16">
			<div>
				<h1 class="text-3xl font-bold uppercase tracking-widest text-zinc-800">Delivery Note</h1>
				<p class="mt-2 text-zinc-600">No. DN-{production?.id.slice(0, 8).toUpperCase()}</p>
			</div>
			<div class="text-right">
				<h2 class="text-xl font-bold">{production?.organization.name}</h2>
				<p class="text-zinc-600">Equipment Management</p>
			</div>
		</div>

		<div class="grid grid-cols-2 gap-12 mb-12">
			<div>
				<h3 class="font-bold border-b border-black mb-2 uppercase text-sm tracking-wider">Delivery To</h3>
				<p class="font-medium text-lg">{production?.name}</p>
				<p class="text-zinc-700 mt-1">
					Production Period:<br/>
					{#if production?.startDate}{new Date(production.startDate).toLocaleDateString()}{/if} –
					{#if production?.endDate}{new Date(production.endDate).toLocaleDateString()}{/if}
				</p>
			</div>
			<div>
				<h3 class="font-bold border-b border-black mb-2 uppercase text-sm tracking-wider">Date</h3>
				<p>{new Date().toLocaleDateString()}</p>
			</div>
		</div>

		<table class="w-full text-left border-collapse mt-8">
			<thead>
				<tr class="border-y-2 border-black">
					<th class="py-3 px-2">Qty</th>
					<th class="py-3">Description</th>
					<th class="py-3">Serial Number</th>
					<th class="py-3 text-right">Remarks</th>
				</tr>
			</thead>
			<tbody>
				{#each production?.items as item}
					<tr class="border-b border-zinc-200">
						<td class="py-4 px-2 font-bold text-center">1</td>
						<td class="py-4">
							<p class="font-medium">{item.asset.product.name}</p>
							<p class="text-sm text-zinc-600">{item.asset.product.manufacturer.name}</p>
						</td>
						<td class="py-4 font-mono text-sm">{item.asset.serialNumber || 'N/A'}</td>
						<td class="py-4 text-right"></td>
					</tr>
				{/each}
			</tbody>
		</table>

		<div class="mt-24 pt-8 border-t border-zinc-300 grid grid-cols-2 gap-16">
			<div class="text-center">
				<div class="border-b border-black h-16 mb-2"></div>
				<p class="uppercase text-xs tracking-wider font-bold">Delivered By</p>
				<p class="text-sm text-zinc-600 mt-1">Signature & Date</p>
			</div>
			<div class="text-center">
				<div class="border-b border-black h-16 mb-2"></div>
				<p class="uppercase text-xs tracking-wider font-bold">Received By</p>
				<p class="text-sm text-zinc-600 mt-1">Signature & Date</p>
			</div>
		</div>

		<div class="mt-16 text-center text-xs text-zinc-500 italic">
			Please verify all equipment is present and in good condition before signing.
		</div>
	</div>
{/if}
