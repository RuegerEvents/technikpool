<script lang="ts">
	import { getErrorMessage, dayCountBetween, formatAddress, orgLabel } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import {
		getOffer,
		getOfferStaleness,
		updateOfferItemsFromProduction,
		updateOfferDayCount,
		updateOfferItemRate,
		updateOfferDiscount,
		updateOfferCustomer,
		copyOfferToNewCustomer,
		convertOfferToInvoice
	} from '$lib/remote/offers.remote';
	import { getCustomers } from '$lib/remote/customers.remote';
	import { StalenessBanner } from '$lib/components/ui/staleness-banner';
	import { BillingDocument } from '$lib/components/ui/billing-document';

	const offerId = $derived(page.params.id as string);
	let offer = $derived(await getOffer(offerId));
	let staleness = $derived(await getOfferStaleness(offerId));

	let fullDuration = $derived({
		days: dayCountBetween(offer.production?.startDate, offer.production?.endDate),
		start: offer.production?.startDate ?? null,
		end: offer.production?.endDate ?? null
	});
	let showDuration = $derived({
		days: dayCountBetween(
			offer.production?.showStartDate ?? offer.production?.startDate,
			offer.production?.showEndDate ?? offer.production?.endDate
		),
		start: offer.production?.showStartDate ?? offer.production?.startDate ?? null,
		end: offer.production?.showEndDate ?? offer.production?.endDate ?? null
	});

	let customers = $derived(await getCustomers(offer.organizationId));

	function customerLabel(c: { companyName: string | null; contactPerson: string | null }) {
		return c.companyName || c.contactPerson || 'Unnamed customer';
	}

	// ── Edit customer ──
	let editCustomerOpen = $state(false);
	let editCustomerId = $state('');
	let editCustomerName = $state('');
	let editCustomerContactPerson = $state('');
	let editCustomerEmail = $state('');
	let editCustomerAddress = $state('');
	let savingCustomer = $state(false);

	function openEditCustomer() {
		editCustomerId = offer.customerId ?? '';
		editCustomerName = offer.customerName;
		editCustomerContactPerson = offer.customerContactPerson ?? '';
		editCustomerEmail = offer.customerEmail ?? '';
		editCustomerAddress = offer.customerAddress ?? '';
		editCustomerOpen = true;
	}

	function handleSelectEditCustomer(e: Event) {
		editCustomerId = (e.currentTarget as HTMLSelectElement).value;
		const c = customers.find((c) => c.id === editCustomerId);
		if (!c) return;
		editCustomerName = customerLabel(c);
		editCustomerContactPerson = c.contactPerson ?? '';
		editCustomerEmail = c.email ?? '';
		editCustomerAddress = formatAddress(c.address);
	}

	async function handleSaveCustomer(e: Event) {
		e.preventDefault();
		savingCustomer = true;
		try {
			await updateOfferCustomer({
				offerId,
				customerId: editCustomerId || undefined,
				customerName: editCustomerName,
				customerContactPerson: editCustomerContactPerson || undefined,
				customerEmail: editCustomerEmail || undefined,
				customerAddress: editCustomerAddress || undefined
			});
			toast.success('Customer updated');
			editCustomerOpen = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingCustomer = false;
		}
	}

	// ── Copy to new customer ──
	let copyOpen = $state(false);
	let copyName = $state('');
	let copyAddress = $state('');
	let copying = $state(false);
	async function handleCopy(e: Event) {
		e.preventDefault();
		copying = true;
		try {
			const newOffer = await copyOfferToNewCustomer({
				offerId,
				customerName: copyName,
				customerAddress: copyAddress || undefined
			});
			toast.success('Offer copied');
			goto(resolve(`/offers/${newOffer.id}`));
		} catch (err) {
			toast.error(getErrorMessage(err));
			copying = false;
		}
	}

	// ── Convert to invoice ──
	let converting = $state(false);
	async function handleConvert() {
		converting = true;
		try {
			const invoice = await convertOfferToInvoice(offerId);
			toast.success(`Invoice ${invoice.number} created`);
			goto(resolve(`/invoices/${invoice.id}`));
		} catch (err) {
			toast.error(getErrorMessage(err));
			converting = false;
		}
	}
</script>

