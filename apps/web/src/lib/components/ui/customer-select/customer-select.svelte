<script lang="ts">
	// Pick the customer a production or billing document belongs to: a select
	// over the org's customers plus the shared create/edit dialog, so every
	// caller offers the same three moves — choose one, register a new one,
	// correct the chosen one — without carrying its own form.
	import { Button } from '$lib/components/ui/button';
	import {
		CustomerFormModal,
		type CustomerWithAddress
	} from '$lib/components/ui/customer-form-modal';
	import { getCustomers } from '$lib/remote/customers.remote';
	import { customerLabel } from '$lib/utils';

	type Props = {
		organizationId: string;
		/** The selected customer id; '' means none. */
		value: string;
		/** Offer a "— None —" choice. Off where the document needs a recipient. */
		allowNone?: boolean;
		id?: string;
		/** Distinct per instance — two of these on one page would share label targets. */
		idPrefix?: string;
		/** Fires with the full record on every change, including after create/edit. */
		onChange?: (customer: CustomerWithAddress | null) => void;
	};

	let {
		organizationId,
		value = $bindable(''),
		allowNone = false,
		id = 'customer',
		idPrefix = 'customer-select',
		onChange
	}: Props = $props();

	let customers = $derived(organizationId ? await getCustomers(organizationId) : []);
	let selected = $derived(customers.find((c) => c.id === value) ?? null);

	let modalOpen = $state(false);
	let editing = $state<CustomerWithAddress | null>(null);

	function handleSelect(e: Event) {
		value = (e.currentTarget as HTMLSelectElement).value;
		onChange?.(customers.find((c) => c.id === value) ?? null);
	}
</script>

<div class="flex gap-2">
	<select
		{id}
		{value}
		onchange={handleSelect}
		class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
	>
		{#if allowNone}
			<option value="">— None —</option>
		{:else}
			<option value="" disabled>Select a customer</option>
		{/if}
		{#each customers as c (c.id)}
			<option value={c.id}>{customerLabel(c)}</option>
		{/each}
	</select>
	<Button
		icon="add"
		type="button"
		variant="outline"
		title="New customer"
		onclick={() => {
			editing = null;
			modalOpen = true;
		}}
	>
		New
	</Button>
	<Button
		icon="edit"
		type="button"
		variant="outline"
		title="Edit customer"
		disabled={!selected}
		onclick={() => {
			editing = selected;
			modalOpen = true;
		}}
	>
		Edit
	</Button>
</div>

<CustomerFormModal
	bind:open={modalOpen}
	{organizationId}
	customer={editing}
	{idPrefix}
	onSaved={(c) => {
		value = c.id;
		onChange?.(c);
	}}
/>
