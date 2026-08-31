<script lang="ts">
	import { orgLabel } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { getOffers } from '$lib/remote/offers.remote';
	import { resolve } from '$app/paths';

	let offers = $derived(await getOffers());

	function offerTotal(offer: (typeof offers)[number]): number {
		const subtotal = offer.items.reduce((sum, i) => sum + Number(i.lineTotal), 0);
		let netTotal = subtotal;
		if (offer.discountType === 'PERCENT' && offer.discountValue) {
			netTotal = subtotal * (1 - Number(offer.discountValue) / 100);
		} else if (offer.discountType === 'AMOUNT' && offer.discountValue) {
			netTotal = Math.max(0, subtotal - Number(offer.discountValue));
		}
		return netTotal * (1 + Number(offer.vatRatePercent) / 100);
	}

	function fmtEUR(n: number): string {
		return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}
</script>

<svelte:head><title>Offers | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Offers</h1>
			<p class="text-muted-foreground">Angebote generated from production equipment bookings.</p>
		</div>
		<Button icon="add" href={resolve('/offers/new')}>New Offer</Button>
	</div>

	{#if offers.length === 0}
		<Card.Root
			><Card.Content class="py-12 text-center text-muted-foreground">No offers yet.</Card.Content
			></Card.Root
		>
	{:else}
		<div class="overflow-x-auto rounded-md border">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b bg-muted/30">
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Customer</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Production</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Org</th>
						<th class="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
						<th class="w-16 px-4 py-3"></th>
					</tr>
				</thead>
				<tbody>
					{#each offers as offer (offer.id)}
						<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
							<td class="px-4 py-3 font-medium">{offer.customerName}</td>
							<td class="px-4 py-3 text-muted-foreground">{offer.production?.name ?? '—'}</td>
							<td class="px-4 py-3 text-muted-foreground">{orgLabel(offer.organization)}</td>
							<td class="px-4 py-3 text-right font-medium tabular-nums"
								>{fmtEUR(offerTotal(offer))}</td
							>
							<td class="px-4 py-3">
								{#if offer.invoices.length > 0}
									<span
										class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300"
									>
										Invoiced
									</span>
								{:else}
									<span
										class="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"
									>
										Offer
									</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-right">
								<Button variant="outline" size="sm" href={resolve(`/offers/${offer.id}`)}
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