<svelte:head><title>Offer — {offer.customerName} | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Offer — {offer.customerName}</h1>
			<p class="text-muted-foreground">
				{orgLabel(offer.organization)}
				{#if offer.production}
					·
					<a
						href={resolve(`/productions/${offer.production.id}`)}
						class="underline underline-offset-2 hover:text-foreground"
					>
						{offer.production.name}
					</a>
				{/if}
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			{#if offer.production}
				<Button
					icon="back"
					variant="outline"
					href={resolve(`/productions/${offer.production.id}/equipment`)}
				>
					Back to equipment
				</Button>
			{/if}
			<Button
				icon="print"
				variant="outline"
				href={resolve(`/offers/${offerId}/print`)}
				target="_blank"
			>
				Print
			</Button>
			<Button icon="edit" variant="outline" onclick={openEditCustomer}>Edit customer</Button>
			<Button variant="outline" onclick={() => (copyOpen = !copyOpen)}>Copy to new customer</Button>
			{#if offer.invoices.length === 0}
				<Button disabled={converting} onclick={handleConvert}>
					{converting ? 'Converting…' : 'Convert to invoice'}
				</Button>
			{:else}
				<Button variant="outline" href={resolve(`/invoices/${offer.invoices[0].id}`)}>
					View invoice {offer.invoices[0].number}
				</Button>
			{/if}
		</div>
	</div>

	<StalenessBanner
		{staleness}
		onUpdate={async () => {
			await updateOfferItemsFromProduction(offerId);
		}}
	/>

	{#if editCustomerOpen}
		<Card.Root class="max-w-lg bg-muted/30">
			<Card.Header>
				<Card.Title>Edit customer</Card.Title>
			</Card.Header>
			<Card.Content>
				<form class="space-y-4" onsubmit={handleSaveCustomer}>
					<div class="space-y-2">
						<Label for="editCustomerSelect">Existing customer</Label>
						<select
							id="editCustomerSelect"
							value={editCustomerId}
							onchange={handleSelectEditCustomer}
							class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
						>
							<option value="">— None —</option>
							{#each customers as c (c.id)}
								<option value={c.id}>{customerLabel(c)}</option>
							{/each}
						</select>
					</div>
					<div class="space-y-2">
						<Label for="editCustomerName">Customer name</Label>
						<Input id="editCustomerName" bind:value={editCustomerName} required />
					</div>
					<div class="space-y-2">
						<Label for="editCustomerContactPerson">Contact person</Label>
						<Input
							id="editCustomerContactPerson"
							bind:value={editCustomerContactPerson}
							placeholder="Optional"
						/>
					</div>
					<div class="space-y-2">
						<Label for="editCustomerEmail">Email</Label>
						<Input
							id="editCustomerEmail"
							type="email"
							bind:value={editCustomerEmail}
							placeholder="Optional"
						/>
					</div>
					<div class="space-y-2">
						<Label for="editCustomerAddress">Customer address</Label>
						<Input
							id="editCustomerAddress"
							bind:value={editCustomerAddress}
							placeholder="Optional"
						/>
					</div>
					<div class="flex gap-2">
						<Button icon="save" type="submit" disabled={savingCustomer}>
							{savingCustomer ? 'Saving…' : 'Save'}
						</Button>
						<Button
							icon="close"
							type="button"
							variant="outline"
							onclick={() => (editCustomerOpen = false)}
						>
							Cancel
						</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if copyOpen}
		<Card.Root class="max-w-lg bg-muted/30">
			<Card.Header>
				<Card.Title>Copy to new customer</Card.Title>
				<Card.Description>Duplicates all line items into a new offer.</Card.Description>
			</Card.Header>
			<Card.Content>
				<form class="space-y-4" onsubmit={handleCopy}>
					<div class="space-y-2">
						<Label for="copyName">Customer name</Label>
						<Input id="copyName" bind:value={copyName} required />
					</div>
					<div class="space-y-2">
						<Label for="copyAddress">Customer address</Label>
						<Input id="copyAddress" bind:value={copyAddress} placeholder="Optional" />
					</div>
					<div class="flex gap-2">
						<Button type="submit" disabled={copying}>{copying ? 'Copying…' : 'Copy'}</Button>
						<Button type="button" variant="outline" onclick={() => (copyOpen = false)}
							>Cancel</Button
						>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	<BillingDocument
		items={offer.items}
		emptyMessage="No items on this offer yet."
		editable={true}
		dayCount={offer.dayCount}
		{fullDuration}
		{showDuration}
		discountType={offer.discountType as 'PERCENT' | 'AMOUNT' | null}
		discountValue={offer.discountValue != null ? Number(offer.discountValue) : null}
		vatRatePercent={Number(offer.vatRatePercent)}
		noVat={offer.organization.isKleinunternehmer}
		categoryRates={offer.organization.categoryRates}
		onSaveDayCount={async (dayCount) => {
			await updateOfferDayCount({ offerId, dayCount });
		}}
		onSaveDiscount={async (discountType, discountValue) => {
			await updateOfferDiscount({ offerId, discountType, discountValue });
		}}
		onSaveItemRate={async (itemIds, ratePercent) => {
			const updatedOffer = await updateOfferItemRate({ offerItemIds: itemIds, ratePercent });
			getOffer(offerId).set(updatedOffer);
		}}
	/>
</div>
