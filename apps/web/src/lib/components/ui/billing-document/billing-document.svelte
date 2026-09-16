<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { getErrorMessage } from '$lib/utils';
	import { toast } from 'svelte-sonner';
	import { groupBillingItems } from '$lib/billing-lines';
	import type { BillingItem, DurationInfo } from './types';

	let {
		items,
		emptyMessage,
		editable,
		dayCount,
		fullDuration,
		showDuration,
		discountType,
		discountValue,
		vatRatePercent,
		noVat,
		onSaveDayCount,
		onSaveDiscount,
		onSaveItemRate,
		categoryRates = [],
		afterItems,
		asideTop
	}: {
		/** Rendered under the line items, in the wide column. */
		afterItems?: Snippet;
		/** Rendered above the day count, at the top of the side column. */
		asideTop?: Snippet;
		items: BillingItem[];
		emptyMessage: string;
		editable: boolean;
		dayCount: number;
		fullDuration: DurationInfo;
		showDuration: DurationInfo;
		discountType: 'PERCENT' | 'AMOUNT' | null;
		discountValue: number | null;
		vatRatePercent: number;
		noVat: boolean;
		onSaveDayCount: (dayCount: number) => Promise<void>;
		onSaveDiscount: (
			discountType: 'PERCENT' | 'AMOUNT' | undefined,
			discountValue: number | undefined
		) => Promise<void>;
		onSaveItemRate: (itemIds: string[], ratePercent: number) => Promise<void>;
		categoryRates?: { categoryId: string; percentage: unknown }[];
	} = $props();

	function fmtEUR(n: number): string {
		return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	function fmtDateRange(d: DurationInfo): string {
		if (!d.start && !d.end) return '—';
		const fmt = (v: Date | string) => new Date(v).toLocaleDateString('de-DE');
		if (d.start && d.end) {
			return fmt(d.start) === fmt(d.end) ? fmt(d.start) : `${fmt(d.start)} – ${fmt(d.end)}`;
		}
		return fmt((d.start ?? d.end)!);
	}

	// Units of one product show as a single quantity line — see $lib/billing-lines.
	let groups = $derived(groupBillingItems(items));

	let subtotal = $derived(items.reduce((sum, i) => sum + Number(i.lineTotal), 0));
	let discountAmount = $derived.by(() => {
		if (discountType === 'PERCENT' && discountValue) return subtotal * (discountValue / 100);
		if (discountType === 'AMOUNT' && discountValue) return Math.min(subtotal, discountValue);
		return 0;
	});
	let netTotal = $derived(subtotal - discountAmount);
	let vatAmount = $derived(netTotal * (vatRatePercent / 100));
	let grossTotal = $derived(netTotal + vatAmount);

	// ── Day count ──
	let dayCountDraft = $derived(String(dayCount));
	let savingDayCount = $state(false);
	// Same rule as the discount: Save only for a different, valid count.
	let dayCountDirty = $derived(
		String(dayCountDraft).trim() !== '' &&
			Number(dayCountDraft) >= 1 &&
			Number(dayCountDraft) !== dayCount
	);
	async function saveDayCount() {
		savingDayCount = true;
		try {
			await onSaveDayCount(Number(dayCountDraft));
			toast.success('Day count updated');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingDayCount = false;
		}
	}

	// ── Discount ──
	let discountTypeDraft = $state<'NONE' | 'PERCENT' | 'AMOUNT' | 'UNTIL'>('NONE');
	let discountValueDraft = $state('');
	$effect(() => {
		discountTypeDraft = discountType ?? 'NONE';
		discountValueDraft = discountValue?.toString() ?? '';
	});
	let savingDiscount = $state(false);

	// "Until" mode: the user names a fixed price the customer should end up
	// paying, and we back-compute the AMOUNT discount needed to land exactly
	// there. It's saved as a plain AMOUNT discount — the customer only ever
	// sees a normal fixed-amount discount, never an "until" concept.
	let untilTargetDraft = $state('');
	let untilMode = $state<'NET' | 'GROSS'>('NET');
	let untilComputedDiscount = $derived.by(() => {
		const target = Number(untilTargetDraft);
		if (!untilTargetDraft || Number.isNaN(target)) return null;
		const netTarget =
			untilMode === 'GROSS' && !noVat ? target / (1 + vatRatePercent / 100) : target;
		return Math.max(0, subtotal - netTarget);
	});

	// Save only appears once the draft says something the document doesn't. The
	// drafts are reset from the props after a save, which is also what hides it
	// again. "Until" is compared by the discount it works out to, since that is
	// all that gets stored.
	let discountDirty = $derived.by(() => {
		const differs = (a: number, b: number | null) => b == null || Math.abs(a - b) > 0.000001;
		switch (discountTypeDraft) {
			case 'NONE':
				return discountType != null;
			case 'UNTIL':
				return (
					untilComputedDiscount != null &&
					(discountType !== 'AMOUNT' || differs(untilComputedDiscount, discountValue))
				);
			default:
				if (discountTypeDraft !== discountType) return true;
				return (
					discountValueDraft.trim() !== '' && differs(Number(discountValueDraft), discountValue)
				);
		}
	});

	// The discount is a single line of the totals until someone reaches for the
	// pen; closing it again throws away whatever wasn't saved.
	let editingDiscount = $state(false);
	function toggleDiscountEditor() {
		if (editingDiscount) {
			discountTypeDraft = discountType ?? 'NONE';
			discountValueDraft = discountValue?.toString() ?? '';
			untilTargetDraft = '';
		}
		editingDiscount = !editingDiscount;
	}

	async function saveDiscount() {
		if (discountTypeDraft === 'UNTIL' && untilComputedDiscount == null) {
			toast.error('Enter a target amount');
			return;
		}
		savingDiscount = true;
		try {
			if (discountTypeDraft === 'UNTIL') {
				await onSaveDiscount('AMOUNT', untilComputedDiscount!);
			} else {
				await onSaveDiscount(
					discountTypeDraft === 'NONE' ? undefined : discountTypeDraft,
					discountTypeDraft === 'NONE' ? undefined : Number(discountValueDraft)
				);
			}
			toast.success('Discount updated');
			editingDiscount = false;
			untilTargetDraft = '';
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingDiscount = false;
		}
	}

	// ── Per-line rate override ──
	// Keyed by the collapsed line, and saved onto every unit behind it.
	let rateEdits = $state<Record<string, string>>({});
	let savingCategory = $state<string | null>(null);
	let categoryRateById = $derived(
		new Map(categoryRates.map((rate) => [rate.categoryId, Number(rate.percentage)]))
	);
	async function saveRate(lineKey: string, itemIds: string[]) {
		const value = rateEdits[lineKey];
		if (value === undefined || value === '') return;
		try {
			await onSaveItemRate(itemIds, Number(value));
			toast.success('Rate updated');
			delete rateEdits[lineKey];
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}

	async function applyCategoryRate(categoryId: string, itemIds: string[], ratePercent: number) {
		savingCategory = categoryId;
		try {
			await onSaveItemRate(itemIds, ratePercent);
			toast.success('Category rate applied');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingCategory = null;
		}
	}
</script>

<div class="grid gap-6 lg:grid-cols-3">
	<div class="min-w-0 lg:col-span-2">
		{#if items.length === 0}
			<div class="rounded-md border py-12 text-center text-muted-foreground">
				{emptyMessage}
			</div>
		{:else}
			<div class="overflow-x-auto rounded-md border">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b bg-muted/30">
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Item</th>
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Qty</th>
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Purchase price</th>
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Rate %/day</th>
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Daily rate</th>
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Line total</th>
						</tr>
					</thead>
					<tbody>
						{#each groups as group (group.key)}
							{@const categoryRate = categoryRateById.get(group.key)}
							<tr class="border-b bg-muted/20">
								<td colspan="6" class="px-4 py-2 text-xs font-semibold tracking-wide">
									<div class="flex flex-wrap items-center justify-between gap-2">
										<span class="inline-flex items-center gap-1.5">
											<span
												class="h-2 w-2 shrink-0 rounded-full"
												style="background-color: {group.color ?? '#a1a1aa'}"
											></span>
											{group.name}
										</span>
										{#if categoryRate !== undefined}
											<div class="flex items-center gap-2 font-normal tracking-normal normal-case">
												<span class="text-muted-foreground"
													>Category rate: {categoryRate}% / day</span
												>
												{#if editable && group.lines.some((line) => Math.abs(line.ratePercent - categoryRate) > 0.000001)}
													<Button
														size="sm"
														variant="outline"
														disabled={savingCategory === group.key}
														onclick={() =>
															applyCategoryRate(
																group.key,
																group.lines.flatMap((line) => line.items.map((item) => item.id)),
																categoryRate
															)}
													>
														{savingCategory === group.key ? 'Applying…' : 'Apply to all'}
													</Button>
												{/if}
											</div>
										{/if}
									</div>
								</td>
							</tr>
							{#each group.lines as line (line.key)}
								<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
									<td class="px-4 py-3">
										{line.label}
									</td>
									<td class="px-4 py-3 text-right tabular-nums">{line.quantity}×</td>
									<td class="px-4 py-3 text-right tabular-nums">{fmtEUR(line.netPurchasePrice)}</td>
									<td class="px-4 py-3 text-right">
										{#if editable}
											<div class="flex items-center justify-end gap-1">
												<Input
													type="number"
													min="0"
													step="0.01"
													value={rateEdits[line.key] ?? String(line.ratePercent)}
													oninput={(e) => {
														rateEdits[line.key] = (e.target as HTMLInputElement).value;
													}}
													class="w-20 text-right"
												/>
												{#if rateEdits[line.key] !== undefined}
													<Button
														size="sm"
														variant="outline"
														onclick={() =>
															saveRate(
																line.key,
																line.items.map((i) => i.id)
															)}>Save</Button
													>
												{/if}
											</div>
										{:else}
											{line.ratePercent}%
										{/if}
									</td>
									<td class="px-4 py-3 text-right tabular-nums">{fmtEUR(line.dailyRate)}</td>
									<td class="px-4 py-3 text-right font-medium tabular-nums"
										>{fmtEUR(line.lineTotal)}</td
									>
								</tr>
							{/each}
							<tr class="border-b bg-muted/10 last:border-0">
								<td colspan="5" class="px-4 py-2 text-right text-xs text-muted-foreground">
									Subtotal {group.name}
								</td>
								<td class="px-4 py-2 text-right text-xs font-semibold tabular-nums"
									>{fmtEUR(group.subtotal)}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
		{#if afterItems}
			<div class="mt-6">{@render afterItems()}</div>
		{/if}
	</div>

	<div class="min-w-0 space-y-4">
		{@render asideTop?.()}
		<Card.Root>
			<Card.Header>
				<Card.Title>Day count</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-3">
				<div class="space-y-1 text-xs text-muted-foreground">
					<div class="flex justify-between gap-2">
						<span>Full production duration</span>
						<span class="text-right"
							>{fullDuration.days != null ? `${fullDuration.days} d` : '—'} · {fmtDateRange(
								fullDuration
							)}</span
						>
					</div>
					<div class="flex justify-between gap-2">
						<span>Show duration</span>
						<span class="text-right"
							>{showDuration.days != null ? `${showDuration.days} d` : '—'} · {fmtDateRange(
								showDuration
							)}</span
						>
					</div>
				</div>
				{#if editable}
					<div class="flex items-center gap-2 border-t pt-3">
						<Input type="number" min="1" bind:value={dayCountDraft} class="w-24" />
						{#if dayCountDirty || savingDayCount}
							<Button size="sm" variant="outline" disabled={savingDayCount} onclick={saveDayCount}
								>Save</Button
							>
						{/if}
					</div>
					<p class="text-xs text-muted-foreground">Applies to all line items.</p>
				{:else}
					<p class="border-t pt-3 text-sm font-medium">{dayCount} d billed</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Total</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-2 text-sm">
				<div class="flex justify-between">
					<span>Subtotal</span><span>{fmtEUR(subtotal)}</span>
				</div>
				<!-- The discount is edited on the line it produces, so the effect of a
				     change can be read off right where it is made. -->
				{#if editable}
					<div class="space-y-1.5">
						<div class="flex items-center justify-between text-muted-foreground">
							<!-- The label in its own span, so the catalogue keeps the plain
							     "Discount" rather than a message with the button inside it. -->
							<span class="inline-flex items-center gap-1"
								><span>Discount</span><button
									type="button"
									onclick={toggleDiscountEditor}
									aria-expanded={editingDiscount}
									title="Edit discount"
									class="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground {editingDiscount
										? 'bg-muted text-foreground'
										: ''}"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="13"
										height="13"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path
											d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
										/>
										<path d="m15 5 4 4" />
									</svg>
								</button></span
							><span>{discountAmount > 0 ? `−${fmtEUR(discountAmount)}` : '—'}</span>
						</div>
						{#if editingDiscount}
							<div class="flex flex-wrap items-center gap-1.5">
								<select
									bind:value={discountTypeDraft}
									class="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
								>
									<option value="NONE">No discount</option>
									<option value="PERCENT">Percent</option>
									<option value="AMOUNT">Amount (€)</option>
									<option value="UNTIL">Until (fixed price)</option>
								</select>
								{#if discountTypeDraft === 'PERCENT' || discountTypeDraft === 'AMOUNT'}
									<Input
										type="number"
										min="0"
										step="0.01"
										bind:value={discountValueDraft}
										class="h-8 w-20 text-right text-xs"
									/>
								{:else if discountTypeDraft === 'UNTIL'}
									<Input
										type="number"
										min="0"
										step="0.01"
										placeholder="Target price"
										bind:value={untilTargetDraft}
										class="h-8 w-24 text-right text-xs"
									/>
									{#if !noVat}
										<select
											bind:value={untilMode}
											class="h-8 rounded-md border border-input bg-background px-1.5 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
										>
											<option value="NET">Net</option>
											<option value="GROSS">Gross</option>
										</select>
									{/if}
								{/if}
								{#if discountDirty || savingDiscount}
									<Button
										size="sm"
										variant="outline"
										disabled={savingDiscount}
										onclick={saveDiscount}>Save</Button
									>
								{/if}
							</div>
							{#if discountTypeDraft === 'UNTIL' && untilComputedDiscount != null}
								<p class="text-xs text-muted-foreground">
									Computed discount: {fmtEUR(untilComputedDiscount)}
								</p>
							{/if}
						{/if}
					</div>
				{:else if discountAmount > 0}
					<div class="flex justify-between text-muted-foreground">
						<span>Discount</span><span>−{fmtEUR(discountAmount)}</span>
					</div>
				{/if}
				<div class="flex justify-between border-t pt-2">
					<span>Net total</span><span>{fmtEUR(netTotal)}</span>
				</div>
				{#if vatRatePercent > 0}
					<div class="flex justify-between text-muted-foreground">
						<span>VAT ({vatRatePercent}%)</span><span>{fmtEUR(vatAmount)}</span>
					</div>
				{/if}
				<div class="flex justify-between border-t pt-2 text-base font-semibold">
					<span>Total</span><span>{fmtEUR(grossTotal)}</span>
				</div>
				<p class="text-xs text-muted-foreground">
					{noVat
						? 'No VAT charged (§19 UStG Kleinunternehmer) — net = gross'
						: `Includes ${vatRatePercent}% German VAT`}
				</p>
			</Card.Content>
		</Card.Root>
	</div>
</div>
