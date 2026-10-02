<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';

	// A 404 is the common case: an id out of an old link, a bookmark, or a record
	// someone else deleted (Prisma's misses arrive here as 404s, see auth.ts).
	let notFound = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{notFound ? 'Not found' : 'Error'} | Technikpool</title>
</svelte:head>

<div class="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
	<p class="text-5xl font-semibold text-muted-foreground tabular-nums">{page.status}</p>
	{#if notFound}
		<h1 class="text-xl font-semibold">Not found</h1>
		<p class="text-sm text-muted-foreground">
			This page does not exist, or what it showed has been deleted.
		</p>
	{:else}
		<h1 class="text-xl font-semibold">Something went wrong</h1>
		<p class="text-sm text-muted-foreground">{page.error?.message}</p>
	{/if}
	<div class="flex gap-2">
		<Button variant="outline" onclick={() => history.back()}>Back</Button>
		<Button href={resolve('/')}>To the dashboard</Button>
	</div>
</div>
