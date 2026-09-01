<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import {
		CustomerFormModal,
		type CustomerWithAddress
	} from '$lib/components/ui/customer-form-modal';
	import { getCustomers } from '$lib/remote/customers.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { customerLabel, formatAddress, orgLabel } from '$lib/utils';

	let orgs = $derived(await getMyOrgs());
	let organizationId = $state('');
	$effect(() => {
		if (!organizationId && orgs[0]) organizationId = orgs[0].id;
	});
	let customers = $derived(organizationId ? await getCustomers(organizationId) : []);

	let modalOpen = $state(false);
	let editing = $state<CustomerWithAddress | null>(null);

	function openCustomer(customer: CustomerWithAddress | null) {
		editing = customer;
		modalOpen = true;
	}
</script>

<svelte:head><title>Customers | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Customers</h1>
			<p class="text-muted-foreground">Manage billing recipients and their document details.</p>
		</div>
		<div class="flex gap-2">
			<select bind:value={organizationId} class="h-10 rounded-md border bg-background px-3 text-sm">
				{#each orgs as org (org.id)}<option value={org.id}>{orgLabel(org)}</option>{/each}
			</select>
			<Button icon="add" onclick={() => openCustomer(null)}>New customer</Button>
		</div>
	</div>

	<Card.Root>
		<Card.Header><Card.Title>Customer list</Card.Title></Card.Header>
		<Card.Content class="space-y-2">
			{#each customers as customer (customer.id)}
				<button
					type="button"
					onclick={() => openCustomer(customer)}
					class="w-full rounded-md border p-3 text-left hover:bg-muted"
				>
					<div class="font-medium">{customerLabel(customer)}</div>
					<div class="text-sm text-muted-foreground">
						{customer.customerNumber ? `${customer.customerNumber} · ` : ''}{formatAddress(
							customer.address
						) ||
							customer.email ||
							'No address'}
					</div>
				</button>
			{:else}
				<p class="py-8 text-center text-sm text-muted-foreground">No customers yet.</p>
			{/each}
		</Card.Content>
	</Card.Root>
</div>

<CustomerFormModal
	bind:open={modalOpen}
	{organizationId}
	customer={editing}
	allowDelete
	idPrefix="customer-management"
/>
