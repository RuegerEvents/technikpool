<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { getBundle } from '$lib/remote/assets.remote';
	import { onMount } from 'svelte';

	const bundleId = $derived(page.params.id as string);
	let bundle = $derived(await getBundle(bundleId));

	onMount(() => {
		const timer = window.setTimeout(() => window.print(), 500);
		return () => window.clearTimeout(timer);
	});
</script>

<svelte:head>
	<title>Inventory List - {bundle.name}</title>
	<style>
		@page {
			size: A4;
			margin: 15mm;
		}
	</style>
</svelte:head>

<div class="mx-auto min-h-screen max-w-4xl bg-white p-8 text-black">
	<div class="no-print mb-8">
		<button class="rounded bg-zinc-900 px-4 py-2 text-white" onclick={() => window.print()}
			>Print</button
		>
		<a href={resolve(`/assets/bundles/${bundleId}`)} class="ml-4 text-zinc-600 underline">Back</a>
	</div>

	<header class="mb-12 border-b-2 border-black pb-4">
		<div class="flex items-end justify-between">
			<div>
				<h1 class="text-4xl font-bold tracking-wider uppercase">Inventory List</h1>
				<h2 class="mt-2 text-2xl">{bundle.name}</h2>
				{#if bundle.location}
					<p class="mt-2 text-sm text-zinc-700">{bundle.location.name}</p>
				{/if}
			</div>
			<div class="text-right">
				<p class="font-bold">{bundle.organization.name}</p>
				<p>{bundle.category.name}</p>
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
				<th class="py-2 text-right">Tag</th>
			</tr>
		</thead>
		<tbody>
			{#if bundle.assets.length === 0}
				<tr>
					<td colspan="5" class="py-6 text-center text-zinc-500">This bundle has no items yet.</td>
				</tr>
			{/if}
			{#each bundle.assets as asset, i (asset.id)}
				<tr class="border-b border-zinc-200 {i % 2 === 0 ? 'bg-zinc-50' : ''}">
					<td class="py-3 text-center">
						<div class="inline-block h-5 w-5 border-2 border-black"></div>
					</td>
					<td class="py-3 font-medium">{asset.product.name}</td>
					<td class="py-3">{asset.product.manufacturer.name}</td>
					<td class="py-3 font-mono text-sm">{asset.serialNumber || 'N/A'}</td>
					<td class="py-3 text-right font-mono text-sm">{asset.assetTag || 'N/A'}</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<p class="mt-4 text-sm text-zinc-600">
		Total items: {bundle.assets.length}
	</p>

	<div class="mt-16 grid grid-cols-2 gap-8">
		<div>
			<p class="mb-8">Checked By:</p>
			<div class="w-64 border-b border-black"></div>
		</div>
		<div>
			<p class="mb-8">Date:</p>
			<div class="w-64 border-b border-black"></div>
		</div>
	</div>
</div>
