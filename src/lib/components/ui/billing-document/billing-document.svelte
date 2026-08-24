<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { getErrorMessage } from '$lib/utils';
	import { toast } from 'svelte-sonner';
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
		onSaveItemRate
	}: {
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
		onSaveItemRate: (itemId: string, ratePercent: number) => Promise<void>;
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

	type CategoryGroup = {
		key: string;
		name: string;
		color: string | null;
		items: BillingItem[];
		subtotal: number;
	};

	let groups = $derived.by((): CategoryGroup[] => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local grouping map, discarded after building the array below
		const map = new Map<string, CategoryGroup>();
		for (const item of items) {
			const key = item.categoryId ?? '';
			let group = map.get(key);
			if (!group) {
				group = {
					key,
					name: item.categoryName ?? 'Uncategorized',
					color: item.categoryColor,
					items: [],
					subtotal: 0
				};
				map.set(key, group);
			}
			group.items.push(item);
			group.subtotal += Number(item.lineTotal);
		}
		return [...map.values()];
	});

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
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingDiscount = false;
		}
	}

	// ── Per-line rate override ──
	let rateEdits = $state<Record<string, string>>({});
	async function saveRate(itemId: string) {
		const value = rateEdits[itemId];
		if (value === undefined || value === '') return;
		try {
			await onSaveItemRate(itemId, Number(value));
			toast.success('Rate updated');
			delete rateEdits[itemId];
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}
</script>

<div class="grid gap-6 lg:grid-cols-3">
	<div class="lg:col-span-2">
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
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Purchase price</th>
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Rate %/day</th>
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Daily rate</th>
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Line total</th>
						</tr>
					</thead>
					<tbody>
						{#each groups as group (group.key)}
							<tr class="border-b bg-muted/20">
								<td colspan="5" class="px-4 py-2 text-xs font-semibold tracking-wide">
									<span class="inline-flex items-center gap-1.5">
										<span
											class="h-2 w-2 shrink-0 rounded-full"
											style="background-color: {group.color ?? '#a1a1aa'}"
										></span>
										{group.name}
									</span>
								</td>
							</tr>
							{#each group.items as item (item.id)}
								<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
									<td class="px-4 py-3">{item.description}</td>
									<td class="px-4 py-3 text-right tabular-nums"
										>{fmtEUR(Number(item.netPurchasePrice))}</td
									>
									<td class="px-4 py-3 text-right">
										{#if editable}
											<div class="flex items-center justify-end gap-1">
												<Input
													type="number"
													min="0"
													step="0.01"
													value={rateEdits[item.id] ?? String(item.ratePercent)}
													oninput={(e) => {
														rateEdits[item.id] = (e.target as HTMLInputElement).value;
													}}
													class="w-20 text-right"
												/>
												{#if rateEdits[item.id] !== undefined}
													<Button size="sm" variant="outline" onclick={() => saveRate(item.id)}
														>Save</Button
													>
												{/if}
											</div>
										{:else}
											{item.ratePercent}%
										{/if}
									</td>
									<td class="px-4 py-3 text-right tabular-nums">{fmtEUR(Number(item.dailyRate))}</td
									>
									<td class="px-4 py-3 text-right font-medium tabular-nums"
										>{fmtEUR(Number(item.lineTotal))}</td
									>
								</tr>
							{/each}
							<tr class="border-b bg-muted/10 last:border-0">
								<td colspan="4" class="px-4 py-2 text-right text-xs text-muted-foreground">
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
	</div>

	<div class="space-y-4">
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
						<Button size="sm" variant="outline" disabled={savingDayCount} onclick={saveDayCount}
							>Save</Button
						>
					</div>
					<p class="text-xs text-muted-foreground">Applies to all line items.</p>
				{:else}
					<p class="border-t pt-3 text-sm font-medium">{dayCount} d billed</p>
				{/if}
			</Card.Content>
		</Card.Root>

		{#if editable}
			<Card.Root>
				<Card.Header>
					<Card.Title>Discount</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-3">
					<select
						bind:value={discountTypeDraft}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
					>
						<option value="NONE">No discount</option>
						<option value="PERCENT">Percent</option>
						<option value="AMOUNT">Amount (€)</option>
						<option value="UNTIL">Until (fixed price)</option>
					</select>
					{#if discountTypeDraft === 'PERCENT' || discountTypeDraft === 'AMOUNT'}
						<Input type="number" min="0" step="0.01" bind:value={discountValueDraft} />
					{:else if discountTypeDraft === 'UNTIL'}
						<div class="space-y-2">
							<div class="flex items-center gap-2">
								<Input
									type="number"
									min="0"
									step="0.01"
									placeholder="Target price"
									bind:value={untilTargetDraft}
									class="flex-1"
								/>
								{#if !noVat}
									<select
										bind:value={untilMode}
										class="h-10 rounded-md border border-input bg-background px-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
									>
										<option value="NET">Net</option>
										<option value="GROSS">Gross</option>
									</select>
								{/if}
							</div>
							{#if untilComputedDiscount != null}
								<p class="text-xs text-muted-foreground">
									Computed discount: {fmtEUR(untilComputedDiscount)}
								</p>
							{/if}
						</div>
					{/if}
					<Button size="sm" variant="outline" disabled={savingDiscount} onclick={saveDiscount}
						>Save</Button
					>
				</Card.Content>
			</Card.Root>
		{/if}

		<Card.Root>
			<Card.Header>
				<Card.Title>Total</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-2 text-sm">
				<div class="flex justify-between">
					<span>Subtotal</span><span>{fmtEUR(subtotal)}</span>
				</div>
				{#if discountAmount > 0}
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
