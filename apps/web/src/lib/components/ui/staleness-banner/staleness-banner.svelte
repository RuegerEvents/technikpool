<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { ContentSkeleton } from '#lib/components/ui/skeleton/index.js';
	import { MissingPricing } from '#lib/components/missing-pricing/index.js';
	import { getProductionBillingReadiness } from '#lib/remote/offers.remote.js';
	import { localizedName } from '#lib/category.js';
	import { getErrorMessage } from '#lib/utils.js';
	import { toast } from 'svelte-sonner';
	import type { SnapshotCategory, Staleness } from './types';

	let {
		staleness,
		onUpdate,
		mode = 'update',
		nextRevision = 2,
		onPricingSaved
	}: {
		staleness: Staleness;
		onUpdate: () => Promise<void>;
		// Re-asks for the staleness once a price or rate was set in the dialog,
		// so the banner moves on from "can't check" without a reload.
		onPricingSaved?: () => unknown;
		// 'revise' on a finalized offer: its lines can't be replaced, so the
		// dialog creates the next version instead.
		mode?: 'update' | 'revise';
		nextRevision?: number;
	} = $props();

	let open = $state(false);
	let working = $state(false);

	// Captured on opening, not read from `staleness`: the first save that makes
	// the document priceable clears `staleness.billing`, and the dialog has to
	// stay put to say so.
	let pricingArgs = $state<Staleness['billing'] | null>(null);
	let pricingOpen = $state(false);
	let pricingQuery = $derived(pricingArgs ? getProductionBillingReadiness(pricingArgs) : null);
	let pricingDone = $derived(
		!!pricingQuery?.current &&
			pricingQuery.current.missingPrices.length + pricingQuery.current.missingRates.length === 0
	);

	function openPricing() {
		pricingArgs = staleness.billing ?? null;
		pricingOpen = true;
	}

	function fmtEUR(n: number): string {
		return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	async function handleUpdate() {
		working = true;
		try {
			await onUpdate();
			toast.success(mode === 'revise' ? 'Revision created' : 'Items updated');
			open = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			working = false;
		}
	}
</script>

{#snippet category(value: SnapshotCategory)}
	<span class="inline-flex items-center gap-1">
		<span class="size-2 rounded-full" style="background-color: {value.color ?? '#a1a1aa'}"></span>
		{localizedName(value.name, value.nameDe) || 'Uncategorized'}
	</span>
{/snippet}

{#if staleness.applicable && (staleness.stale || staleness.error)}
	<Card.Root class="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
		<Card.Content class="flex flex-wrap items-center justify-between gap-3 py-4">
			<div class="text-sm">
				{#if staleness.error}
					<p class="font-medium text-amber-900 dark:text-amber-200">Can't check for updates</p>
					<p class="text-amber-800/80 dark:text-amber-300/80">{staleness.error}</p>
				{:else if mode === 'revise'}
					<p class="font-medium text-amber-900 dark:text-amber-200">This offer is out of date</p>
					<p class="text-amber-800/80 dark:text-amber-300/80">
						The production's booked equipment or its catalog details have changed since this offer
						was finalized.
					</p>
				{:else}
					<p class="font-medium text-amber-900 dark:text-amber-200">Items are out of date</p>
					<p class="text-amber-800/80 dark:text-amber-300/80">
						The production's booked equipment or its catalog details have changed since these items
						were set.
					</p>
				{/if}
			</div>
			{#if staleness.error && staleness.billing}
				<Button size="sm" onclick={openPricing}>Set prices</Button>
			{:else if !staleness.error}
				<Button size="sm" onclick={() => (open = true)}>
					{#if mode === 'revise'}Review & create V{nextRevision}{:else}Review & Update{/if}
				</Button>
			{/if}
		</Card.Content>
	</Card.Root>
{/if}

<Modal bind:open title={mode === 'revise' ? 'Create revision' : 'Update items'} size="lg">
	{#snippet description()}
		{#if mode === 'revise'}
			This creates V{nextRevision} as a new draft with what's booked on the production now. The finalized
			offer stays archived as it is. Rates you set on a line are kept for every unit that is still booked.
		{:else}
			This replaces the current line items with what's booked on the production now. Rates you set
			on a line are kept for every unit that is still booked.
		{/if}
	{/snippet}
	{#snippet children()}
		<div class="space-y-3 text-sm">
			{#if staleness.added.length > 0}
				<div>
					<p class="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						Added
					</p>
					<div class="space-y-1">
						{#each staleness.added as line (line.key)}
							<div
								class="flex justify-between rounded-md bg-green-50 px-2 py-1 dark:bg-green-950/40"
							>
								<span>{line.description}</span>
								<span class="text-green-700 tabular-nums dark:text-green-400"
									>+{fmtEUR(line.lineTotal)}</span
								>
							</div>
						{/each}
					</div>
				</div>
			{/if}
			{#if staleness.removed.length > 0}
				<div>
					<p class="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						Removed
					</p>
					<div class="space-y-1">
						{#each staleness.removed as line (line.key)}
							<div class="flex justify-between rounded-md bg-red-50 px-2 py-1 dark:bg-red-950/40">
								<span class="line-through">{line.description}</span>
								<span class="text-red-700 tabular-nums dark:text-red-400"
									>−{fmtEUR(line.lineTotal)}</span
								>
							</div>
						{/each}
					</div>
				</div>
			{/if}
			{#if staleness.changed.length > 0}
				<div>
					<p class="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						Changed
					</p>
					<div class="space-y-1">
						{#each staleness.changed as line (line.key)}
							<div class="space-y-1 rounded-md bg-muted/50 px-2 py-1">
								<div class="flex justify-between gap-3">
									<span>{line.description}</span>
									{#if line.priceChanged}
										<span class="tabular-nums">{fmtEUR(line.before)} → {fmtEUR(line.after)}</span>
									{/if}
								</div>
								{#if line.textBefore !== null && line.textAfter !== null}
									<div class="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
										<span class="whitespace-pre-line line-through">{line.textBefore}</span>
										<span aria-hidden="true">→</span>
										<span class="whitespace-pre-line text-foreground">{line.textAfter}</span>
									</div>
								{/if}
								{#if line.categoryBefore && line.categoryAfter}
									<div class="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
										<span>Category:</span>
										{@render category(line.categoryBefore)}
										<span aria-hidden="true">→</span>
										{@render category(line.categoryAfter)}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<Button type="button" onclick={handleUpdate} disabled={working}>
			{#if mode === 'revise'}
				{working ? 'Creating…' : 'Create draft'}
			{:else}
				{working ? 'Updating…' : 'Update Items'}
			{/if}
		</Button>
		<Button
			icon="close"
			type="button"
			variant="outline"
			onclick={() => (open = false)}
			disabled={working}
		>
			Cancel
		</Button>
	{/snippet}
</Modal>

<Modal bind:open={pricingOpen} title="Set missing prices" size="lg">
	{#snippet children()}
		{#if !pricingQuery?.ready}
			<ContentSkeleton shape="rows" count={3} error={pricingQuery?.error} />
		{:else if pricingDone}
			<p class="text-sm">
				Everything booked can be priced now. Close this dialog to review what the update changes.
			</p>
		{:else}
			<div class="space-y-4">
				<p class="text-sm text-muted-foreground">
					Each item is billed as a percentage of its net purchase price. For borrowed equipment that
					is your organization's price, not the lender's, so you can set it here.
				</p>
				<MissingPricing query={pricingQuery} onSaved={onPricingSaved} />
			</div>
		{/if}
	{/snippet}

	{#snippet footer()}
		<Button icon="close" type="button" variant="outline" onclick={() => (pricingOpen = false)}>
			Close
		</Button>
	{/snippet}
</Modal>
