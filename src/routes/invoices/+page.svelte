<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { getInvoices } from '$lib/remote/offers.remote';
	import { resolve } from '$app/paths';

	let invoices = $derived(await getInvoices());

	function fmtEUR(n: number): string {
		return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	function invoiceTotal(invoice: (typeof invoices)[number]): number {
		const subtotal = invoice.items.reduce((sum, i) => sum + Number(i.lineTotal), 0);
		let netTotal = subtotal;
		if (invoice.discountType === 'PERCENT' && invoice.discountValue) {
			netTotal = subtotal * (1 - Number(invoice.discountValue) / 100);
		} else if (invoice.discountType === 'AMOUNT' && invoice.discountValue) {
			netTotal = Math.max(0, subtotal - Number(invoice.discountValue));
		}
		return netTotal * (1 + Number(invoice.vatRatePercent) / 100);
	}
</script>

<svelte:head><title>Invoices | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Invoices</h1>
		<p class="text-muted-foreground">Rechnungen — persisted, sequentially numbered documents.</p>
	</div>

	{#if invoices.length === 0}
		<Card.Root
			><Card.Content class="py-12 text-center text-muted-foreground">No invoices yet.</Card.Content
			></Card.Root
		>
	{:else}
		<div class="overflow-x-auto rounded-md border">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b bg-muted/30">
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Number</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Customer</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Org</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
						<th class="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
						<th class="w-16 px-4 py-3"></th>
					</tr>
				</thead>
				<tbody>
					{#each invoices as invoice (invoice.id)}
						<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
							<td class="px-4 py-3 font-mono font-medium">{invoice.number}</td>
							<td class="px-4 py-3">{invoice.customerName}</td>
							<td class="px-4 py-3 text-muted-foreground">{invoice.organization.name}</td>
							<td class="px-4 py-3 text-muted-foreground"
								>{new Date(invoice.issueDate).toLocaleDateString('de-DE')}</td
							>
							<td class="px-4 py-3 text-right font-medium tabular-nums"
								>{fmtEUR(invoiceTotal(invoice))}</td
							>
							<td class="px-4 py-3 text-right">
								<Button variant="outline" size="sm" href={resolve(`/invoices/${invoice.id}`)}
									>View</Button
								>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
