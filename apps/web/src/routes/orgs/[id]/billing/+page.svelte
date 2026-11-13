<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { AddressInput } from '#lib/components/ui/address-input/index.js';
	import { getOrgWithMembers, updateOrg } from '#lib/remote/orgs.remote.js';
	import { bankAccountProblem } from '#lib/bank-account.svelte.js';
	import {
		DEFAULT_INVOICE_CLOSING,
		DEFAULT_INVOICE_INTRO,
		DEFAULT_OFFER_CLOSING,
		DEFAULT_OFFER_INTRO
	} from '#lib/billing-text.js';
	import { getErrorMessage } from '#lib/utils.js';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import RentalTermsCard from '../rental-terms-card.svelte';
	import { orgAccess } from '../org-access.js';
	import { FormDraft } from '../form-draft.svelte.js';

	// The Billing tab's first section: what offers and invoices print about the
	// organization, their text presets, and the rental terms. The details are
	// the OWNER's; the rental terms ADMIN+'s, like offers and invoices.

	let { data } = $props();

	const orgId = $derived(page.params.id as string);
	let orgQuery = $derived(getOrgWithMembers(orgId));
	let org = $derived(orgQuery.current);
	let access = $derived(orgAccess(org, data.user?.id, !!data.isAdmin));

	// ── Billing details ─────────────────────────────────────────────────────
	const details = new FormDraft(
		() =>
			org
				? {
						address: {
							line1: org.address?.line1 ?? '',
							line2: org.address?.line2 ?? '',
							postalCode: org.address?.postalCode ?? '',
							city: org.address?.city ?? ''
						},
						taxNumber: org.taxNumber ?? '',
						vatId: org.vatId ?? '',
						bankAccountHolder: org.bankAccountHolder ?? '',
						iban: org.iban ?? '',
						bic: org.bic ?? '',
						bankName: org.bankName ?? '',
						billingEmail: org.billingEmail ?? '',
						billingWebsite: org.billingWebsite ?? '',
						paymentTermsDays: String(org.paymentTermsDays),
						isKleinunternehmer: org.isKleinunternehmer
					}
				: null,
		{
			address: { line1: '', line2: '', postalCode: '', city: '' },
			taxNumber: '',
			vatId: '',
			bankAccountHolder: '',
			iban: '',
			bic: '',
			bankName: '',
			billingEmail: '',
			billingWebsite: '',
			paymentTermsDays: '14',
			isKleinunternehmer: false
		}
	);
	let bankProblem = $derived(bankAccountProblem(details.value));
	let savingDetails = $state(false);
	// Shown as text first; Edit opens the form, Save or Cancel closes it.
	let editingDetails = $state(false);

	// The dashboard's "billing details missing" lands here with `#edit`.
	let editHashHandled = false;
	$effect(() => {
		if (editHashHandled || !org || !access.canManage || page.url.hash !== '#edit') return;
		editHashHandled = true;
		details.reset();
		editingDetails = true;
	});

	async function saveDetails(e: Event) {
		e.preventDefault();
		if (!org) return;
		if (bankProblem) {
			toast.error(bankProblem);
			return;
		}
		const d = details.value;
		savingDetails = true;
		try {
			const hasAddress = d.address.line1 || d.address.postalCode || d.address.city;
			await updateOrg({
				orgId,
				assetIdPrefix: org.assetIdPrefix,
				color: org.color,
				avatarLabel: org.avatarLabel,
				address: hasAddress
					? {
							line1: d.address.line1,
							line2: d.address.line2 || undefined,
							postalCode: d.address.postalCode,
							city: d.address.city
						}
					: null,
				taxNumber: d.taxNumber || null,
				vatId: d.vatId || null,
				bankAccountHolder: d.bankAccountHolder || null,
				iban: d.iban || null,
				bic: d.bic || null,
				bankName: d.bankName || null,
				billingEmail: d.billingEmail || null,
				billingWebsite: d.billingWebsite || null,
				paymentTermsDays: Number(d.paymentTermsDays) || 14,
				isKleinunternehmer: d.isKleinunternehmer
			});
			toast.success('Billing details updated');
			editingDetails = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingDetails = false;
		}
	}

	// ── Text presets ────────────────────────────────────────────────────────
	const texts = new FormDraft(
		() =>
			org
				? {
						offerIntro: org.offerIntroTemplate ?? DEFAULT_OFFER_INTRO,
						offerClosing: org.offerClosingTemplate ?? DEFAULT_OFFER_CLOSING,
						invoiceIntro: org.invoiceIntroTemplate ?? DEFAULT_INVOICE_INTRO,
						invoiceClosing: org.invoiceClosingTemplate ?? DEFAULT_INVOICE_CLOSING
					}
				: null,
		{ offerIntro: '', offerClosing: '', invoiceIntro: '', invoiceClosing: '' }
	);
	let savingTexts = $state(false);
	let editingTexts = $state(false);
	// A preset left at its default is stored as none, so the org follows the
	// default when that changes.
	const customPreset = (value: string, preset: string) =>
		value.trim() && value.trim() !== preset ? value : null;

	async function saveTexts(e: Event) {
		e.preventDefault();
		if (!org) return;
		const t = texts.value;
		savingTexts = true;
		try {
			await updateOrg({
				orgId,
				assetIdPrefix: org.assetIdPrefix,
				color: org.color,
				avatarLabel: org.avatarLabel,
				offerIntroTemplate: customPreset(t.offerIntro, DEFAULT_OFFER_INTRO),
				offerClosingTemplate: customPreset(t.offerClosing, DEFAULT_OFFER_CLOSING),
				invoiceIntroTemplate: customPreset(t.invoiceIntro, DEFAULT_INVOICE_INTRO),
				invoiceClosingTemplate: customPreset(t.invoiceClosing, DEFAULT_INVOICE_CLOSING)
			});
			toast.success('Text presets saved');
			editingTexts = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingTexts = false;
		}
	}

	const textarea = 'w-full rounded-md border bg-background px-3 py-2 text-sm';

	let textRows = $derived(
		org
			? [
					{
						label: 'Offer introduction',
						text: texts.value.offerIntro,
						own: !!org.offerIntroTemplate
					},
					{
						label: 'Offer closing',
						text: texts.value.offerClosing,
						own: !!org.offerClosingTemplate
					},
					{
						label: 'Invoice introduction',
						text: texts.value.invoiceIntro,
						own: !!org.invoiceIntroTemplate
					},
					{
						label: 'Invoice closing',
						text: texts.value.invoiceClosing,
						own: !!org.invoiceClosingTemplate
					}
				]
			: []
	);
