<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { getBundles } from '$lib/remote/assets.remote';
	import { resolve } from '$app/paths';

	let bundles = $derived(await getBundles());
</script>

<svelte:head><title>Asset Bundles | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Asset Bundles</h1>
			<p class="text-muted-foreground">Grouped sets of equipment that can be booked together.</p>
		</div>
		<Button href={resolve('/assets/bundles/new')}>New Bundle</Button>
	</div>

	{#if bundles.length === 0}
		<Card.Root>
			<Card.Content class="flex flex-col items-center justify-center py-12 text-center">
				<p class="text-lg font-medium">No bundles yet</p>
				<p class="text-sm text-muted-foreground">
					Create bundles to group equipment for easy booking.
				</p>
				<Button class="mt-4" variant="outline" href={resolve('/assets/bundles/new')}
					>Create your first bundle</Button
				>
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each bundles as bundle (bundle.id)}
				<a href={resolve(`/assets/bundles/${bundle.id}`)} class="group block">
					<Card.Root class="h-full transition-colors hover:bg-muted/50">
						<Card.Header>
							<Card.Title>{bundle.name}</Card.Title>
							<Card.Description>{bundle.organization.name}</Card.Description>
						</Card.Header>
						<Card.Content>
							{#if bundle.description}
								<p class="mb-2 text-sm text-muted-foreground">{bundle.description}</p>
							{/if}
							<p class="text-sm">
								<span class="font-medium">{bundle.assets.length}</span>
								<span class="text-muted-foreground"
									>item{bundle.assets.length !== 1 ? 's' : ''}</span
								>
							</p>
						</Card.Content>
					</Card.Root>
				</a>
			{/each}
		</div>
	{/if}
</div>
