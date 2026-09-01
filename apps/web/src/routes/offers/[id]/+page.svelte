<script lang="ts">
	import {
		customerLabel,
		getErrorMessage,
		dayCountBetween,
		formatAddress,
		orgLabel
	} from '$lib/utils';
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
		convertOfferToInvoice,
		updateDocumentText,
		updateDocumentOrgSnapshot,
		finalizeOffer,
		deleteOffer
	} from '$lib/remote/offers.remote';
	import { getCustomers } from '$lib/remote/customers.remote';
	import { StalenessBanner } from '$lib/components/ui/staleness-banner';
	import { OrgSnapshotBanner } from '$lib/components/ui/org-snapshot-banner';
	import { BillingDocument } from '$lib/components/ui/billing-document';
	import { Modal } from '$lib/components/ui/modal';
	import { CustomerSelect } from '$lib/components/ui/customer-select';
	import type { CustomerWithAddress } from '$lib/components/ui/customer-form-modal';

	const offerId = $derived(page.params.id as string);
	let offer = $derived(await getOffer(offerId));
	let staleness = $derived(await getOfferStaleness(offerId));
	let introTextDraft = $state('');
	let closingTextDraft = $state('');
	let paymentTermsDraft = $state('14');
	let savingText = $state(false);
	$effect(() => {
		introTextDraft = offer.introText ?? '';
		closingTextDraft = offer.closingText ?? '';
		paymentTermsDraft = String(offer.paymentTermsDays);
	});
	async function saveText(e: Event) {
		e.preventDefault();
		savingText = true;
		try {
			await updateDocumentText({
				id: offerId,
				kind: 'offer',
				introText: introTextDraft || undefined,
				closingText: closingTextDraft || undefined,
				paymentTermsDays: Number(paymentTermsDraft) || 14
			});
			toast.success('Document text updated');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingText = false;
		}
	}

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

	// ── Edit customer ──
	let editCustomerOpen = $state(false);
	let editCustomerId = $state('');
	let editCustomerSelected = $state<CustomerWithAddress | null>(null);
	let savingCustomer = $state(false);

	function openEditCustomer() {
		editCustomerId = offer.customerId ?? '';
		editCustomerSelected = null;
		editCustomerOpen = true;
	}

	async function handleSaveCustomer(e: Event) {
		e.preventDefault();
		const c = editCustomerSelected ?? customers.find((cu) => cu.id === editCustomerId) ?? null;
		if (!c) {
			toast.error('Please select or create a customer');
			return;
		}
		savingCustomer = true;
		try {
			await updateOfferCustomer({
				offerId,
				customerId: c.id,
				customerName: customerLabel(c),
				customerContactPerson: c.contactPerson || undefined,
				customerEmail: c.email || undefined,
				customerAddress: formatAddress(c.address) || undefined
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
	let copyCustomerId = $state('');
	let copying = $state(false);
	async function handleCopy(e: Event) {
		e.preventDefault();
		if (!copyCustomerId) {
			toast.error('Please select or create a customer');
			return;
		}
		copying = true;
		try {
			const newOffer = await copyOfferToNewCustomer({
				offerId,
				customerId: copyCustomerId
			});
			toast.success('Offer copied');
			goto(resolve(`/offers/${newOffer.id}`));
		} catch (err) {
			toast.error(getErrorMessage(err));
			copying = false;
		}
	}

	// ── Convert to invoice ──
	// The invoice number is typed in by hand: every org runs its own external
	// numbering scheme, so the app checks uniqueness instead of inventing one.
	let convertOpen = $state(false);
	let invoiceNumber = $state('');
	let converting = $state(false);
	let finalizing = $state(false);
	let deleting = $state(false);
	async function handleFinalize() {
		if (!confirm('Finalize this offer? It can no longer be edited afterwards.')) return;
		finalizing = true;
		try {
			await finalizeOffer(offerId);
			toast.success('Offer finalized and PDF archived');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			finalizing = false;
		}
	}
	async function handleDelete() {
		if (!confirm('Delete this offer permanently?')) return;
		deleting = true;
		try {
			await deleteOffer(offerId);
			toast.success('Offer deleted');
			await goto(resolve('/offers'));
		} catch (err) {
			toast.error(getErrorMessage(err));
			deleting = false;
		}
	}
	async function handleConvert(e: Event) {
		e.preventDefault();
		if (!invoiceNumber.trim()) {
			toast.error('Enter an invoice number first');
			return;
		}
		converting = true;
		try {
			const invoice = await convertOfferToInvoice({ offerId, number: invoiceNumber.trim() });
			toast.success(`Invoice ${invoice.number} created`);
			goto(resolve(`/invoices/${invoice.id}`));
		} catch (err) {
			toast.error(getErrorMessage(err));
			converting = false;
		}
	}
</script>

<svelte:head><title>Offer {offer.number} — {offer.customerName} | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">
				Offer {offer.number} — {offer.customerName}
			</h1>
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
			{#if offer.pdfPath}<Button
					icon="download"
					variant="outline"
					href={`/api/billing-documents/offers/${offerId}`}
					target="_blank">Open archived PDF</Button
				>{:else}<Button
					icon="print"
					variant="outline"
					href={`/api/billing-documents/offers/${offerId}`}
					target="_blank">Preview PDF</Button
				>{/if}
			{#if !offer.finalizedAt}<Button icon="edit" variant="outline" onclick={openEditCustomer}
					>Edit customer</Button
				><Button disabled={finalizing} onclick={handleFinalize}
					>{finalizing ? 'Finalizing…' : 'Finalize offer'}</Button
				>{/if}
			<Button variant="outline" onclick={() => (copyOpen = true)}>Copy to new customer</Button>
			{#if offer.invoices.length === 0}<Button
					variant="destructive"
					disabled={deleting}
					onclick={handleDelete}>{deleting ? 'Deleting…' : 'Delete offer'}</Button
				>{/if}
			{#if offer.invoices.length === 0}
				<Button disabled={converting || !offer.finalizedAt} onclick={() => (convertOpen = true)}>
					Convert to invoice
				</Button>
			{:else}
				<Button variant="outline" href={resolve(`/invoices/${offer.invoices[0].id}`)}>
					View invoice {offer.invoices[0].number}
				</Button>
			{/if}
		</div>
	</div>
	{#if offer.finalizedAt}<Card.Root class="bg-muted/30"
			><Card.Content class="py-4 text-sm text-muted-foreground"
				>Finalized on {new Date(offer.finalizedAt).toLocaleDateString('de-DE')} — this offer is immutable.
				The archived PDF is the authoritative document.</Card.Content
			></Card.Root
		>{/if}

	<StalenessBanner
		{staleness}
		onUpdate={async () => {
			await updateOfferItemsFromProduction(offerId);
		}}
	/>
	<OrgSnapshotBanner
		document={offer}
		organization={offer.organization}
		editable={!offer.finalizedAt}
		onUpdate={async () => {
			await updateDocumentOrgSnapshot({ id: offerId, kind: 'offer' });
		}}
	/>
	<Card.Root
		><Card.Header
			><Card.Title>Document text</Card.Title><Card.Description
				>Copied from the organization preset and editable for this offer.</Card.Description
			></Card.Header
		><Card.Content
			>{#if offer.finalizedAt}<div class="space-y-4 text-sm">
					<p class="whitespace-pre-line">{offer.introText}</p>
					<p class="whitespace-pre-line">{offer.closingText}</p>
				</div>{:else}<form class="space-y-4" onsubmit={saveText}>
					<div class="space-y-2">
						<Label for="offerIntroText">Introduction</Label><textarea
							id="offerIntroText"
							bind:value={introTextDraft}
							rows="3"
							class="w-full rounded-md border bg-background px-3 py-2 text-sm"></textarea>
					</div>
					<div class="space-y-2">
						<Label for="offerClosingText">Closing text</Label><textarea
							id="offerClosingText"
							bind:value={closingTextDraft}
							rows="3"
							class="w-full rounded-md border bg-background px-3 py-2 text-sm"></textarea>
					</div>
					<div class="max-w-48 space-y-2">
						<Label for="offerTerms">Payment term (days)</Label><Input
							id="offerTerms"
							type="number"
							min="0"
							bind:value={paymentTermsDraft}
						/>
					</div>
					<Button icon="save" type="submit" disabled={savingText}
						>{savingText ? 'Saving…' : 'Save text'}</Button
					>
				</form>{/if}</Card.Content
		></Card.Root
	>

	<Modal bind:open={editCustomerOpen} title="Edit customer" size="lg" dismissible={!savingCustomer}>
		{#snippet description()}
			The selected customer's details are copied onto this offer.
		{/snippet}

		<form class="space-y-4" onsubmit={handleSaveCustomer}>
			<CustomerSelect
				organizationId={offer.organizationId}
				bind:value={editCustomerId}
				id="offer-edit-customer"
				idPrefix="offer-edit-cust"
				onChange={(c) => (editCustomerSelected = c)}
			/>
		</form>

		{#snippet footer()}
			<Button
				icon="close"
				variant="outline"
				disabled={savingCustomer}
				onclick={() => (editCustomerOpen = false)}
			>
				Cancel
			</Button>
			<Button icon="save" disabled={savingCustomer || !editCustomerId} onclick={handleSaveCustomer}>
				{savingCustomer ? 'Saving…' : 'Save'}
			</Button>
		{/snippet}
	</Modal>

	<Modal bind:open={copyOpen} title="Copy to new customer" size="lg" dismissible={!copying}>
		{#snippet description()}
			Duplicates all line items into a new offer for the selected customer.
		{/snippet}

		<form class="space-y-4" onsubmit={handleCopy}>
			<CustomerSelect
				organizationId={offer.organizationId}
				bind:value={copyCustomerId}
				id="offer-copy-customer"
				idPrefix="offer-copy-cust"
			/>
		</form>

		{#snippet footer()}
			<Button icon="close" variant="outline" disabled={copying} onclick={() => (copyOpen = false)}>
				Cancel
			</Button>
			<Button icon="copy" disabled={copying || !copyCustomerId} onclick={handleCopy}>
				{copying ? 'Copying…' : 'Copy'}
			</Button>
		{/snippet}
	</Modal>

	<BillingDocument
		items={offer.items}
		emptyMessage="No items on this offer yet."
		editable={!offer.finalizedAt}
		dayCount={offer.dayCount}
		{fullDuration}
		{showDuration}
		discountType={offer.discountType as 'PERCENT' | 'AMOUNT' | null}
		discountValue={offer.discountValue != null ? Number(offer.discountValue) : null}
		vatRatePercent={Number(offer.vatRatePercent)}
		noVat={offer.isKleinunternehmerSnapshot}
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

<Modal bind:open={convertOpen} title="Convert to invoice" dismissible={!converting}>
	{#snippet description()}
		The invoice number is assigned by you — your organization's own numbering scheme applies. It has
		to be unique within the organization and can still be corrected while the invoice is a draft.
	{/snippet}

	<form class="space-y-4" onsubmit={handleConvert}>
		<div class="space-y-2">
			<Label for="invoiceNumber">Invoice number</Label>
			<Input id="invoiceNumber" bind:value={invoiceNumber} placeholder="2026-0042" required />
		</div>
	</form>

	{#snippet footer()}
		<Button
			icon="close"
			variant="outline"
			onclick={() => (convertOpen = false)}
			disabled={converting}
		>
			Cancel
		</Button>
		<Button onclick={handleConvert} disabled={converting || !invoiceNumber.trim()}>
			{converting ? 'Converting…' : 'Create invoice'}
		</Button>
	{/snippet}
</Modal>
