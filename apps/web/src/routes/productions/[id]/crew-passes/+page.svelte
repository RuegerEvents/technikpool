<script lang="ts">
	import { orgLabel } from '$lib/utils';
	import { page } from '$app/stores';
	import { getProduction } from '$lib/remote/productions.remote';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';

	const productionId = $page.params.id as string;

	onMount(() => {
		const timer = window.setTimeout(() => window.print(), 500);
		return () => window.clearTimeout(timer);
	});

	function formatDate(d: Date | string | null | undefined) {
		if (!d) return '';
		return new Date(d).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Crew Passes</title>
	<style>
		@page {
			size: A4;
			margin: 15mm;
		}
		.pass {
			break-inside: avoid;
		}
	</style>
</svelte:head>

{#if true}
	{@const production = await getProduction(productionId)}

	<div class="mx-auto min-h-screen max-w-4xl bg-white p-8 text-black">
		<div class="no-print mb-8 flex items-center gap-4">
			<button class="rounded bg-zinc-900 px-4 py-2 text-white" onclick={() => window.print()}
				>Print</button
			>
			<a href={resolve(`/productions/${productionId}`)} class="text-zinc-600 underline">Back</a>
		</div>

		{#if !production?.crew.length}
			<p class="text-zinc-500">No crew members added to this production yet.</p>
		{:else}
			<!-- 2-column grid of passes -->
			<div class="grid grid-cols-2 gap-6">
				{#each production.crew as member (member.id)}
					<div class="pass space-y-3 rounded-lg border-2 border-zinc-800 p-5">
						<!-- Header bar -->
						<div class="-mx-5 -mt-5 rounded-t-md bg-zinc-900 px-5 py-3 text-white">
							<p class="text-xs font-bold tracking-widest uppercase opacity-70">Crew Pass</p>
							<p class="truncate text-sm font-bold">{production.name}</p>
						</div>

						<div class="space-y-1">
							<p class="text-2xl leading-tight font-bold">
								{member.user.name ?? member.user.email}
							</p>
							{#if member.role}
								<p class="text-sm font-semibold tracking-wider text-zinc-500 uppercase">
									{member.role}
								</p>
							{/if}
						</div>

						{#if production.startDate || production.endDate}
							<div class="space-y-0.5 border-t pt-2 text-xs text-zinc-600">
								{#if production.startDate}
									<p>
										From: <span class="font-medium text-zinc-800"
											>{formatDate(production.startDate)}</span
										>
									</p>
								{/if}
								{#if production.endDate}
									<p>
										To: <span class="font-medium text-zinc-800"
											>{formatDate(production.endDate)}</span
										>
									</p>
								{/if}
							</div>
						{/if}

						<div class="flex justify-between border-t pt-2 text-xs text-zinc-500">
							<span>{orgLabel(production.organization)}</span>
							{#if member.user.email}<span>{member.user.email}</span>{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}
