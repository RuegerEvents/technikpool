<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { setOrgCategoryRate } from '#lib/remote/orgs.remote.js';
	import { getPriceReferences, setOrgProductPrice } from '#lib/remote/assets.remote.js';
	import { PriceReference } from '#lib/components/price-reference/index.js';
	import type { getProductionBillingReadiness } from '#lib/remote/offers.remote.js';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { getErrorMessage, plural } from '#lib/utils.js';
	import { localizedName } from '#lib/category.js';

	// The query, not its answer: saving a price refreshes it, and only the held
	// instance is the one the caller is reading (see "Loading States").
	let {
		query,
		onSaved
	}: {
		query: ReturnType<typeof getProductionBillingReadiness>;
		// For a caller that shows something else priced from the same data.
		onSaved?: () => unknown;
	} = $props();

	let r = $derived(query.current);

	// Sorted, so the same products are the same cache entry whatever order the
	// readiness lists them in.
	let referencesQuery = $derived(
		r?.canEditPrices && r.missingPrices.length > 0
			? getPriceReferences({
					organizationId: r.organizationId,
					productIds: r.missingPrices.map((m) => m.productId).sort()
				})
			: null
	);
	let references = $derived(referencesQuery?.current ?? {});

	let priceDrafts = new SvelteMap<string, string>();
	let rateDrafts = new SvelteMap<string, string>();
	let pending = new SvelteSet<string>();

	// One line per bundle among a group's units, so a kit that could be priced
	// as a whole says so once rather than under every unit in it.
	function bundleHints(assets: { bundleId: string | null; bundleName: string | null }[]) {
		const hints: { bundleId: string; bundleName: string }[] = [];
		for (const a of assets) {
			if (!a.bundleId || !a.bundleName) continue;
			if (hints.some((h) => h.bundleId === a.bundleId)) continue;
			hints.push({ bundleId: a.bundleId, bundleName: a.bundleName });
		}
		return hints;
	}

	async function handleSavePrice(group: { key: string; productId: string; label: string }) {
		if (!r) return;
		const raw = priceDrafts.get(group.key)?.trim();
		if (!raw) {
			toast.error('Enter a net purchase price first');
			return;
		}
		const netPurchasePrice = Number(raw);
		if (!Number.isFinite(netPurchasePrice) || netPurchasePrice < 0) {
			toast.error('Enter a valid net purchase price');
			return;
		}
		pending.add(group.key);
		try {
			// The billing org's own price — pricing here binds no other org.
			await setOrgProductPrice({
				organizationId: r.organizationId,
				productId: group.productId,
				netPurchasePrice
			});
			priceDrafts.delete(group.key);
			await query.refresh();
			await onSaved?.();
			toast.success(`Price saved on ${group.label}`);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			pending.delete(group.key);
		}
	}

	async function handleSaveRate(categoryId: string) {
		if (!r) return;
		const raw = rateDrafts.get(categoryId)?.trim();
		if (!raw) {
			toast.error('Enter a rental rate first');
			return;
		}
		const percentage = Number(raw);
		if (!Number.isFinite(percentage) || percentage < 0) {
			toast.error('Enter a valid rental rate');
			return;
		}
		pending.add(categoryId);
		try {
			await setOrgCategoryRate({ orgId: r.organizationId, categoryId, percentage });
			rateDrafts.delete(categoryId);
			await query.refresh();
			await onSaved?.();
			toast.success('Rate saved');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			pending.delete(categoryId);
		}
	}
</script>

{#if r}
	<div class="space-y-6">
		{#if r.missingRates.length > 0}
			<div class="space-y-3">
				<h3 class="text-sm font-medium">
					{plural(r.missingRates.length, [
						'# category has no rental rate',
						'# categories have no rental rate'
					])}
				</h3>
				{#each r.missingRates as rate (rate.categoryId)}
					<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
						<div>
							<p class="font-medium">
								{localizedName(rate.categoryName, rate.categoryNameDe)}
							</p>
							<p class="text-sm text-muted-foreground">
								Daily rate, as a percentage of the net purchase price.
							</p>
						</div>
						{#if r.canEditRates}
							<div class="flex items-center gap-2">
								<Input
									type="number"
									min="0"
									step="0.01"
									class="w-24 text-right"
									value={rateDrafts.get(rate.categoryId) ?? ''}
									oninput={(e) => {
										rateDrafts.set(rate.categoryId, (e.target as HTMLInputElement).value);
									}}
								/>
								<span class="text-sm text-muted-foreground">% / day</span>
								<Button
									icon="save"
									size="sm"
									variant="outline"
									disabled={pending.has(rate.categoryId) || !rateDrafts.get(rate.categoryId)}
									onclick={() => handleSaveRate(rate.categoryId)}
								>
									Save
								</Button>
							</div>
						{:else}
							<p class="text-sm text-muted-foreground">
								Ask an owner of this organization to set it.
							</p>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		{#if r.missingPrices.length > 0}
			<div class="space-y-3">
				<h3 class="text-sm font-medium">
					{plural(r.missingPrices.length, [
						'# product has no net purchase price',
						'# products have no net purchase price'
					])}
				</h3>
				{#each r.missingPrices as group (group.key)}
					<div class="space-y-3 rounded-md border p-3">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0">
								<p class="font-medium">{group.label}</p>
								<p class="flex items-center gap-1.5 text-sm text-muted-foreground">
									<span
										class="h-2 w-2 shrink-0 rounded-full"
										style="background-color: {group.categoryColor}"
									></span>
									{localizedName(group.categoryName, group.categoryNameDe)} ·
									{plural(group.assets.length, ['# unit', '# units'])} ·
									{group.organizationNames.join(', ')}
								</p>
							</div>
							{#if r.canEditPrices}
								<div class="flex items-center gap-2">
									<Input
										type="number"
										min="0"
										step="0.01"
										placeholder="0.00"
										class="w-28 text-right"
										value={priceDrafts.get(group.key) ?? ''}
										oninput={(e) => {
											priceDrafts.set(group.key, (e.target as HTMLInputElement).value);
										}}
									/>
									<span class="text-sm text-muted-foreground">€ net</span>
									<Button
										icon="save"
										size="sm"
										variant="outline"
										disabled={pending.has(group.key) || !priceDrafts.get(group.key)}
										onclick={() => handleSavePrice(group)}
									>
										Save
									</Button>
								</div>
							{/if}
						</div>

						{#if r.canEditPrices}
							<PriceReference
								reference={references[group.productId]}
								onApply={(price) => priceDrafts.set(group.key, String(price))}
							/>
						{/if}

						<div class="flex flex-wrap gap-1.5">
							{#each group.assets as asset (asset.id)}
								<a
									href={resolve(`assets/${asset.id}`)}
									target="_blank"
									class="rounded border px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted"
								>
									{asset.label}
								</a>
							{/each}
						</div>

						{#if r.canEditPrices}
							<p class="text-sm text-muted-foreground">
								The price is your organization's own for this product — it covers every unit of it
								in your billing, here and in every later offer.
							</p>
						{:else}
							<p class="text-sm text-muted-foreground">
								Ask an admin of this organization to price the product.
							</p>
						{/if}

						{#each bundleHints(group.assets) as hint (hint.bundleId)}
							<p class="text-sm text-muted-foreground">
								In bundle
								<a
									href={resolve(`assets/bundles/${hint.bundleId}`)}
									target="_blank"
									class="underline underline-offset-2">{hint.bundleName}</a
								>, which has no price of its own and is billed as one line at the sum of its units'
								prices. A price on the bundle itself covers this unit instead.
							</p>
						{/each}
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}
