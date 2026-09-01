<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import {
		customerLabel,
		getErrorMessage,
		dayCountBetween,
		formatAddress,
		orgLabel
	} from '$lib/utils';
	import { toast } from 'svelte-sonner';
	import {
		getInvoice,
		getInvoiceStaleness,
		updateInvoiceItemsFromProduction,
		updateInvoiceDayCount,
		updateInvoiceItemRate,
		updateInvoiceDiscount,
		updateInvoiceCustomer,
		updateInvoiceNumber,
		finalizeInvoice,
		deleteInvoice,
		updateDocumentText,
		updateDocumentOrgSnapshot
	} from '$lib/remote/offers.remote';
	import { getCustomers } from '$lib/remote/customers.remote';
	import { StalenessBanner } from '$lib/components/ui/staleness-banner';
	import type { Staleness } from '$lib/components/ui/staleness-banner';
	import { OrgSnapshotBanner } from '$lib/components/ui/org-snapshot-banner';
	import { BillingDocument } from '$lib/components/ui/billing-document';
	import { Modal } from '$lib/components/ui/modal';
	import { CustomerSelect } from '$lib/components/ui/customer-select';
	import type { CustomerWithAddress } from '$lib/components/ui/customer-form-modal';

	const invoiceId = $derived(page.params.id as string);
	let invoice = $derived(await getInvoice(invoiceId));
	let introTextDraft = $state('');
	let closingTextDraft = $state('');
	let paymentTermsDraft = $state('14');
	let savingText = $state(false);
	$effect(() => {
		introTextDraft = invoice.introText ?? '';
		closingTextDraft = invoice.closingText ?? '';
		paymentTermsDraft = String(invoice.paymentTermsDays);
	});
	async function saveText(e: Event) {
		e.preventDefault();
		savingText = true;
		try {
			await updateDocumentText({
				id: invoiceId,
				kind: 'invoice',
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
	let staleness = $derived(
		await (invoice.sentAt
			? Promise.resolve({
					applicable: false,
					stale: false,
					added: [],
					removed: [],
					changed: []
				} satisfies Staleness)
			: getInvoiceStaleness(invoiceId))
	);

	let fullDuration = $derived({
		days: dayCountBetween(invoice.production?.startDate, invoice.production?.endDate),
		start: invoice.production?.startDate ?? null,
		end: invoice.production?.endDate ?? null
	});
	let showDuration = $derived({
		days: dayCountBetween(
			invoice.production?.showStartDate ?? invoice.production?.startDate,
			invoice.production?.showEndDate ?? invoice.production?.endDate
		),
		start: invoice.production?.showStartDate ?? invoice.production?.startDate ?? null,
		end: invoice.production?.showEndDate ?? invoice.production?.endDate ?? null
	});

	let customers = $derived(await getCustomers(invoice.organizationId));

	// ── Edit customer ──
	let editCustomerOpen = $state(false);
	let editCustomerId = $state('');
	let editCustomerSelected = $state<CustomerWithAddress | null>(null);
	let savingCustomer = $state(false);

	function openEditCustomer() {
		editCustomerId = invoice.customerId ?? '';
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
			await updateInvoiceCustomer({
				invoiceId,
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

	// ── Invoice number ──
	// Typed in by hand at creation, so a typo needs a way out while the
	// invoice is still a draft.
	let editingNumber = $state(false);
	let numberDraft = $state('');
	let savingNumber = $state(false);
	async function handleSaveNumber(e: Event) {
		e.preventDefault();
		if (!numberDraft.trim()) return;
		savingNumber = true;
		try {
			await updateInvoiceNumber({ invoiceId, number: numberDraft.trim() });
			toast.success('Invoice number updated');
			editingNumber = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingNumber = false;
		}
	}

	let finalizing = $state(false);
	let deleting = $state(false);
	async function handleFinalize() {
		if (!confirm('Finalize this invoice? It can no longer be edited or deleted afterwards.'))
			return;
		finalizing = true;
		try {
			await finalizeInvoice(invoiceId);
			toast.success('Invoice finalized and PDF archived');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			finalizing = false;
		}
	}
	async function handleDelete() {
		if (!confirm('Delete this draft invoice permanently?')) return;
		deleting = true;
		try {
			await deleteInvoice(invoiceId);
			toast.success('Invoice deleted');
			await goto(resolve('/invoices'));
		} catch (err) {
			toast.error(getErrorMessage(err));
			deleting = false;
		}
	}
</script>

<svelte:head><title>Invoice {invoice.number} | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			{#if editingNumber}
				<form class="flex items-center gap-2" onsubmit={handleSaveNumber}>
					<Input class="w-48 text-2xl font-bold" bind:value={numberDraft} required />
					<Button icon="save" size="sm" type="submit" disabled={savingNumber}>
						{savingNumber ? 'Saving…' : 'Save'}
					</Button>
					<Button
						icon="close"
						size="sm"
						type="button"
						variant="outline"
						onclick={() => (editingNumber = false)}
					>
						Cancel
					</Button>
				</form>
			{:else}
				<h1 class="flex items-center gap-2 text-3xl font-bold tracking-tight">
					Invoice {invoice.number}
					{#if !invoice.sentAt}
						<Button
							icon="edit"
							size="sm"
							variant="ghost"
							title="Edit invoice number"
							onclick={() => {
								numberDraft = invoice.number;
								editingNumber = true;
							}}
						/>
					{/if}
				</h1>
			{/if}
			<p class="text-muted-foreground">
				{invoice.customerName} · {orgLabel(invoice.organization)}
				{#if invoice.production}
					·
					<a
						href={resolve(`/productions/${invoice.production.id}`)}
						class="underline underline-offset-2 hover:text-foreground"
					>
						{invoice.production.name}
					</a>
				{/if}
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			{#if invoice.pdfPath}<Button
					icon="download"
					variant="outline"
					href={`/api/billing-documents/invoices/${invoiceId}`}
					target="_blank">Open archived PDF</Button
				>{:else}<Button
					icon="print"
					variant="outline"
					href={`/api/billing-documents/invoices/${invoiceId}`}
					target="_blank">Preview PDF</Button
				>{/if}
			{#if !invoice.sentAt}
				<Button icon="edit" variant="outline" onclick={openEditCustomer}>Edit customer</Button>
				<Button variant="destructive" disabled={deleting} onclick={handleDelete}
					>{deleting ? 'Deleting…' : 'Delete invoice'}</Button
				>
				<Button disabled={finalizing} onclick={handleFinalize}
					>{finalizing ? 'Finalizing…' : 'Finalize invoice'}</Button
				>
			{:else if !invoice.pdfPath}
				<Button disabled={finalizing} onclick={handleFinalize}
					>{finalizing ? 'Archiving…' : 'Archive PDF'}</Button
				>
			{/if}
		</div>
	</div>

	{#if invoice.sentAt}
		<Card.Root class="bg-muted/30">
			<Card.Content class="py-4 text-sm text-muted-foreground">
				Finalized on {new Date(invoice.sentAt).toLocaleDateString('de-DE')} — this invoice is immutable.{#if invoice.pdfPath}
					Its archived PDF is authoritative.{:else}
					Its PDF has not been archived yet.{/if} Corrections require a new document.
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root class="bg-muted/30">
			<Card.Content class="py-4 text-sm text-muted-foreground">
				This invoice is a draft — items can still be corrected or resynced from the production.
				Finalizing archives its PDF and makes it immutable.
			</Card.Content>
		</Card.Root>
	{/if}

	<Modal bind:open={editCustomerOpen} title="Edit customer" size="lg" dismissible={!savingCustomer}>
		{#snippet description()}
			The selected customer's details are copied onto this invoice.
		{/snippet}

		<form class="space-y-4" onsubmit={handleSaveCustomer}>
			<CustomerSelect
				organizationId={invoice.organizationId}
				bind:value={editCustomerId}
				id="invoice-edit-customer"
				idPrefix="invoice-edit-cust"
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

	<StalenessBanner
		{staleness}
		onUpdate={async () => {
			await updateInvoiceItemsFromProduction(invoiceId);
		}}
	/>
	<OrgSnapshotBanner
		document={invoice}
		organization={invoice.organization}
		editable={!invoice.sentAt}
		onUpdate={async () => {
			await updateDocumentOrgSnapshot({ id: invoiceId, kind: 'invoice' });
		}}
	/>
	<Card.Root
		><Card.Header
			><Card.Title>Document text</Card.Title><Card.Description
				>Copied from the organization preset and frozen when the invoice is marked as sent.</Card.Description
			></Card.Header
		><Card.Content
			>{#if invoice.sentAt}<div class="space-y-4 text-sm">
					<p class="whitespace-pre-line">{invoice.introText}</p>
					<p class="whitespace-pre-line">{invoice.closingText}</p>
				</div>{:else}<form class="space-y-4" onsubmit={saveText}>
					<div class="space-y-2">
						<Label for="invoiceIntroText">Introduction</Label><textarea
							id="invoiceIntroText"
							bind:value={introTextDraft}
							rows="3"
							class="w-full rounded-md border bg-background px-3 py-2 text-sm"></textarea>
					</div>
					<div class="space-y-2">
						<Label for="invoiceClosingText">Closing text</Label><textarea
							id="invoiceClosingText"
							bind:value={closingTextDraft}
							rows="3"
							class="w-full rounded-md border bg-background px-3 py-2 text-sm"></textarea>
					</div>
					<div class="max-w-48 space-y-2">
						<Label for="invoiceTerms">Payment term (days)</Label><Input
							id="invoiceTerms"
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

	<BillingDocument
		items={invoice.items}
		emptyMessage="No items on this invoice yet."
		editable={!invoice.sentAt}
		dayCount={invoice.dayCount}
		{fullDuration}
		{showDuration}
		discountType={invoice.discountType as 'PERCENT' | 'AMOUNT' | null}
		discountValue={invoice.discountValue != null ? Number(invoice.discountValue) : null}
		vatRatePercent={Number(invoice.vatRatePercent)}
		noVat={invoice.isKleinunternehmerSnapshot}
		onSaveDayCount={async (dayCount) => {
			await updateInvoiceDayCount({ invoiceId, dayCount });
		}}
		onSaveDiscount={async (discountType, discountValue) => {
			await updateInvoiceDiscount({ invoiceId, discountType, discountValue });
		}}
		onSaveItemRate={async (itemIds, ratePercent) => {
			await updateInvoiceItemRate({ invoiceItemIds: itemIds, ratePercent });
		}}
	/>
</div>
