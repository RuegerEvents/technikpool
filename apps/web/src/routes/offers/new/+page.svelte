<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { AddressInput } from '$lib/components/ui/address-input';
	import { CustomerFields, emptyCustomerDraft } from '$lib/components/ui/customer-fields';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { setOrgCategoryRate } from '$lib/remote/orgs.remote';
	import { getProduction, getProductions } from '$lib/remote/productions.remote';
	import { getCustomers, createCustomer } from '$lib/remote/customers.remote';
	import { updateProduct } from '$lib/remote/assets.remote';
	import {
		createOfferFromProduction,
		getProductionBillingReadiness
	} from '$lib/remote/offers.remote';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { customerLabel, formatAddress, getErrorMessage, orgLabel, plural } from '$lib/utils';
	import { localizedName } from '$lib/category';

	const preselectedProductionId = page.url.searchParams.get('productionId');

	let orgs = $derived(await getMyOrgs());
	let selectedOrgId = $state('');
	let productions = $derived(selectedOrgId ? await getProductions(selectedOrgId) : []);

	let productionId = $state('');
	let customerId = $state('');
	let customerName = $state('');
	let customerContactPerson = $state('');
	let customerEmail = $state('');
	let customerAddress = $state({ line1: '', line2: '', postalCode: '', city: '' });
	let assetScope = $state<'ALL' | 'OWN_ORG_ONLY'>('ALL');
	let saving = $state(false);

	let customers = $derived(selectedOrgId ? await getCustomers(selectedOrgId) : []);
	let creatingCustomer = $state(false);
	let newCustomer = $state(emptyCustomerDraft());

	// One line per bundle among a group's units, so a kit that could be priced
	// as a whole says so once rather than under every unit in it.
	function bundleHints(assets: { bundleId: string | null; bundleName: string | null }[]) {
		const hints: { bundleId: string; bundleName: string }[] = [];
		for (const a of assets) {
			if (!a.bundleId || !a.bundleName) continue;
			if (hints.some((h) => h.bundleId === a.bundleId)) continue;
			hints.push({ bundleId: a.bundleId, bundleName: a.bundleName });
		}
		return hints;
	}

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
	let hasCrossOrgItems = $derived(
		!!selectedProduction &&
			selectedProduction.items.some(
				(i) => i.asset.organizationId !== selectedProduction!.organizationId
			)
	);

	// Which equipment can't be priced yet. The offer is generated from the
	// production's booking, so a single asset without a purchase price would
	// otherwise only surface as a failed creation — here it's a list with an
	// input next to it.
	let effectiveScope = $derived<'ALL' | 'OWN_ORG_ONLY'>(hasCrossOrgItems ? assetScope : 'ALL');
	let readinessArgs = $derived({ productionId, assetScope: effectiveScope });
	let readiness = $derived(
		productionId ? await getProductionBillingReadiness(readinessArgs) : null
	);
	let blockers = $derived(
		readiness ? readiness.missingPrices.length + readiness.missingRates.length : 0
	);

	let priceDrafts = new SvelteMap<string, string>();
	let rateDrafts = new SvelteMap<string, string>();
	let pending = new SvelteSet<string>();

	$effect(() => {
		if (!preselectedProductionId || selectedOrgId) return;
		getProduction(preselectedProductionId).then((p) => {
			selectedOrgId = p.organizationId;
			productionId = p.id;
		});
	});

	$effect(() => {
		if (!productionId) return;
		getProduction(productionId).then((p) => {
			const c = p.customer;
			customerId = c?.id ?? '';
			applyCustomerSnapshot(c);
		});
	});

	function handleSelectCustomer(e: Event) {
		customerId = (e.currentTarget as HTMLSelectElement).value;
		applyCustomerSnapshot(customers.find((c) => c.id === customerId) ?? null);
	}

	async function handleSavePrice(group: { key: string; productId: string; label: string }) {
		const raw = priceDrafts.get(group.key)?.trim();
		if (!raw) {
			toast.error('Enter a net purchase price first');
			return;
		}
		const netPurchasePrice = Number(raw);
		if (!Number.isFinite(netPurchasePrice) || netPurchasePrice < 0) {
			toast.error('Enter a valid net purchase price');
			return;
		}
		pending.add(group.key);
		try {
			const args = readinessArgs;
			await updateProduct({ productId: group.productId, netPurchasePrice });
			priceDrafts.delete(group.key);
			await getProductionBillingReadiness(args).refresh();
			toast.success(`Price saved on ${group.label}`);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			pending.delete(group.key);
		}
	}

	async function handleSaveRate(orgId: string, categoryId: string) {
		const raw = rateDrafts.get(categoryId)?.trim();
		if (!raw) {
			toast.error('Enter a rental rate first');
			return;
		}
		const percentage = Number(raw);
		if (!Number.isFinite(percentage) || percentage < 0) {
			toast.error('Enter a valid rental rate');
			return;
		}
		pending.add(categoryId);
		try {
			const args = readinessArgs;
			await setOrgCategoryRate({ orgId, categoryId, percentage });
			rateDrafts.delete(categoryId);
			await getProductionBillingReadiness(args).refresh();
			toast.success('Rate saved');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			pending.delete(categoryId);
		}
	}

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
		saving = true;
		try {
			let finalCustomerId = customerId || undefined;
			let finalCustomerName = customerName;
			let finalCustomerContactPerson = customerContactPerson;
			let finalCustomerEmail = customerEmail;
			let finalCustomerAddress = customerAddress;
			if (creatingCustomer) {
				const created = await createCustomer({
					organizationId: selectedOrgId,
					companyName: newCustomer.companyName || undefined,
					contactPerson: newCustomer.contactPerson || undefined,
					email: newCustomer.email || undefined,
					address: newCustomer.address
				});
				finalCustomerId = created.id;
				finalCustomerName = customerLabel(created);
				finalCustomerContactPerson = newCustomer.contactPerson;
				finalCustomerEmail = newCustomer.email;
				finalCustomerAddress = newCustomer.address;
			}
			const offer = await createOfferFromProduction({
				productionId,
				customerId: finalCustomerId,
				customerName: finalCustomerName,
				customerAddress: formatAddress(finalCustomerAddress) || undefined,
				customerContactPerson: finalCustomerContactPerson || undefined,
				customerEmail: finalCustomerEmail || undefined,
				assetScope: hasCrossOrgItems ? assetScope : undefined
			});
			toast.success('Offer created');
			goto(resolve(`/offers/${offer.id}`));
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
									<option value={p.id}>{p.name} ({p.items.length} items)</option>
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

					<div class="space-y-3">
						<Label>Customer</Label>
						{#if !creatingCustomer}
							<div class="space-y-2">
								<select
									id="customer"
									value={customerId}
									onchange={handleSelectCustomer}
									class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
								>
									<option value="">— None —</option>
									{#each customers as c (c.id)}
										<option value={c.id}>{customerLabel(c)}</option>
									{/each}
								</select>
								<Button
									type="button"
									variant="outline"
									onclick={() => {
										creatingCustomer = true;
										customerId = '';
									}}
								>
									+ New customer
								</Button>
							</div>

							<div class="space-y-2">
								<Label for="customerName">Customer name</Label>
								<Input id="customerName" bind:value={customerName} required />
							</div>
							<div class="space-y-2">
								<Label for="customerContactPerson">Contact person</Label>
								<Input
									id="customerContactPerson"
									bind:value={customerContactPerson}
									placeholder="Optional"
								/>
							</div>
							<div class="space-y-2">
								<Label for="customerEmail">Email</Label>
								<Input
									id="customerEmail"
									type="email"
									bind:value={customerEmail}
									placeholder="Optional"
								/>
							</div>
							<div class="space-y-2">
								<Label>Customer address</Label>
								<AddressInput bind:value={customerAddress} idPrefix="customerAddress" />
							</div>
						{:else}
							<div class="space-y-4">
								<CustomerFields bind:value={newCustomer} idPrefix="offer-cust" />
								<Button
									icon="close"
									type="button"
									variant="outline"
									onclick={() => (creatingCustomer = false)}
								>
									Cancel new customer
								</Button>
							</div>
						{/if}
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
						<Card.Content class="space-y-6">
							{#if r.missingRates.length > 0}
								<div class="space-y-3">
									<h3 class="text-sm font-medium">
										{plural(r.missingRates.length, [
											'# category has no rental rate',
											'# categories have no rental rate'
										])}
									</h3>
									{#each r.missingRates as rate (rate.categoryId)}
										<div
											class="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
										>
											<div>
												<p class="font-medium">
													{localizedName(rate.categoryName, rate.categoryNameDe)}
												</p>
												<p class="text-sm text-muted-foreground">
													Daily rate, as a percentage of the net purchase price.
												</p>
											</div>
											{#if r.canEditRates}
												<div class="flex items-center gap-2">
													<Input
														type="number"
														min="0"
														step="0.01"
														class="w-24 text-right"
														value={rateDrafts.get(rate.categoryId) ?? ''}
														oninput={(e) => {
															rateDrafts.set(rate.categoryId, (e.target as HTMLInputElement).value);
														}}
													/>
													<span class="text-sm text-muted-foreground">% / day</span>
													<Button
														icon="save"
														size="sm"
														variant="outline"
														disabled={pending.has(rate.categoryId) ||
															!rateDrafts.get(rate.categoryId)}
														onclick={() => handleSaveRate(r.organizationId, rate.categoryId)}
													>
														Save
													</Button>
												</div>
											{:else}
												<p class="text-sm text-muted-foreground">
													Ask an owner of this organization to set it.
												</p>
											{/if}
										</div>
									{/each}
								</div>
							{/if}

							{#if r.missingPrices.length > 0}
								<div class="space-y-3">
									<h3 class="text-sm font-medium">
										{plural(r.missingPrices.length, [
											'# product has no net purchase price',
											'# products have no net purchase price'
										])}
									</h3>
									{#each r.missingPrices as group (group.key)}
										<div class="space-y-3 rounded-md border p-3">
											<div class="flex flex-wrap items-start justify-between gap-3">
												<div class="min-w-0">
													<p class="font-medium">{group.label}</p>
													<p class="flex items-center gap-1.5 text-sm text-muted-foreground">
														<span
															class="h-2 w-2 shrink-0 rounded-full"
															style="background-color: {group.categoryColor}"
														></span>
														{localizedName(group.categoryName, group.categoryNameDe)} ·
														{plural(group.assets.length, ['# unit', '# units'])} ·
														{group.organizationNames.join(', ')}
													</p>
												</div>
												{#if r.canEditPrices}
													<div class="flex items-center gap-2">
														<Input
															type="number"
															min="0"
															step="0.01"
															placeholder="0.00"
															class="w-28 text-right"
															value={priceDrafts.get(group.key) ?? ''}
															oninput={(e) => {
																priceDrafts.set(group.key, (e.target as HTMLInputElement).value);
															}}
														/>
														<span class="text-sm text-muted-foreground">€ net</span>
														<Button
															icon="save"
															size="sm"
															variant="outline"
															disabled={pending.has(group.key) || !priceDrafts.get(group.key)}
															onclick={() => handleSavePrice(group)}
														>
															Save
														</Button>
													</div>
												{/if}
											</div>

											<div class="flex flex-wrap gap-1.5">
												{#each group.assets as asset (asset.id)}
													<a
														href={resolve(`/assets/${asset.id}`)}
														target="_blank"
														class="rounded border px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted"
													>
														{asset.label}
													</a>
												{/each}
											</div>

											{#if r.canEditPrices}
												<p class="text-sm text-muted-foreground">
													The price belongs to the product, so it covers every unit of it — here and
													in every other offer.
												</p>
											{:else}
												<p class="text-sm text-muted-foreground">
													You need admin rights in an organization to price a product.
												</p>
											{/if}

											{#each bundleHints(group.assets) as hint (hint.bundleId)}
												<p class="text-sm text-muted-foreground">
													In bundle
													<a
														href={resolve(`/assets/bundles/${hint.bundleId}`)}
														target="_blank"
														class="underline underline-offset-2">{hint.bundleName}</a
													>, which has no price of its own. Pricing that bundle bills it as one line
													instead.
												</p>
											{/each}
										</div>
									{/each}
								</div>
							{/if}
						</Card.Content>
					</Card.Root>
				{/if}
			{/if}
		</div>
	</div>
</div>
