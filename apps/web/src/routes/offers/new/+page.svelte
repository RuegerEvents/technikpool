<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { AddressInput } from '$lib/components/ui/address-input';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { getProduction, getProductions } from '$lib/remote/productions.remote';
	import { getCustomers, createCustomer } from '$lib/remote/customers.remote';
	import { createOfferFromProduction } from '$lib/remote/offers.remote';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { formatAddress, getErrorMessage, orgLabel } from '$lib/utils';

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
	let newCustomer = $state({ companyName: '', contactPerson: '', email: '' });
	let newCustomerAddress = $state({ line1: '', line2: '', postalCode: '', city: '' });

	function customerLabel(c: { companyName: string | null; contactPerson: string | null }) {
		return c.companyName || c.contactPerson || 'Unnamed customer';
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

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!productionId) {
			toast.error('Please select a production');
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
					address: newCustomerAddress
				});
				finalCustomerId = created.id;
				finalCustomerName = customerLabel(created);
				finalCustomerContactPerson = newCustomer.contactPerson;
				finalCustomerEmail = newCustomer.email;
				finalCustomerAddress = newCustomerAddress;
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

	<Card.Root class="max-w-xl">
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
						<div class="space-y-4 rounded-md border p-4">
							<div class="grid gap-4 sm:grid-cols-2">
								<div class="space-y-2">
									<Label for="cust-company">Company name</Label>
									<Input id="cust-company" bind:value={newCustomer.companyName} />
								</div>
								<div class="space-y-2">
									<Label for="cust-contact">Contact person</Label>
									<Input id="cust-contact" bind:value={newCustomer.contactPerson} />
								</div>
								<div class="space-y-2 sm:col-span-2">
									<Label for="cust-email">Email</Label>
									<Input id="cust-email" type="email" bind:value={newCustomer.email} />
								</div>
							</div>
							<AddressInput bind:value={newCustomerAddress} idPrefix="cust-addr" />
							<Button type="button" variant="outline" onclick={() => (creatingCustomer = false)}>
								Cancel new customer
							</Button>
						</div>
					{/if}
				</div>

				<Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Offer'}</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
