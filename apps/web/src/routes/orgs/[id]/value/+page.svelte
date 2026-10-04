<script lang="ts">
	import { categoryLabel } from '#lib/category.js';
	import { naturalCompare } from '#lib/sort.js';
	import { makerAndName } from '#lib/product-label.js';
	import { ProductThumb } from '#lib/components/ui/product-thumb/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { getOrgWithMembers, getOrgEquipmentValue } from '#lib/remote/orgs.remote.js';
	import { setOrgProductPrice } from '#lib/remote/assets.remote.js';
	import { canManageInventory } from '#lib/roles.js';
	import { getErrorMessage } from '#lib/utils.js';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { ContentSkeleton } from '#lib/components/ui/skeleton/index.js';

	let { data } = $props();

	const orgId = $derived(page.params.id as string);
	let orgQuery = $derived(getOrgWithMembers(orgId));
	let org = $derived(orgQuery.current);
	let valueQuery = $derived(getOrgEquipmentValue(orgId));
	let rows = $derived(valueQuery.current ?? []);

	let myMembership = $derived(org?.members.find((m) => m.userId === data.user?.id));
	// Prices are inventory work, as everywhere else they are set.
	let canPrice = $derived(data.isAdmin || (!!myMembership && canManageInventory(myMembership)));

	let onlyUnpriced = $state(false);

	let drafts = new SvelteMap<string, string>();
	let saving = new SvelteSet<string>();

	// Leaving the field saves, and Enter moves on to the next unpriced product,
	// so working down the list is type, Enter, type. The draft is dropped before
	// the await, so a second blur finds nothing left to save.
	async function savePrice(productId: string) {
		const raw = drafts.get(productId)?.trim().replace(',', '.');
		if (!raw || saving.has(productId)) return;
		const netPurchasePrice = Number(raw);
		if (!Number.isFinite(netPurchasePrice) || netPurchasePrice < 0) {
			toast.error('Enter a valid net purchase price');
			return;
		}
		drafts.delete(productId);
		saving.add(productId);
		try {
			// The command refreshes getOrgEquipmentValue itself.
			await setOrgProductPrice({ organizationId: orgId, productId, netPurchasePrice });
		} catch (err) {
			drafts.set(productId, raw);
			toast.error(getErrorMessage(err));
		} finally {
			saving.delete(productId);
		}
	}

	let total = $derived(rows.reduce((sum, r) => sum + (r.value ?? 0), 0));
	let units = $derived(rows.reduce((sum, r) => sum + r.units, 0));
	let damagedValue = $derived(rows.reduce((sum, r) => sum + (r.price ?? 0) * r.damaged, 0));
	let unpriced = $derived(rows.filter((r) => r.price === null));
	let unpricedUnits = $derived(unpriced.reduce((sum, r) => sum + r.units, 0));

	// One section per category, the most valuable products first and the
	// unpriced ones last, where they are easy to work through.
	let sections = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local to this derivation
		const byCategory = new Map<
			string,
			{ category: (typeof rows)[number]['category']; rows: typeof rows }
		>();
		for (const row of rows) {
			if (onlyUnpriced && row.price !== null) continue;
			const section = byCategory.get(row.category.id) ?? { category: row.category, rows: [] };
			section.rows.push(row);
			byCategory.set(row.category.id, section);
		}
		return [...byCategory.values()]
			.map((s) => ({
				...s,
				value: s.rows.reduce((sum, r) => sum + (r.value ?? 0), 0),
				rows: s.rows.toSorted(
					(a, b) =>
						(b.value ?? -1) - (a.value ?? -1) ||
						naturalCompare(
							makerAndName(a.manufacturerName, a.name),
							makerAndName(b.manufacturerName, b.name)
						)
				)
			}))
			.sort(
				(a, b) =>
					a.category.sortOrder - b.category.sortOrder ||
					naturalCompare(categoryLabel(a.category), categoryLabel(b.category))
			);
	});

	// The saved row loses its field once the refresh lands; the next one is
	// keyed and keeps the focus.
	function focusNext(current: HTMLInputElement, productId: string) {
		const fields = [...document.querySelectorAll<HTMLInputElement>('input[data-price-field]')];
		const next = fields[fields.indexOf(current) + 1];
		if (next) next.focus();
		else savePrice(productId);
	}

	function money(n: number) {
		return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}
</script>

