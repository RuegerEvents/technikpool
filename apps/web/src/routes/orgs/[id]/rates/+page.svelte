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

	let { data } = $props();

	const orgId = $derived(page.params.id as string);
	let org = $derived(await getOrgWithMembers(orgId));
	let rates = $derived(await getOrgCategoryRates(orgId));

	let myMembership = $derived(org.members.find((m) => m.userId === data.user?.id));
	let canManage = $derived(myMembership?.role === 'OWNER' || data.isAdmin);

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

<svelte:head><title>Rental Rates | {org.name} | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-4">
		<Button
			variant="ghost"
			href={resolve(`/orgs/${orgId}`)}
			class="flex items-center gap-1 text-muted-foreground"
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
			{org.name}
		</Button>
	</div>

	<div>
		<h1 class="text-3xl font-bold tracking-tight">Rental Rates</h1>
		<p class="text-muted-foreground">
			Default daily rental rate per category, as a percentage of an asset's net purchase price.
			Feeds offer/invoice pricing.
		</p>
	</div>

	<Card.Root class="max-w-2xl">
		<Card.Content class="pt-6">
			<div class="space-y-3">
				{#each rates as row (row.category.id)}
					<div
						class="flex items-center justify-between gap-4 border-b pb-3 last:border-0 last:pb-0"
					>
						<div class="flex items-center gap-2">
							<span class="h-2.5 w-2.5 rounded-full" style="background-color: {row.category.color}"
							></span>
							<span class="font-medium">{categoryLabel(row.category)}</span>
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
</div>
