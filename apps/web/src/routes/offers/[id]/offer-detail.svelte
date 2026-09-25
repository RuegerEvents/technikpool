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
	import { DropdownMenu } from 'bits-ui';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import {
		getOffer,
		getOfferStaleness,
		getOfferVersions,
		createOfferRevision,
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
	import { BillingIssues } from '$lib/components/ui/billing-issues';
	import { billingDocumentIssues } from '$lib/billing-document-check.svelte';
	import { organizationFromSnapshot } from '$lib/org-snapshot';
	import { BillingDocument } from '$lib/components/ui/billing-document';
	import { Modal } from '$lib/components/ui/modal';
	import { CustomerSelect } from '$lib/components/ui/customer-select';
	import type { CustomerWithAddress } from '$lib/components/ui/customer-form-modal';

	let { offerId }: { offerId: string } = $props();
	let offer = $derived(await getOffer(offerId));
	// An archived PDF is served as it is; only a render can come up short.
	let pdfIssues = $derived(
		offer.pdfPath
			? []
			: billingDocumentIssues('offer', {
					...offer,
					organization: organizationFromSnapshot(offer)
				})
	);
	let staleness = $derived(await getOfferStaleness(offerId));
	let versions = $derived(await getOfferVersions(offerId));
	// Only the newest version of an offer moves on — to an invoice or to another
	// revision. Older ones stay readable as what was sent at the time.
	let isCurrentVersion = $derived(versions.latestId === offerId);
	let currentVersion = $derived(
		versions.versions.find((version) => version.id === versions.latestId)
	);
	let canRevise = $derived(!!offer.finalizedAt && isCurrentVersion && !versions.invoiced);
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

	// The address is stored as one string — newline- or "·"-separated depending on
	// where it came from. Split the same way the PDF does, so the card shows the
	// lines the customer will see.
	let customerAddressLines = $derived(
		offer.customerAddress
			?.split(/\r?\n|\s+·\s+/)
			.map((line) => line.trim())
			.filter(Boolean) ?? []
	);

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

	// ── Revise ──
	// A finalized offer is never edited: a changed one is re-issued as the next
	// version, and this one stays archived as it was sent.
	let revising = $state(false);
	async function reviseOffer() {
		const revision = await createOfferRevision(offerId);
		await goto(resolve(`/offers/${revision.id}`));
	}
	async function handleRevise() {
		revising = true;
		try {
			await reviseOffer();
			toast.success('Revision created');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			revising = false;
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
			// Deleting a draft revision hands the offer back to the version before it.
			const previous = versions.versions
				.filter((version) => version.revision < offer.revision)
				.at(-1);
			await goto(previous ? resolve(`/offers/${previous.id}`) : resolve('/offers'));
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
			{#if versions.versions.length > 1}
				<div class="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
					<span class="text-muted-foreground">Versions:</span>
					{#each versions.versions as version (version.id)}
						{#if version.id === offerId}
							<span
								class="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground"
								>V{version.revision}</span
							>
						{:else}
							<a
								href={resolve(`/offers/${version.id}`)}
								class="rounded-full border px-2 py-0.5 text-xs font-semibold transition-colors hover:bg-muted"
								title={version.number}>V{version.revision}</a
							>
						{/if}
					{/each}
				</div>
			{/if}
		</div>
		<!-- What moves the offer along stays up here; copying and deleting are
		     rare enough to live behind the menu. -->
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
			{#if offer.pdfPath}
				<Button
					icon="download"
					variant="outline"
					href={`/api/billing-documents/offers/${offerId}`}
					target="_blank">Open archived PDF</Button
				>
			{:else}
				<Button
					icon="print"
					variant="outline"
					href={`/api/billing-documents/offers/${offerId}`}
					disabled={pdfIssues.length > 0}
					target="_blank">Preview PDF</Button
				>
			{/if}
			{#if !offer.finalizedAt}
				<Button disabled={finalizing || pdfIssues.length > 0} onclick={handleFinalize}
					>{finalizing ? 'Finalizing…' : 'Finalize offer'}</Button
				>
			{/if}
			{#if offer.invoices.length > 0}
				<Button variant="outline" href={resolve(`/invoices/${offer.invoices[0].id}`)}>
					View invoice {offer.invoices[0].number}
				</Button>
			{:else if offer.finalizedAt && isCurrentVersion && !versions.invoiced}
				<!-- A draft can't be converted, so there is nothing to offer until it
				     is finalized. -->
				<Button disabled={converting} onclick={() => (convertOpen = true)}>
					Convert to invoice
				</Button>
			{/if}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							class="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							aria-label="More actions"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="currentColor"
							>
								<circle cx="5" cy="12" r="1.75" />
								<circle cx="12" cy="12" r="1.75" />
								<circle cx="19" cy="12" r="1.75" />
							</svg>
						</button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content
						align="end"
						sideOffset={4}
						class="z-50 min-w-[190px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
					>
						<DropdownMenu.Item
							onSelect={() => (copyOpen = true)}
							class="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent data-[highlighted]:bg-accent"
						>
							Copy to new customer
						</DropdownMenu.Item>
						{#if canRevise}
							<DropdownMenu.Item
								disabled={revising}
								onSelect={handleRevise}
								class="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent"
							>
								{revising ? 'Creating…' : `Create revision V${versions.nextRevision}`}
							</DropdownMenu.Item>
						{/if}
						{#if offer.invoices.length === 0}
							<DropdownMenu.Separator class="my-1 h-px bg-border" />
							<DropdownMenu.Item
								disabled={deleting}
								onSelect={handleDelete}
								class="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm text-destructive transition-colors outline-none hover:bg-destructive/10 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-destructive/10"
							>
								{deleting ? 'Deleting…' : 'Delete offer'}
							</DropdownMenu.Item>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
		</div>
	</div>
	{#if offer.finalizedAt}<Card.Root class="bg-muted/30"
			><Card.Content class="py-4 text-sm text-muted-foreground"
				>Finalized on {new Date(offer.finalizedAt).toLocaleDateString('de-DE')} — this offer is immutable.
				The archived PDF is the authoritative document.</Card.Content
			></Card.Root
		>{/if}

	{#if !isCurrentVersion && currentVersion}
		<Card.Root class="bg-muted/30">
			<Card.Content
				class="flex flex-wrap items-center justify-between gap-3 py-4 text-sm text-muted-foreground"
			>
				<p>
					{#if currentVersion.finalized}
						This offer has been superseded by {currentVersion.number}.
					{:else}
						{currentVersion.number} is being drafted as a revision of this offer. Delete that draft to
						invoice this version instead.
					{/if}
				</p>
				<Button size="sm" variant="outline" href={resolve(`/offers/${currentVersion.id}`)}
					>Open {currentVersion.number}</Button
				>
			</Card.Content>
		</Card.Root>
	{/if}

	<StalenessBanner
		{staleness}
		mode={offer.finalizedAt ? 'revise' : 'update'}
		nextRevision={versions.nextRevision}
		onUpdate={async () => {
			if (offer.finalizedAt) await reviseOffer();
			else await updateOfferItemsFromProduction(offerId);
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
	<BillingIssues
		issues={pdfIssues}
		organizationId={offer.organizationId}
		editable={!offer.finalizedAt}
	/>

	<BillingDocument
		items={offer.items}
		emptyMessage="No items on this offer yet."
		editable={!offer.finalizedAt}
		serviceTarget={{ kind: 'offer', documentId: offerId, organizationId: offer.organizationId }}
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
	>
		{#snippet asideTop()}
			<Card.Root>
				<Card.Header>
					<Card.Title>Customer</Card.Title>
					{#if !offer.finalizedAt}
						<Card.Action>
							<Button size="sm" variant="outline" icon="edit" onclick={openEditCustomer}
								>Edit</Button
							>
						</Card.Action>
					{/if}
				</Card.Header>
				<Card.Content class="space-y-1 text-sm">
					<p class="font-medium">{offer.customerName}</p>
					{#if offer.customerContactPerson}
						<p>{offer.customerContactPerson}</p>
					{/if}
					{#each customerAddressLines as line, i (i)}
						<p class="text-muted-foreground">{line}</p>
					{/each}
					{#if offer.customerEmail}
						<p class="pt-1 text-muted-foreground">{offer.customerEmail}</p>
					{/if}
					{#if offer.customerPhone}
						<p class="text-muted-foreground">{offer.customerPhone}</p>
					{/if}
					{#if offer.customerNumber}
						<p class="pt-1 text-xs text-muted-foreground">Customer no. {offer.customerNumber}</p>
					{/if}
				</Card.Content>
			</Card.Root>
		{/snippet}

		{#snippet afterItems()}
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
		{/snippet}
	</BillingDocument>
</div>

<Modal bind:open={editCustomerOpen} title="Edit customer" size="lg" dismissible={!savingCustomer}>
	{#snippet description()}
		The selected customer's details are copied onto this offer.
	{/snippet}

	{#snippet children()}
		<form class="space-y-4" onsubmit={handleSaveCustomer}>
			<CustomerSelect
				organizationId={offer.organizationId}
				bind:value={editCustomerId}
				id="offer-edit-customer"
				idPrefix="offer-edit-cust"
				onChange={(c) => (editCustomerSelected = c)}
			/>
		</form>
	{/snippet}

	{#snippet footer()}
		<Button icon="save" disabled={savingCustomer || !editCustomerId} onclick={handleSaveCustomer}>
			{savingCustomer ? 'Saving…' : 'Save'}
		</Button>
		<Button
			icon="close"
			variant="outline"
			disabled={savingCustomer}
			onclick={() => (editCustomerOpen = false)}
		>
			Cancel
		</Button>
	{/snippet}
</Modal>

<Modal bind:open={copyOpen} title="Copy to new customer" size="lg" dismissible={!copying}>
	{#snippet description()}
		Duplicates all line items into a new offer for the selected customer.
	{/snippet}

	{#snippet children()}
		<form class="space-y-4" onsubmit={handleCopy}>
			<CustomerSelect
				organizationId={offer.organizationId}
				bind:value={copyCustomerId}
				id="offer-copy-customer"
				idPrefix="offer-copy-cust"
			/>
		</form>
	{/snippet}

	{#snippet footer()}
		<Button icon="copy" disabled={copying || !copyCustomerId} onclick={handleCopy}>
			{copying ? 'Copying…' : 'Copy'}
		</Button>
		<Button icon="close" variant="outline" disabled={copying} onclick={() => (copyOpen = false)}>
			Cancel
		</Button>
	{/snippet}
</Modal>

<Modal bind:open={convertOpen} title="Convert to invoice" dismissible={!converting}>
	{#snippet description()}
		The invoice number is assigned by you — your organization's own numbering scheme applies. It has
		to be unique within the organization and can still be corrected while the invoice is a draft.
	{/snippet}

	{#snippet children()}
		<form class="space-y-4" onsubmit={handleConvert}>
			<div class="space-y-2">
				<Label for="invoiceNumber">Invoice number</Label>
				<Input id="invoiceNumber" bind:value={invoiceNumber} placeholder="2026-0042" required />
			</div>
		</form>
	{/snippet}

	{#snippet footer()}
		<Button onclick={handleConvert} disabled={converting || !invoiceNumber.trim()}>
			{converting ? 'Converting…' : 'Create invoice'}
		</Button>
		<Button
			icon="close"
			variant="outline"
			onclick={() => (convertOpen = false)}
			disabled={converting}
		>
			Cancel
		</Button>
	{/snippet}
</Modal>
