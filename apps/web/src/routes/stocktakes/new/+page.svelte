<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import { categoryLabel } from '$lib/category';
	import { getErrorMessage, orgLabel } from '$lib/utils';
	import {
		createStocktake,
		getStocktakeFormOptions,
		getStocktakePreview,
		getStocktakeProducts
	} from '$lib/remote/stocktakes.remote';

	let optionsQuery = $derived(getStocktakeFormOptions());
	let options = $derived(optionsQuery.current);

	let chosenOrgId = $state<string | null>(null);
	// The home org, so the form usually starts ready to go.
	let organizationId = $derived(
		chosenOrgId ??
			options?.orgs.find((o) => o.id === page.data.homeOrgId)?.id ??
			options?.orgs[0]?.id ??
			null
	);
	let org = $derived(options?.orgs.find((o) => o.id === organizationId) ?? null);

	let locationIds = $state<string[]>([]);
	let categoryIds = $state<string[]>([]);
	let productIds = $state<string[]>([]);
	let productSearch = $state('');
	let name = $state('');
	let saving = $state(false);

	function pickOrg(id: string) {
		chosenOrgId = id;
		// Locations and products are the org's own; categories are shared.
		locationIds = [];
		productIds = [];
	}

	function toggle(list: string[], id: string) {
		return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
	}

	let productsQuery = $derived(organizationId ? getStocktakeProducts(organizationId) : null);
	let products = $derived(productsQuery?.current ?? []);
	let productMatches = $derived.by(() => {
		const q = productSearch.trim().toLowerCase();
		const inCategory = products.filter(
			(p) => categoryIds.length === 0 || categoryIds.includes(p.categoryId)
		);
		if (!q) return [];
		return inCategory
			.filter(
				(p) =>
					!productIds.includes(p.id) &&
					`${p.manufacturer?.name ?? ''} ${p.name}`.toLowerCase().includes(q)
			)
			.slice(0, 8);
	});
	let chosenProducts = $derived(products.filter((p) => productIds.includes(p.id)));

	let previewQuery = $derived(
		organizationId
			? getStocktakePreview({ organizationId, locationIds, categoryIds, productIds })
			: null
	);
	let preview = $derived(previewQuery?.current);

	let defaultName = $derived.by(() => {
		const date = new Date().toLocaleDateString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		});
		const places = (org?.locations ?? [])
			.filter((l) => locationIds.includes(l.id))
			.map((l) => l.name)
			.join(', ');
		return places ? `Stocktake ${date} – ${places}` : `Stocktake ${date}`;
	});

	async function start() {
		if (!organizationId) return;
		saving = true;
		try {
			const { id } = await createStocktake({
				organizationId,
				name: name.trim() || defaultName,
				locationIds,
				categoryIds,
				productIds
			});
			goto(resolve(`/stocktakes/${id}`));
		} catch (err) {
			toast.error(getErrorMessage(err));
			saving = false;
		}
	}
</script>

