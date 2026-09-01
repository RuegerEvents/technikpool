<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import {
		CustomerFields,
		emptyCustomerDraft,
		type CustomerDraft
	} from '$lib/components/ui/customer-fields';
	import {
		createCustomer,
		deleteCustomer,
		getCustomers,
		updateCustomer
	} from '$lib/remote/customers.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { customerLabel, formatAddress, getErrorMessage, orgLabel } from '$lib/utils';
	import { toast } from 'svelte-sonner';

	let orgs = $derived(await getMyOrgs());
	let organizationId = $state('');
	$effect(() => {
		if (!organizationId && orgs[0]) organizationId = orgs[0].id;
	});
	let customers = $derived(organizationId ? await getCustomers(organizationId) : []);
	let selectedId = $state<string | null>(null);
	let draft = $state<CustomerDraft>(emptyCustomerDraft());
	let saving = $state(false);

	function selectCustomer(customer: (typeof customers)[number]) {
		selectedId = customer.id;
		draft = {
			companyName: customer.companyName ?? '',
			contactPerson: customer.contactPerson ?? '',
			email: customer.email ?? '',
			customerNumber: customer.customerNumber ?? '',
			phone: customer.phone ?? '',
			vatId: customer.vatId ?? '',
			address: {
				line1: customer.address?.line1 ?? '',
				line2: customer.address?.line2 ?? '',
				postalCode: customer.address?.postalCode ?? '',
				city: customer.address?.city ?? ''
			}
		};
	}

	function newCustomer() {
		selectedId = null;
		draft = emptyCustomerDraft();
	}

	async function save(event: Event) {
		event.preventDefault();
		if (!draft.companyName.trim() && !draft.contactPerson.trim()) {
			toast.error('Enter a company or contact person');
			return;
		}
		saving = true;
		const wasExisting = selectedId !== null;
		try {
			const data = {
				companyName: draft.companyName || undefined,
				contactPerson: draft.contactPerson || undefined,
				email: draft.email || undefined,
				customerNumber: draft.customerNumber || undefined,
				phone: draft.phone || undefined,
				vatId: draft.vatId || undefined,
				address: draft.address
			};
			const saved = selectedId
				? await updateCustomer({ customerId: selectedId, ...data })
				: await createCustomer({ organizationId, ...data });
			selectedId = saved.id;
			toast.success(wasExisting ? 'Customer saved' : 'Customer created');
		} catch (error) {
			toast.error(getErrorMessage(error));
		} finally {
			saving = false;
		}
	}

	async function remove() {
		if (!selectedId || !confirm('Delete this customer? Existing documents keep their snapshot.'))
			return;
		try {
			await deleteCustomer(selectedId);
			newCustomer();
			toast.success('Customer deleted');
		} catch (error) {
			toast.error(getErrorMessage(error));
		}
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
			<select
				bind:value={organizationId}
				onchange={newCustomer}
				class="h-10 rounded-md border bg-background px-3 text-sm"
			>
				{#each orgs as org (org.id)}<option value={org.id}>{orgLabel(org)}</option>{/each}
			</select>
			<Button onclick={newCustomer}>New customer</Button>
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(28rem,1.2fr)]">
		<Card.Root>
			<Card.Header><Card.Title>Customer list</Card.Title></Card.Header>
			<Card.Content class="space-y-2">
				{#each customers as customer (customer.id)}
					<button
						type="button"
						onclick={() => selectCustomer(customer)}
						class="w-full rounded-md border p-3 text-left hover:bg-muted {selectedId === customer.id
							? 'border-primary bg-muted'
							: ''}"
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

		<Card.Root>
			<Card.Header>
				<Card.Title>{selectedId ? 'Edit customer' : 'New customer'}</Card.Title>
				<Card.Description>These values are copied into new offers and invoices.</Card.Description>
			</Card.Header>
			<Card.Content>
				<form class="space-y-4" onsubmit={save}>
					<CustomerFields bind:value={draft} idPrefix="customer-management" />
					<div class="flex justify-between gap-2">
						<div>
							{#if selectedId}<Button type="button" variant="destructive" onclick={remove}
									>Delete</Button
								>{/if}
						</div>
						<Button icon="save" type="submit" disabled={saving}
							>{saving ? 'Saving…' : 'Save customer'}</Button
						>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	</div>
</div>