<svelte:head><title>Equipment value | {org?.name ?? ''} | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-4">
		<Button
			variant="ghost"
			href={resolve(`orgs/${orgId}`)}
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
		<h1 class="text-3xl font-bold tracking-tight">Equipment value</h1>
		<p class="text-muted-foreground">
			Every unit still in the pool, at this organization's net purchase price.
		</p>
	</div>

	{#if !valueQuery.ready}
		<ContentSkeleton shape="table" count={8} error={valueQuery.error} />
	{:else if rows.length === 0}
		<Card.Root>
			<Card.Content class="py-8 text-center text-muted-foreground">
				This organization has no equipment yet.
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="grid gap-4 sm:grid-cols-3">
			<Card.Root>
				<Card.Header>
					<Card.Description>Total value</Card.Description>
					<Card.Title class="text-2xl tabular-nums">{money(total)}</Card.Title>
				</Card.Header>
				<Card.Content class="text-sm text-muted-foreground">
					{units} units, {rows.length} products
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Header>
					<Card.Description>Broken or in maintenance</Card.Description>
					<Card.Title class="text-2xl tabular-nums">{money(damagedValue)}</Card.Title>
				</Card.Header>
				<Card.Content class="text-sm text-muted-foreground">Included in the total</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Header>
					<Card.Description>Without a price</Card.Description>
					<Card.Title class="text-2xl tabular-nums">{unpricedUnits} units</Card.Title>
				</Card.Header>
				<Card.Content class="text-sm text-muted-foreground">
					{#if unpriced.length > 0}
						{unpriced.length} products, not in the total
					{:else}
						Every product has a price
					{/if}
				</Card.Content>
			</Card.Root>
		</div>

		{#if unpriced.length > 0}
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={onlyUnpriced} />
				Only products without a price
			</label>
		{/if}

		{#each sections as section (section.category.id)}
			<Card.Root>
				<Card.Header>
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<Card.Title class="flex items-center gap-2">
							<span
								class="h-2.5 w-2.5 shrink-0 rounded-full"
								style="background-color: {section.category.color}"
							></span>
							{categoryLabel(section.category)}
						</Card.Title>
						<span class="font-medium tabular-nums">{money(section.value)}</span>
					</div>
				</Card.Header>
				<Card.Content class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b text-left text-muted-foreground">
								<th class="py-2 pr-4 font-medium">Product</th>
								<th class="py-2 pr-4 text-right font-medium">Units</th>
								<th class="py-2 pr-4 text-right font-medium">Net price</th>
								<th class="py-2 text-right font-medium">Value</th>
							</tr>
						</thead>
						<tbody>
							{#each section.rows as row (row.id)}
								<tr class="border-b last:border-0">
									<td class="py-2 pr-4">
										<div class="flex items-center gap-2">
											<ProductThumb path={row.imagePath} alt={row.name} />
											<div class="min-w-0">
												<a href={resolve(`products/${row.id}`)} class="hover:underline">
													{makerAndName(row.manufacturerName, row.name)}
												</a>
												{#if row.damaged > 0}
													<span class="ml-1 text-xs text-muted-foreground"
														>({row.damaged} damaged)</span
													>
												{/if}
											</div>
										</div>
									</td>
									<td class="py-2 pr-4 text-right tabular-nums">{row.units}</td>
									<td class="py-2 pr-4 text-right tabular-nums">
										{#if row.price === null && canPrice}
											<form
												class="flex items-center justify-end gap-1"
												onsubmit={(e) => {
													e.preventDefault();
													const field = e.currentTarget.querySelector('input');
													if (field) focusNext(field, row.id);
												}}
											>
												<Input
													data-price-field
													inputmode="decimal"
													placeholder="Not set"
													aria-label="Net purchase price"
													value={drafts.get(row.id) ?? ''}
													disabled={saving.has(row.id)}
													oninput={(e) => drafts.set(row.id, (e.target as HTMLInputElement).value)}
													onblur={() => savePrice(row.id)}
													class="h-8 w-28 text-right"
												/>
												<span class="text-muted-foreground">€</span>
											</form>
										{:else if row.price === null}
											<span class="text-muted-foreground">Not set</span>
										{:else}
											{money(row.price)}
										{/if}
									</td>
									<td class="py-2 text-right tabular-nums">
										{row.value === null ? '—' : money(row.value)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</Card.Content>
			</Card.Root>
		{/each}
	{/if}
</div>
