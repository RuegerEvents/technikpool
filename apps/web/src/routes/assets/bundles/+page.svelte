<script lang="ts">
	import { categoryLabel } from '$lib/category';
	import { orgLabel } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { CategoryPill } from '$lib/components/ui/category-pill';
	import { getBundleTemplates } from '$lib/remote/assets.remote';
	import { resolve } from '$app/paths';
	import { Layers } from '@lucide/svelte';

	let templates = $derived(await getBundleTemplates());
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

	{#if templates.length === 0}
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
			{#each templates as template (template.id)}
				<Card.Root class="h-full">
					<Card.Header class="pb-3">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<Card.Title class="truncate text-base">{template.name}</Card.Title>
								<p class="mt-0.5 text-xs text-muted-foreground">
									{orgLabel(template.organization)}
								</p>
							</div>
							<Layers class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
						</div>
					</Card.Header>
					<Card.Content class="pt-0">
						<div class="flex items-center justify-between">
							<CategoryPill
								name={categoryLabel(template.category)}
								color={template.category.color}
							/>
							<span class="text-sm text-muted-foreground">
								{#if template.instances.length === 1}
									{template.instances.length} instance
								{:else}
									{template.instances.length} instances
								{/if}
							</span>
						</div>
						{#if template.description}
							<p class="mt-2 truncate text-xs text-muted-foreground">{template.description}</p>
						{/if}
						{#if template.instances.length > 0}
							<div class="mt-3 flex flex-wrap gap-1.5">
								{#each template.instances as instance, i (instance.id)}
									<a
										href={resolve(`/assets/bundles/${instance.id}`)}
										class="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
									>
										{instance.tag ?? `Instance ${i + 1}`}{instance.location
											? ` · ${instance.location.name}`
											: ''}
									</a>
								{/each}
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>
