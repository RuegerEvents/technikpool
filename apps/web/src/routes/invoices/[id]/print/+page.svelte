<script lang="ts">
	import { page } from '$app/state';
	import { getInvoice } from '$lib/remote/offers.remote';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { groupBillingItems } from '$lib/billing-lines';

	const invoiceId = $derived(page.params.id as string);
	let invoice = $derived(await getInvoice(invoiceId));

	onMount(() => {
		const timer = window.setTimeout(() => window.print(), 500);
		return () => window.clearTimeout(timer);
	});

	// Units of one product print as a single quantity line — see $lib/billing-lines.
	let groups = $derived(groupBillingItems(invoice.items));

	let subtotal = $derived(invoice.items.reduce((sum, i) => sum + Number(i.lineTotal), 0));
	let discountAmount = $derived.by(() => {
		if (invoice.discountType === 'PERCENT' && invoice.discountValue) {
			return subtotal * (Number(invoice.discountValue) / 100);
		}
		if (invoice.discountType === 'AMOUNT' && invoice.discountValue) {
			return Math.min(subtotal, Number(invoice.discountValue));
		}
		return 0;
	});
	let netTotal = $derived(subtotal - discountAmount);
	let vatAmount = $derived(netTotal * (Number(invoice.vatRatePercent) / 100));
	let grossTotal = $derived(netTotal + vatAmount);

	function fmtEUR(n: number): string {
		return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}
</script>

<svelte:head><title>Invoice {invoice.number}</title></svelte:head>

<div class="mx-auto min-h-screen max-w-4xl bg-white p-8 text-black">
	<div class="no-print mb-8">
		<button class="rounded bg-zinc-900 px-4 py-2 text-white" onclick={() => window.print()}
			>Print</button
		>
		<a href={resolve(`/invoices/${invoiceId}`)} class="ml-4 text-zinc-600 underline">Back</a>
	</div>

	<header class="mb-12 border-b-2 border-black pb-4">
		<div class="flex items-end justify-between">
			<div>
				<h1 class="text-4xl font-bold tracking-wider uppercase">Rechnung</h1>
				<p class="mt-1 font-mono text-lg">{invoice.number}</p>
				<h2 class="mt-2 text-xl">{invoice.customerName}</h2>
				{#if invoice.customerContactPerson}
					<p class="mt-1 text-sm text-zinc-700">{invoice.customerContactPerson}</p>
				{/if}
				{#if invoice.customerAddress}
					<p class="mt-1 text-sm text-zinc-700">{invoice.customerAddress}</p>
				{/if}
				{#if invoice.customerEmail}
					<p class="mt-1 text-sm text-zinc-700">{invoice.customerEmail}</p>
				{/if}
			</div>
			<div class="text-right text-sm">
				<p class="font-bold">{invoice.organization.name}</p>
				{#if invoice.organization.address}
					<p>{invoice.organization.address.line1}</p>
					{#if invoice.organization.address.line2}<p>{invoice.organization.address.line2}</p>{/if}
					<p>{invoice.organization.address.postalCode} {invoice.organization.address.city}</p>
				{/if}
				{#if invoice.organization.taxId}<p>Steuer-ID: {invoice.organization.taxId}</p>{/if}
				<p class="mt-2">Date: {new Date(invoice.issueDate).toLocaleDateString('de-DE')}</p>
				{#if invoice.production}<p class="text-zinc-600">{invoice.production.name}</p>{/if}
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
					<tr class="border-b border-zinc-200">
						<td class="py-3">{line.label}</td>
						<td class="py-3 text-right">{line.quantity}×</td>
						<td class="py-3 text-right">{line.ratePercent}%</td>
						<td class="py-3 text-right">{fmtEUR(line.dailyRate)}</td>
						<td class="py-3 text-right">{invoice.dayCount}</td>
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
			{#if Number(invoice.vatRatePercent) > 0}
				<div class="flex justify-between">
					<span>VAT ({invoice.vatRatePercent}%)</span><span>{fmtEUR(vatAmount)}</span>
				</div>
			{/if}
			<div class="flex justify-between border-t-2 border-black pt-2 text-base font-bold">
				<span>Total</span><span>{fmtEUR(grossTotal)}</span>
			</div>
			<p class="text-xs text-zinc-500">
				{invoice.isKleinunternehmerSnapshot
					? 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.'
					: `Enthält ${invoice.vatRatePercent}% USt.`}
			</p>
		</div>
	</div>

	{#if invoice.organization.iban}
		<div class="mt-12 border-t border-zinc-300 pt-4 text-sm text-zinc-700">
			<p class="mb-1 font-semibold text-black">Payment details</p>
			<p>Please transfer the total amount to:</p>
			<p>
				{invoice.organization.bankAccountHolder ?? invoice.organization.name} · {invoice
					.organization.bankName ?? ''}
			</p>
			<p>
				IBAN: {invoice.organization.iban}{#if invoice.organization.bic}
					· BIC: {invoice.organization.bic}{/if}
			</p>
			<p>Reference: {invoice.number}</p>
		</div>
	{/if}
</div>
