<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { CustomerSelect } from '#lib/components/ui/customer-select/index.js';
	import { getMyOrgs } from '#lib/remote/orgs.remote.js';
	import { canManageInventory } from '#lib/roles.js';
	import { getProduction, getProductions } from '#lib/remote/productions.remote.js';
	import {
		createOfferFromProduction,
		getProductionBillingReadiness
	} from '#lib/remote/offers.remote.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { customerLabel, formatAddress, getErrorMessage, orgLabel, plural } from '#lib/utils.js';
	import { MissingPricing } from '#lib/components/missing-pricing/index.js';
	import {
		DEFAULT_OFFER_CLOSING,
		DEFAULT_OFFER_INTRO,
		formatBillingDate,
		renderBillingText
	} from '#lib/billing-text.js';

	const preselectedProductionId = page.url.searchParams.get('productionId');
	// A lender billing the production's org: `?org=` names the issuing org.
	const preselectedOrgId = page.url.searchParams.get('org');

	// Only orgs whose offers this user writes: the server refuses the rest
	// (`requireOrgBilling`), and it would do so only after a production was picked.
	let orgsQuery = $derived(getMyOrgs());
	let orgs = $derived(
		(orgsQuery.current ?? []).filter((org) => page.data.isAdmin || canManageInventory(org))
	);
	let selectedOrgId = $state('');
	let productionsQuery = $derived(selectedOrgId ? getProductions(selectedOrgId) : null);
	let productions = $derived(productionsQuery?.current ?? []);

	let productionId = $state('');
	let customerId = $state('');
	let customerName = $state('');
	let customerContactPerson = $state('');
	let customerEmail = $state('');
	let customerAddress = $state({ line1: '', line2: '', postalCode: '', city: '' });
	let assetScope = $state<'ALL' | 'OWN_ORG_ONLY'>('ALL');
	let saving = $state(false);
	let introText = $state('');
	let closingText = $state('');

	function money(n: number) {
		return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	function applyCustomerSnapshot(
		c: {
			companyName: string | null;
			contactPerson: string | null;
			email: string | null;
			address: {
				line1: string;
				line2: string | null;
				postalCode: string;
				city: string;
			} | null;
		} | null
	) {
		customerName = c ? (c.companyName ?? c.contactPerson ?? '') : '';
		customerContactPerson = c?.contactPerson ?? '';
		customerEmail = c?.email ?? '';
		customerAddress = {
			line1: c?.address?.line1 ?? '',
			line2: c?.address?.line2 ?? '',
			postalCode: c?.address?.postalCode ?? '',
			city: c?.address?.city ?? ''
		};
	}

	let selectedProduction = $derived(productions.find((p) => p.id === productionId));
	let selectedOrg = $derived(orgs.find((org) => org.id === selectedOrgId));
	// Another org's production this org lends to: the offer bills that org for
	// this org's units, and is addressed to it rather than to a customer.
	let lending = $derived(
		!!selectedProduction && selectedProduction.organizationId !== selectedOrgId
	);
	let hasCrossOrgItems = $derived(
		!lending &&
			!!selectedProduction &&
			selectedProduction.items.some(
				(i) => i.asset.organizationId !== selectedProduction!.organizationId
			)
	);

	// Which equipment can't be priced yet. The offer is generated from the
	// production's booking, so a single asset without a purchase price would
	// otherwise only surface as a failed creation — here it's a list with an
	// input next to it.
	let effectiveScope = $derived<'ALL' | 'OWN_ORG_ONLY' | 'LENT'>(
		lending ? 'LENT' : hasCrossOrgItems ? assetScope : 'ALL'
	);
	let readinessArgs = $derived(
		lending
			? { productionId, organizationId: selectedOrgId, assetScope: effectiveScope }
			: { productionId, assetScope: effectiveScope }
	);
	// The query itself is held, not just its `.current`: SvelteKit keeps a cache
	// entry alive only while some proxy for it is, so a handler calling
	// `getProductionBillingReadiness(args).refresh()` could refresh a brand-new
	// instance while this page kept reading the old one — the saved price never
	// left the list until a reload.
	let readinessQuery = $derived(productionId ? getProductionBillingReadiness(readinessArgs) : null);
	let readiness = $derived(readinessQuery?.current ?? null);
	let blockers = $derived(
		readiness ? readiness.missingPrices.length + readiness.missingRates.length : 0
	);

	$effect(() => {
		if (!preselectedProductionId || selectedOrgId) return;
		getProduction(preselectedProductionId).then((p) => {
			selectedOrgId = preselectedOrgId ?? p.organizationId;
			productionId = p.id;
		});
	});

	$effect(() => {
		if (!productionId) return;
		const issuerId = selectedOrgId;
		getProduction(productionId).then((p) => {
			const lent = p.organizationId !== issuerId;
			const c = lent ? null : p.customer;
			customerId = c?.id ?? '';
			applyCustomerSnapshot(c);
			const start = new Date(p.startDate ?? p.showStartDate ?? Date.now());
			const end = new Date(p.endDate ?? p.showEndDate ?? start);
			const values = {
				production: p.name,
				startDate: formatBillingDate(start),
				endDate: formatBillingDate(end),
				servicePeriod: `${formatBillingDate(start)} bis ${formatBillingDate(end)}`,
				customer: lent ? p.organization.name : c ? customerLabel(c) : '',
				paymentTermsDays: selectedOrg?.paymentTermsDays ?? 14
			};
			introText = renderBillingText(selectedOrg?.offerIntroTemplate || DEFAULT_OFFER_INTRO, values);
			closingText = renderBillingText(
				selectedOrg?.offerClosingTemplate || DEFAULT_OFFER_CLOSING,
				values
			);
		});
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!productionId) {
			toast.error('Please select a production');
			return;
		}
		if (blockers > 0) {
			toast.error('Set the missing prices and rates before creating the offer');
			return;
		}
		if (!lending && (!customerId || !customerName)) {
			toast.error('Please select or create a customer');
			return;
		}
		saving = true;
		try {
			const offer = await createOfferFromProduction({
				productionId,
				organizationId: lending ? selectedOrgId : undefined,
				customerId,
				customerName,
				customerAddress: formatAddress(customerAddress) || undefined,
				customerContactPerson: customerContactPerson || undefined,
				customerEmail: customerEmail || undefined,
				introText: introText || undefined,
				closingText: closingText || undefined,
				assetScope: hasCrossOrgItems ? assetScope : undefined
			});
			toast.success('Offer created');
			goto(resolve(`offers/${offer.id}`));
		} catch (err) {
			toast.error(getErrorMessage(err));
			saving = false;
		}
	}
</script>

<svelte:head><title>New Offer | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">New Offer</h1>
		<p class="text-muted-foreground">
			Generates line items from a production's currently booked equipment.
		</p>
	</div>

	<div class="grid gap-6 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)] lg:items-start">
		<Card.Root>
			<Card.Content class="pt-6">
				<form class="space-y-4" onsubmit={handleSubmit}>
					<div class="space-y-2">
						<Label for="org">Organization</Label>
						<select
							id="org"
							bind:value={selectedOrgId}
							required
							class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
						>
							<option value="" disabled>Select an organization</option>
							{#each orgs as org (org.id)}<option value={org.id}>{orgLabel(org)}</option>{/each}
						</select>
					</div>

					{#if selectedOrgId}
						<div class="space-y-2">
							<Label for="production">Production</Label>
							<select
								id="production"
								bind:value={productionId}
								required
								class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
							>
								<option value="" disabled>Select a production</option>
								{#each productions as p (p.id)}
									<option value={p.id}
										>{p.name}{p.organizationId === selectedOrgId
											? ''
											: ` — ${orgLabel(p.organization)}`} ({p.items.length} items)</option
									>
								{/each}
							</select>
						</div>
					{/if}

					{#if hasCrossOrgItems}
						<div class="space-y-2">
							<Label for="assetScope">Assets to include</Label>
							<select
								id="assetScope"
								bind:value={assetScope}
								class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
							>
								<option value="ALL">All organizations</option>
								<option value="OWN_ORG_ONLY">Only this organization's own assets</option>
							</select>
							<p class="text-sm text-muted-foreground">
								This production has equipment loaned in from other organizations. Choose "Only this
								organization's own assets" to bill just your own equipment separately.
							</p>
						</div>
					{/if}

					{#if lending && selectedProduction}
						<div class="space-y-1 rounded-md bg-muted/50 px-3 py-2 text-sm">
							<p>
								Billed to <span class="font-medium"
									>{orgLabel(selectedProduction.organization)}</span
								>, for the equipment you lend to this production.
							</p>
							<p class="text-muted-foreground">
								Units you approved free of charge are left off. The recipient can read the offer
								once you finalize it.
							</p>
						</div>
					{:else}
						<div class="space-y-2">
							<Label for="customer">Customer</Label>
							<CustomerSelect
								id="customer"
								organizationId={selectedOrgId}
								bind:value={customerId}
								idPrefix="offer-cust"
								onChange={applyCustomerSnapshot}
							/>
							{#if customerContactPerson || customerEmail || formatAddress(customerAddress)}
								<p class="text-sm text-muted-foreground">
									{[customerContactPerson, customerEmail, formatAddress(customerAddress)]
										.filter(Boolean)
										.join(' · ')}
								</p>
							{/if}
						</div>
					{/if}

					<div class="space-y-2">
						<Label for="introText">Introduction</Label>
						<textarea
							id="introText"
							bind:value={introText}
							rows="4"
							class="w-full rounded-md border bg-background px-3 py-2 text-sm"></textarea>
					</div>
					<div class="space-y-2">
						<Label for="closingText">Closing text</Label>
						<textarea
							id="closingText"
							bind:value={closingText}
							rows="4"
							class="w-full rounded-md border bg-background px-3 py-2 text-sm"></textarea>
					</div>

					<div class="space-y-2">
						<Button type="submit" disabled={saving || blockers > 0}
							>{saving ? 'Creating…' : 'Create Offer'}</Button
						>
						{#if blockers > 0}
							<p class="text-sm text-muted-foreground">
								Resolve the missing pricing data first — it's listed on the right.
							</p>
						{/if}
					</div>
				</form>
			</Card.Content>
		</Card.Root>

		<div class="space-y-4">
			{#if !productionId}
				<Card.Root class="border-dashed">
					<Card.Content class="py-12 text-center text-sm text-muted-foreground">
						Pick a production to see how its equipment prices out.
					</Card.Content>
				</Card.Root>
			{:else if readiness}
				{@const r = readiness}
				{#if blockers === 0}
					<Card.Root>
						<Card.Header>
							<Card.Title>Ready to bill</Card.Title>
							<Card.Description>
								Every booked item has a net purchase price and a category rate.
							</Card.Description>
						</Card.Header>
						<Card.Content>
							<p class="text-sm">
								{plural(r.pricedLineCount, ['# line item', '# line items'])} · {money(
									r.pricedDailyTotal
								)} per day before discount and VAT.
							</p>
						</Card.Content>
					</Card.Root>
				{:else}
					<Card.Root>
						<Card.Header>
							<Card.Title>Missing pricing data</Card.Title>
							<Card.Description>
								An offer bills each item as a percentage of its net purchase price, so these have
								nothing to bill from. Set them here — the values are stored on the equipment itself,
								not just on this offer.
							</Card.Description>
						</Card.Header>
						<Card.Content>
							<MissingPricing query={readinessQuery!} />
						</Card.Content>
					</Card.Root>
				{/if}
			{/if}
		</div>
	</div>
</div>
