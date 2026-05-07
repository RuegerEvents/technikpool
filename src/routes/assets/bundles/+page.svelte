<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { CategoryPill } from '$lib/components/ui/category-pill';
	import { getBundles } from '$lib/remote/assets.remote';
	import { resolve } from '$app/paths';
	import { Layers } from '@lucide/svelte';

	let bundles = $derived(await getBundles());
</script>

<svelte:head><title>Asset Bundles | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Asset Bundles</h1>
			<p class="text-muted-foreground">Groups of assets that travel together.</p>
		</div>
		<Button href={resolve('/assets/bundles/new')}>New Bundle</Button>
	</div>

	{#if bundles.length === 0}
		<Card.Root>
			<Card.Content class="py-12 text-center text-muted-foreground">
				No bundles yet.
				<a href={resolve('/assets/bundles/new')} class="ml-1 text-primary hover:underline"
					>Create your first bundle →</a
				>
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each bundles as bundle (bundle.id)}
				<a href={resolve(`/assets/bundles/${bundle.id}`)} class="group block">
					<Card.Root class="h-full transition-shadow hover:shadow-md">
						<Card.Header class="pb-3">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<Card.Title class="truncate text-base">{bundle.name}</Card.Title>
									<p class="mt-0.5 text-xs text-muted-foreground">{bundle.organization.name}</p>
								</div>
								<Layers class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
							</div>
						</Card.Header>
						<Card.Content class="pt-0">
							<div class="flex items-center justify-between">
								<CategoryPill name={bundle.category.name} color={bundle.category.color} />
								<span class="text-sm text-muted-foreground">
									{bundle.assets.length}
									{bundle.assets.length === 1 ? 'asset' : 'assets'}
								</span>
							</div>
							{#if bundle.description}
								<p class="mt-2 truncate text-xs text-muted-foreground">{bundle.description}</p>
							{/if}
							{#if bundle.location}
								<p class="mt-1 text-xs text-muted-foreground">📍 {bundle.location.name}</p>
							{/if}
						</Card.Content>
					</Card.Root>
				</a>
			{/each}
		</div>
	{/if}
</div>
