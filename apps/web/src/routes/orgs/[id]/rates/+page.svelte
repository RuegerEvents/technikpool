<script lang="ts">
	import { categoryLabel } from '$lib/category';
	import { getErrorMessage } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		getOrgWithMembers,
		getOrgCategoryRates,
		setOrgCategoryRate
	} from '$lib/remote/orgs.remote';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import ServiceCatalog from './service-catalog.svelte';

	let { data } = $props();

	const orgId = $derived(page.params.id as string);
	let orgQuery = $derived(getOrgWithMembers(orgId));
	let org = $derived(orgQuery.current);
	let ratesQuery = $derived(getOrgCategoryRates(orgId));
	let rates = $derived(ratesQuery.current ?? []);

	let myMembership = $derived(org?.members.find((m) => m.userId === data.user?.id));
	let canManage = $derived(myMembership?.role === 'OWNER' || data.isAdmin);
	// The service price list belongs to billing, which admins run as well.
	let canEditServices = $derived(
		myMembership?.role === 'OWNER' || myMembership?.role === 'ADMIN' || data.isAdmin
	);

	let drafts = new SvelteMap<string, string>();
	let saving = new SvelteSet<string>();

	function draftFor(categoryId: string, current: string | null): string {
		return drafts.get(categoryId) ?? current ?? '';
	}

	async function handleSave(categoryId: string) {
		const raw = drafts.get(categoryId);
		if (raw === undefined || raw === '') return;
		saving.add(categoryId);
		try {
			await setOrgCategoryRate({ orgId, categoryId, percentage: Number(raw) });
			toast.success('Rate updated');
			drafts.delete(categoryId);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving.delete(categoryId);
		}
	}
</script>

<svelte:head><title>Rates & services | {org?.name ?? ''} | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-4">
		<Button
			variant="ghost"
			href={resolve(`/orgs/${orgId}`)}
			class="flex max-w-full min-w-0 items-center gap-1 text-muted-foreground"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="m15 18-6-6 6-6" />
			</svg>
			<span class="truncate">{org?.name ?? ''}</span>
		</Button>
	</div>

	<div>
		<h1 class="text-3xl font-bold tracking-tight">Rates & services</h1>
		<p class="text-muted-foreground">What offers and invoices are priced from.</p>
	</div>

	<Card.Root class="max-w-2xl">
		<Card.Header>
			<Card.Title>Rental Rates</Card.Title>
			<Card.Description>
				Default daily rental rate per category, as a percentage of an asset's net purchase price.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="space-y-3">
				{#if !ratesQuery.ready}
					<ContentSkeleton count={5} error={ratesQuery.error} />
				{/if}
				{#each rates as row (row.category.id)}
					<div
						class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-3 last:border-0 last:pb-0"
					>
						<div class="flex min-w-0 items-center gap-2">
							<span
								class="h-2.5 w-2.5 shrink-0 rounded-full"
								style="background-color: {row.category.color}"
							></span>
							<span class="truncate font-medium">{categoryLabel(row.category)}</span>
						</div>
						{#if canManage}
							<div class="flex items-center gap-2">
								<Input
									type="number"
									min="0"
									step="0.01"
									value={draftFor(row.category.id, row.percentage)}
									oninput={(e) => {
										drafts.set(row.category.id, (e.target as HTMLInputElement).value);
									}}
									class="w-24 text-right"
								/>
								<span class="text-sm text-muted-foreground">% / day</span>
								<Button
									icon="save"
									size="sm"
									variant="outline"
									disabled={saving.has(row.category.id) || !drafts.has(row.category.id)}
									onclick={() => handleSave(row.category.id)}
								>
									Save
								</Button>
							</div>
						{:else}
							<span class="text-sm text-muted-foreground">
								{row.percentage ? `${row.percentage}% / day` : 'Not set'}
							</span>
						{/if}
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>

	{#if canEditServices}
		<ServiceCatalog {orgId} />
	{/if}
</div>