<svelte:head><title>New stocktake | Technikpool</title></svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<div>
		<Button variant="ghost" size="sm" icon="back" href={resolve('/stocktakes')}>Stocktakes</Button>
		<h1 class="mt-2 text-3xl font-bold tracking-tight">New stocktake</h1>
		<p class="text-muted-foreground">
			Choose what to count. Everything that matches is noted down now, so the list stays the same
			however long the count takes.
		</p>
	</div>

	{#if !options}
		<ContentSkeleton shape="form" count={4} error={optionsQuery.error} />
	{:else if options.orgs.length === 0}
		<Card.Root>
			<Card.Content class="py-10 text-center text-sm text-muted-foreground">
				You need to be a member of an organization to count its equipment.
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Content class="space-y-6">
				{#if options.orgs.length > 1}
					<div class="space-y-2">
						<Label for="org">Organization</Label>
						<select
							id="org"
							value={organizationId}
							onchange={(e) => pickOrg(e.currentTarget.value)}
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
						>
							{#each options.orgs as o (o.id)}
								<option value={o.id}>{orgLabel(o)}</option>
							{/each}
						</select>
					</div>
				{/if}

				<div class="space-y-2">
					<Label>Locations</Label>
					<p class="text-xs text-muted-foreground">None selected counts every location.</p>
					<div class="flex flex-wrap gap-2">
						{#each org?.locations ?? [] as l (l.id)}
							<button
								type="button"
								onclick={() => (locationIds = toggle(locationIds, l.id))}
								class="rounded-full border px-3 py-1 text-sm transition-colors {locationIds.includes(
									l.id
								)
									? 'border-primary bg-primary text-primary-foreground'
									: 'bg-background hover:bg-muted'}">{l.name}</button
							>
						{/each}
					</div>
				</div>

				<div class="space-y-2">
					<Label>Categories</Label>
					<p class="text-xs text-muted-foreground">None selected counts every category.</p>
					<div class="flex flex-wrap gap-2">
						{#each options.categories as c (c.id)}
							{@const on = categoryIds.includes(c.id)}
							<button
								type="button"
								onclick={() => (categoryIds = toggle(categoryIds, c.id))}
								class="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors {on
									? 'border-primary bg-primary text-primary-foreground'
									: 'bg-background hover:bg-muted'}"
							>
								<span class="size-2 rounded-full" style="background-color: {c.color}"></span>
								{categoryLabel(c)}
							</button>
						{/each}
					</div>
				</div>

				<div class="space-y-2">
					<Label for="product-search">Products</Label>
					<p class="text-xs text-muted-foreground">
						Optional: only these products. None selected counts every product.
					</p>
					{#if chosenProducts.length > 0}
						<div class="flex flex-wrap gap-2">
							{#each chosenProducts as p (p.id)}
								<button
									type="button"
									onclick={() => (productIds = productIds.filter((id) => id !== p.id))}
									class="rounded-full border border-primary bg-primary px-3 py-1 text-sm text-primary-foreground"
									title="Remove"
								>
									{p.manufacturer ? `${p.manufacturer.name} ${p.name}` : p.name} ×
								</button>
							{/each}
						</div>
					{/if}
					<Input id="product-search" bind:value={productSearch} placeholder="Search products…" />
					{#if productMatches.length > 0}
						<div class="divide-y rounded-md border">
							{#each productMatches as p (p.id)}
								<button
									type="button"
									class="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
									onclick={() => {
										productIds = [...productIds, p.id];
										productSearch = '';
									}}
								>
									{#if p.manufacturer}<span class="text-muted-foreground"
											>{p.manufacturer.name}</span
										>{/if}
									{p.name}
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="name">Name</Label>
					<Input id="name" bind:value={name} placeholder={defaultName} />
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Content class="space-y-3">
				{#if !preview}
					<ContentSkeleton shape="text" count={2} error={previewQuery?.error} />
				{:else}
					<div class="grid grid-cols-3 gap-4 text-center">
						<div>
							<p class="text-2xl font-bold tabular-nums">{preview.units}</p>
							<p class="text-xs text-muted-foreground">units to scan or tick</p>
						</div>
						<div>
							<p class="text-2xl font-bold tabular-nums">{preview.looseUnits}</p>
							<p class="text-xs text-muted-foreground">untagged units to count</p>
						</div>
						<div>
							<p class="text-2xl font-bold tabular-nums">{preview.out}</p>
							<p class="text-xs text-muted-foreground">out on productions</p>
						</div>
					</div>
					{#each preview.overlaps as overlap (overlap.id)}
						<p
							class="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
						>
							Overlaps with the open stocktake
							<a
								href={resolve(`/stocktakes/${overlap.id}`)}
								class="font-medium underline underline-offset-2">{overlap.name}</a
							>
							({overlap.sharedUnits} units). A scan only counts in the stocktake it is made in.
						</p>
					{/each}
				{/if}
				<div class="flex justify-end">
					<Button
						icon="confirm"
						onclick={start}
						disabled={saving || !preview || preview.units + preview.looseUnits + preview.out === 0}
					>
						{saving ? 'Starting…' : 'Start stocktake'}
					</Button>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