</script>

<svelte:head><title>{org?.name ?? ''} | Technikpool</title></svelte:head>

{#if org}
	<div class="grid items-start gap-6 lg:grid-cols-2">
		<div class="space-y-6">
			{#if access.canManage}
				<Card.Root>
					<Card.Header>
						<Card.Title>Billing details</Card.Title>
						<Card.Description>
							Address, tax numbers and bank account, printed on offers and invoices.
						</Card.Description>
					</Card.Header>
					<Card.Content>
						{#if !editingDetails}
							{@const o = org}
							<dl class="space-y-3 text-sm">
								<div>
									<dt class="text-muted-foreground">Address</dt>
									<dd>
										{#if o.address}
											{o.address.line1}{#if o.address.line2}, {o.address.line2}{/if}, {o.address
												.postalCode}
											{o.address.city}
										{:else}
											Not set
										{/if}
									</dd>
								</div>
								<div class="grid gap-3 sm:grid-cols-2">
									<div>
										<dt class="text-muted-foreground">Tax number</dt>
										<dd>{o.taxNumber ?? 'Not set'}</dd>
									</div>
									<div>
										<dt class="text-muted-foreground">VAT ID</dt>
										<dd class="font-mono">{o.vatId ?? 'Not set'}</dd>
									</div>
								</div>
								<div>
									<dt class="text-muted-foreground">Kleinunternehmer</dt>
									<dd>{o.isKleinunternehmer ? 'Yes — no VAT charged' : 'No'}</dd>
								</div>
								<div>
									<dt class="text-muted-foreground">Bank account</dt>
									<dd>
										{#if o.iban}
											{[o.bankAccountHolder, o.iban, o.bic, o.bankName].filter(Boolean).join(' · ')}
										{:else}
											Not set
										{/if}
									</dd>
								</div>
								<div class="grid gap-3 sm:grid-cols-3">
									<div>
										<dt class="text-muted-foreground">Billing email</dt>
										<dd class="break-all">{o.billingEmail ?? 'Not set'}</dd>
									</div>
									<div>
										<dt class="text-muted-foreground">Website</dt>
										<dd class="break-all">{o.billingWebsite ?? 'Not set'}</dd>
									</div>
									<div>
										<dt class="text-muted-foreground">Payment term</dt>
										<dd>{o.paymentTermsDays} days</dd>
									</div>
								</div>
							</dl>
							<Button
								icon="edit"
								variant="outline"
								size="sm"
								class="mt-4"
								onclick={() => {
									details.reset();
									editingDetails = true;
								}}>Edit</Button
							>
						{:else}
							<form onsubmit={saveDetails} class="space-y-4">
								<AddressInput bind:value={details.value.address} idPrefix="billing" />
								<div class="grid gap-4 sm:grid-cols-2">
									<div class="space-y-2">
										<Label for="billingTaxNumber">Tax number (Steuernummer)</Label>
										<Input
											id="billingTaxNumber"
											bind:value={details.value.taxNumber}
											placeholder="12/345/67890"
										/>
									</div>
									<div class="space-y-2">
										<Label for="billingVatId">VAT ID (USt-IdNr.)</Label>
										<Input
											id="billingVatId"
											bind:value={details.value.vatId}
											placeholder="DE123456789"
											class="font-mono"
										/>
									</div>
									<p class="text-xs text-muted-foreground sm:col-span-2">
										Invoices need at least one of the two and show both if both are set. Not your
										personal tax ID (Steuer-ID) — that one does not belong on an invoice.
									</p>
								</div>
								<label class="flex items-center gap-2 text-sm">
									<input
										type="checkbox"
										bind:checked={details.value.isKleinunternehmer}
										class="h-4 w-4 rounded border-input"
									/>
									Kleinunternehmer (§19 UStG) — no VAT charged
								</label>
								<div class="space-y-2">
									<Label for="billingHolder">Bank account holder</Label>
									<Input id="billingHolder" bind:value={details.value.bankAccountHolder} />
								</div>
								<div class="flex gap-4">
									<div class="flex-1 space-y-2">
										<Label for="billingIban">IBAN</Label>
										<Input id="billingIban" bind:value={details.value.iban} class="font-mono" />
									</div>
									<div class="space-y-2">
										<Label for="billingBic">BIC</Label>
										<Input id="billingBic" bind:value={details.value.bic} class="w-32 font-mono" />
									</div>
								</div>
								{#if bankProblem}
									<p class="text-xs text-destructive">{bankProblem}</p>
								{/if}
								<div class="space-y-2">
									<Label for="billingBankName">Bank name</Label>
									<Input id="billingBankName" bind:value={details.value.bankName} />
								</div>
								<div class="grid gap-4 sm:grid-cols-2">
									<div class="space-y-2">
										<Label for="billingEmail">Billing email</Label>
										<Input id="billingEmail" type="email" bind:value={details.value.billingEmail} />
									</div>
									<div class="space-y-2">
										<Label for="billingWebsite">Website</Label>
										<Input id="billingWebsite" bind:value={details.value.billingWebsite} />
									</div>
									<div class="space-y-2">
										<Label for="paymentTerms">Payment term (days)</Label>
										<Input
											id="paymentTerms"
											inputmode="numeric"
											pattern="[0-9]*"
											bind:value={details.value.paymentTermsDays}
										/>
									</div>
								</div>
								<div class="flex gap-2">
									<Button
										icon="save"
										type="submit"
										disabled={!details.dirty || savingDetails || !!bankProblem}
									>
										{savingDetails ? 'Saving…' : 'Save'}
									</Button>
									<Button
										icon="close"
										type="button"
										variant="outline"
										disabled={savingDetails}
										onclick={() => {
											details.reset();
											editingDetails = false;
										}}>Cancel</Button
									>
								</div>
							</form>
						{/if}
					</Card.Content>
				</Card.Root>
			{/if}
			{#if access.canInventory}
				<RentalTermsCard {orgId} />
			{/if}
		</div>

		<div class="space-y-6">
			{#if access.canManage}
				<Card.Root>
					<Card.Header>
						<Card.Title>Document text presets</Card.Title>
						<Card.Description>
							What a new offer or invoice starts with. Placeholders: {'{production}'}, {'{startDate}'},
							{'{endDate}'}, {'{servicePeriod}'}, {'{customer}'}, {'{documentNumber}'},
							{'{paymentTermsDays}'}. {'{rentalTermsDate}'} and {'{rentalTermsUrl}'} cite your rental
							terms; without rental terms, a line holding one of them is left out.
						</Card.Description>
					</Card.Header>
					<Card.Content>
						{#if !editingTexts}
							<dl class="space-y-4 text-sm">
								{#each textRows as row (row.label)}
									<div>
										<dt class="flex items-center gap-2 text-muted-foreground">
											{row.label}
											{#if !row.own}<span class="rounded border px-1 text-xs">Default</span>{/if}
										</dt>
										<dd class="whitespace-pre-line">{row.text}</dd>
									</div>
								{/each}
							</dl>
							<Button
								icon="edit"
								variant="outline"
								size="sm"
								class="mt-4"
								onclick={() => {
									texts.reset();
									editingTexts = true;
								}}>Edit</Button
							>
						{:else}
							<form onsubmit={saveTexts} class="space-y-4">
								<div class="space-y-2">
									<Label for="offerIntro">Offer introduction</Label>
									<textarea
										id="offerIntro"
										bind:value={texts.value.offerIntro}
										rows="5"
										class={textarea}></textarea>
								</div>
								<div class="space-y-2">
									<Label for="offerClosing">Offer closing</Label>
									<textarea
										id="offerClosing"
										bind:value={texts.value.offerClosing}
										rows="5"
										class={textarea}></textarea>
								</div>
								<div class="space-y-2">
									<Label for="invoiceIntro">Invoice introduction</Label>
									<textarea
										id="invoiceIntro"
										bind:value={texts.value.invoiceIntro}
										rows="5"
										class={textarea}></textarea>
								</div>
								<div class="space-y-2">
									<Label for="invoiceClosing">Invoice closing</Label>
									<textarea
										id="invoiceClosing"
										bind:value={texts.value.invoiceClosing}
										rows="5"
										class={textarea}></textarea>
								</div>
								<div class="flex gap-2">
									<Button icon="save" type="submit" disabled={!texts.dirty || savingTexts}>
										{savingTexts ? 'Saving…' : 'Save'}
									</Button>
									<Button
										icon="close"
										type="button"
										variant="outline"
										disabled={savingTexts}
										onclick={() => {
											texts.reset();
											editingTexts = false;
										}}>Cancel</Button
									>
								</div>
							</form>
						{/if}
					</Card.Content>
				</Card.Root>
			{/if}
		</div>
	</div>
{/if}
