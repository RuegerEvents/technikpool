<script lang="ts">
	import { page } from '$app/state';
	import { getOffer } from '$lib/remote/offers.remote';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { groupBillingItems, lineSubtitle } from '$lib/billing-lines';

	const offerId = $derived(page.params.id as string);
	let offer = $derived(await getOffer(offerId));

	onMount(() => {
		const timer = window.setTimeout(() => window.print(), 500);
		return () => window.clearTimeout(timer);
	});

	// Units of one product print as a single quantity line — see $lib/billing-lines.
	let groups = $derived(groupBillingItems(offer.items));

	let subtotal = $derived(offer.items.reduce((sum, i) => sum + Number(i.lineTotal), 0));
	let discountAmount = $derived.by(() => {
		if (offer.discountType === 'PERCENT' && offer.discountValue) {
			return subtotal * (Number(offer.discountValue) / 100);
		}
		if (offer.discountType === 'AMOUNT' && offer.discountValue) {
			return Math.min(subtotal, Number(offer.discountValue));
		}
		return 0;
	});
	let netTotal = $derived(subtotal - discountAmount);
	let vatAmount = $derived(netTotal * (Number(offer.vatRatePercent) / 100));
	let grossTotal = $derived(netTotal + vatAmount);

	function fmtEUR(n: number): string {
		return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}
</script>

<svelte:head><title>Offer - {offer.customerName}</title></svelte:head>

<div class="mx-auto min-h-screen max-w-4xl bg-white p-8 text-black">
	<div class="no-print mb-8">
		<button class="rounded bg-zinc-900 px-4 py-2 text-white" onclick={() => window.print()}
			>Print</button
		>
		<a href={resolve(`/offers/${offerId}`)} class="ml-4 text-zinc-600 underline">Back</a>
	</div>

	<header class="mb-12 border-b-2 border-black pb-4">
		<div class="flex items-end justify-between">
			<div>
				<h1 class="text-4xl font-bold tracking-wider uppercase">Angebot</h1>
				<h2 class="mt-2 text-xl">{offer.customerName}</h2>
				{#if offer.customerContactPerson}
					<p class="mt-1 text-sm text-zinc-700">{offer.customerContactPerson}</p>
				{/if}
				{#if offer.customerAddress}
					<p class="mt-1 text-sm text-zinc-700">{offer.customerAddress}</p>
				{/if}
				{#if offer.customerEmail}
					<p class="mt-1 text-sm text-zinc-700">{offer.customerEmail}</p>
				{/if}
			</div>
			<div class="text-right text-sm">
				<p class="font-bold">{offer.organization.name}</p>
				{#if offer.organization.address}
					<p>{offer.organization.address.line1}</p>
					{#if offer.organization.address.line2}<p>{offer.organization.address.line2}</p>{/if}
					<p>{offer.organization.address.postalCode} {offer.organization.address.city}</p>
				{/if}
				{#if offer.organization.taxId}<p>Steuer-ID: {offer.organization.taxId}</p>{/if}
				<p class="mt-2">Date: {new Date(offer.createdAt).toLocaleDateString('de-DE')}</p>
				{#if offer.production}<p class="text-zinc-600">{offer.production.name}</p>{/if}
			</div>
		</div>
	</header>

	<table class="w-full border-collapse text-left">
		<thead>
			<tr class="border-b border-black">
				<th class="py-2">Item</th>
				<th class="py-2 text-right">Qty</th>
				<th class="py-2 text-right">Rate %/day</th>
				<th class="py-2 text-right">Daily rate</th>
				<th class="py-2 text-right">Days</th>
				<th class="py-2 text-right">Total</th>
			</tr>
		</thead>
		<tbody>
			{#each groups as group (group.key)}
				<tr class="border-b border-zinc-300">
					<td colspan="6" class="py-2 text-xs font-bold tracking-wide uppercase">{group.name}</td>
				</tr>
				{#each group.lines as line (line.key)}
					{@const subtitle = lineSubtitle(line)}
					<tr class="border-b border-zinc-200">
						<td class="py-3">
							{line.label}
							{#if subtitle}
								<span class="mt-0.5 block text-xs whitespace-pre-line text-zinc-600"
									>{subtitle}</span
								>
							{/if}
						</td>
						<td class="py-3 text-right">{line.quantity}×</td>
						<td class="py-3 text-right">{line.ratePercent}%</td>
						<td class="py-3 text-right">{fmtEUR(line.dailyRate)}</td>
						<td class="py-3 text-right">{offer.dayCount}</td>
						<td class="py-3 text-right">{fmtEUR(line.lineTotal)}</td>
					</tr>
				{/each}
				<tr class="border-b border-zinc-300">
					<td colspan="5" class="py-2 text-right text-xs text-zinc-600">Subtotal {group.name}</td>
					<td class="py-2 text-right text-xs font-semibold">{fmtEUR(group.subtotal)}</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<div class="mt-8 flex justify-end">
		<div class="w-64 space-y-2 text-sm">
			<div class="flex justify-between"><span>Subtotal</span><span>{fmtEUR(subtotal)}</span></div>
			{#if discountAmount > 0}
				<div class="flex justify-between">
					<span>Discount</span><span>−{fmtEUR(discountAmount)}</span>
				</div>
			{/if}
			<div class="flex justify-between border-t border-zinc-300 pt-2">
				<span>Net total</span><span>{fmtEUR(netTotal)}</span>
			</div>
			{#if Number(offer.vatRatePercent) > 0}
				<div class="flex justify-between">
					<span>VAT ({offer.vatRatePercent}%)</span><span>{fmtEUR(vatAmount)}</span>
				</div>
			{/if}
			<div class="flex justify-between border-t-2 border-black pt-2 text-base font-bold">
				<span>Total</span><span>{fmtEUR(grossTotal)}</span>
			</div>
			<p class="text-xs text-zinc-500">
				{offer.organization.isKleinunternehmer
					? 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.'
					: `Enthält ${offer.vatRatePercent}% USt.`}
			</p>
		</div>
	</div>
</div>
