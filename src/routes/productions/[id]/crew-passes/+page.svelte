<script lang="ts">
	import { page } from '$app/stores';
	import { getProduction } from '$lib/remote/productions.remote';
	import { onMount } from 'svelte';

	const productionId = $page.params.id as string;

	onMount(() => {
		const timer = window.setTimeout(() => window.print(), 500);
		return () => window.clearTimeout(timer);
	});

	function formatDate(d: Date | string | null | undefined) {
		if (!d) return '';
		return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
	}
</script>

<svelte:head>
	<title>Crew Passes</title>
	<style>
		@page { size: A4; margin: 15mm; }
		.pass { break-inside: avoid; }
	</style>
</svelte:head>

{#if true}
	{@const production = await getProduction(productionId)}

	<div class="max-w-4xl mx-auto p-8 bg-white text-black min-h-screen">
		<div class="no-print mb-8 flex gap-4 items-center">
			<button class="px-4 py-2 bg-zinc-900 text-white rounded" onclick={() => window.print()}>Print</button>
			<a href="/productions/{productionId}" class="text-zinc-600 underline">Back</a>
		</div>

		{#if !production?.crew.length}
			<p class="text-zinc-500">No crew members added to this production yet.</p>
		{:else}
			<!-- 2-column grid of passes -->
			<div class="grid grid-cols-2 gap-6">
				{#each production.crew as member}
					<div class="pass rounded-lg border-2 border-zinc-800 p-5 space-y-3">
						<!-- Header bar -->
						<div class="bg-zinc-900 text-white -mx-5 -mt-5 px-5 py-3 rounded-t-md">
							<p class="text-xs uppercase tracking-widest font-bold opacity-70">Crew Pass</p>
							<p class="text-sm font-bold truncate">{production.name}</p>
						</div>

						<div class="space-y-1">
							<p class="text-2xl font-bold leading-tight">{member.user.name ?? member.user.email}</p>
							{#if member.role}
								<p class="text-sm font-semibold uppercase tracking-wider text-zinc-500">{member.role}</p>
							{/if}
						</div>

						{#if production.startDate || production.endDate}
							<div class="border-t pt-2 text-xs text-zinc-600 space-y-0.5">
								{#if production.startDate}
									<p>From: <span class="font-medium text-zinc-800">{formatDate(production.startDate)}</span></p>
								{/if}
								{#if production.endDate}
									<p>To: <span class="font-medium text-zinc-800">{formatDate(production.endDate)}</span></p>
								{/if}
							</div>
						{/if}

						<div class="border-t pt-2 text-xs text-zinc-500 flex justify-between">
							<span>{production.organization.name}</span>
							{#if member.user.email}<span>{member.user.email}</span>{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}
