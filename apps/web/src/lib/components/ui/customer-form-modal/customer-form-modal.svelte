<script lang="ts" module>
	import type { Prisma } from '$lib/prisma/client';

	export type CustomerWithAddress = Prisma.CustomerGetPayload<{ include: { address: true } }>;
</script>

<script lang="ts">
	// The one dialog a customer is created or edited in. Every page that used
	// to carry its own copy of these fields — the customers page, the two "new
	// document" forms, the offer/invoice customer editors — opens this instead,
	// so the record always gets the full structured form (including a real
	// address, not one line for the whole thing).
	import { Button } from '$lib/components/ui/button';
	import { Modal } from '$lib/components/ui/modal';
	import {
		CustomerFields,
		emptyCustomerDraft,
		type CustomerDraft
	} from '$lib/components/ui/customer-fields';
	import { createCustomer, updateCustomer, deleteCustomer } from '$lib/remote/customers.remote';
	import { getErrorMessage } from '$lib/utils';
	import { toast } from 'svelte-sonner';

	type Props = {
		open: boolean;
		organizationId: string;
		/** The record to edit; null creates a new one. */
		customer?: CustomerWithAddress | null;
		/** Offer deletion — only where managing the customer list is the point. */
		allowDelete?: boolean;
		/** Distinct per instance — two of these on one page would share label targets. */
		idPrefix?: string;
		onSaved?: (customer: CustomerWithAddress) => void;
		onDeleted?: () => void;
	};

	let {
		open = $bindable(false),
		organizationId,
		customer = null,
		allowDelete = false,
		idPrefix = 'customer-modal',
		onSaved,
		onDeleted
	}: Props = $props();

	let draft = $state<CustomerDraft>(emptyCustomerDraft());
	let saving = $state(false);
	let deleting = $state(false);

	// Reseed on every open: one mounted instance serves create and edit back
	// to back, so the draft can't be trusted to still match the prop.
	$effect(() => {
		if (!open) return;
		draft = customer
			? {
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
				}
			: emptyCustomerDraft();
	});

	async function save(e: Event) {
		e.preventDefault();
		if (!draft.companyName.trim() && !draft.contactPerson.trim()) {
			toast.error('Enter a company or contact person');
			return;
		}
		saving = true;
		const wasExisting = customer !== null;
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
			const saved = customer
				? await updateCustomer({ customerId: customer.id, ...data })
				: await createCustomer({ organizationId, ...data });
			toast.success(wasExisting ? 'Customer saved' : 'Customer created');
			open = false;
			onSaved?.(saved);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving = false;
		}
	}

	async function remove() {
		if (!customer || !confirm('Delete this customer? Existing documents keep their snapshot.'))
			return;
		deleting = true;
		try {
			await deleteCustomer(customer.id);
			toast.success('Customer deleted');
			open = false;
			onDeleted?.();
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			deleting = false;
		}
	}
</script>

<Modal
	bind:open
	title={customer ? 'Edit customer' : 'New customer'}
	size="xl"
	dismissible={!saving && !deleting}
>
	{#snippet description()}
		These values are copied into new offers and invoices.
	{/snippet}

	<form class="space-y-4" onsubmit={save}>
		<CustomerFields bind:value={draft} {idPrefix} />
	</form>

	{#snippet footer()}
		{#if allowDelete && customer}
			<Button
				icon="delete"
				variant="destructive"
				class="mr-auto"
				disabled={saving || deleting}
				onclick={remove}
			>
				{deleting ? 'Deleting…' : 'Delete'}
			</Button>
		{/if}
		<Button
			icon="close"
			variant="outline"
			disabled={saving || deleting}
			onclick={() => (open = false)}
		>
			Cancel
		</Button>
		<Button icon="save" disabled={saving || deleting} onclick={save}>
			{saving ? 'Saving…' : customer ? 'Save customer' : 'Create customer'}
		</Button>
	{/snippet}
</Modal>
