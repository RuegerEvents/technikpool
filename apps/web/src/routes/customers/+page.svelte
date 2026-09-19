<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import {
		CustomerFormModal,
		type CustomerWithAddress
	} from '$lib/components/ui/customer-form-modal';
	import { getCustomers } from '$lib/remote/customers.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { page } from '$app/state';
	import { ROLE_FOR, canWrite, roleAtLeast } from '$lib/roles';
	import { customerLabel, formatAddress, orgLabel } from '$lib/utils';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';

	// Read through the query rather than awaited: `await` in a `$derived`
	// suspends the whole component until it answers, heading and all. See
	// CLAUDE.md, "Loading states".
	// Customers are the business, not the equipment: an org someone only sees
	// the devices of would answer with a refusal, so it isn't offered.
	let orgsQuery = $derived(getMyOrgs());
	let orgs = $derived(
		(orgsQuery.current ?? []).filter(
			(org) => page.data.isAdmin || roleAtLeast(org.role, ROLE_FOR.read)
		)
	);
	let organizationId = $state('');
	$effect(() => {
		if (!organizationId && orgs[0]) organizationId = orgs[0].id;
	});
	let customersQuery = $derived(organizationId ? getCustomers(organizationId) : null);
	let customers = $derived(customersQuery?.current ?? []);
	// A VIEWER reads the list; changing it takes MEMBER, like the server asks.
	let canEdit = $derived(
		page.data.isAdmin || !!orgs.find((org) => org.id === organizationId && canWrite(org))
	);

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
			{#if canEdit}
				<Button icon="add" onclick={() => openCustomer(null)}>New customer</Button>
			{/if}
		</div>
	</div>

	<Card.Root>
		<Card.Header><Card.Title>Customer list</Card.Title></Card.Header>
		<Card.Content class="space-y-2">
			{#if !customersQuery?.ready}
				<ContentSkeleton count={4} error={customersQuery?.error} />
			{:else}
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
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<CustomerFormModal
	bind:open={modalOpen}
	{organizationId}
	customer={editing}
	allowDelete
	readonly={!canEdit}
	idPrefix="customer-management"
/>
