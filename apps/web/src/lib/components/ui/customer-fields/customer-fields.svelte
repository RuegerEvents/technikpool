<script lang="ts" module>
	import type { AddressValue } from '#lib/components/ui/address-input/index.js';

	export type CustomerDraft = {
		companyName: string;
		contactPerson: string;
		soleProprietor: boolean;
		email: string;
		customerNumber: string;
		phone: string;
		vatId: string;
		address: AddressValue;
	};

	export function emptyCustomerDraft(): CustomerDraft {
		return {
			companyName: '',
			contactPerson: '',
			soleProprietor: false,
			email: '',
			customerNumber: '',
			phone: '',
			vatId: '',
			address: { line1: '', line2: '', postalCode: '', city: '' }
		};
	}
</script>

<script lang="ts">
	// Creating a customer inline, on the way to something else — a production or
	// an offer. Both places asked for exactly these fields in exactly this
	// layout, and both kept them in two pieces of state (the three inputs, then
	// the address) that always travelled together; here they are one draft.
	//
	// Deliberately just the fields: whether a customer is being created at all,
	// and what happens to the id afterwards, differ between the two callers and
	// stay theirs.
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { AddressInput } from '#lib/components/ui/address-input/index.js';

	type Props = {
		value?: CustomerDraft;
		/** Distinct per instance — two of these on one page would share label targets. */
		idPrefix?: string;
	};

	let { value = $bindable(emptyCustomerDraft()), idPrefix = 'cust' }: Props = $props();
</script>

<div class="space-y-4 rounded-md border p-4">
	<div class="grid gap-4 sm:grid-cols-2">
		<div class="space-y-2">
			<Label for="{idPrefix}-company">Company name</Label>
			<Input id="{idPrefix}-company" bind:value={value.companyName} />
		</div>
		<div class="space-y-2">
			<Label for="{idPrefix}-contact">Contact person</Label>
			<Input id="{idPrefix}-contact" bind:value={value.contactPerson} />
		</div>
		<label class="flex cursor-pointer items-start gap-2 text-sm select-none sm:col-span-2">
			<input
				type="checkbox"
				bind:checked={value.soleProprietor}
				class="mt-0.5 h-4 w-4 rounded border-input"
			/>
			<span>
				Sole proprietor
				<span class="block text-muted-foreground">
					Documents are addressed to the contact person, with the company name beneath.
				</span>
			</span>
		</label>
		<div class="space-y-2 sm:col-span-2">
			<Label for="{idPrefix}-email">Email</Label>
			<Input id="{idPrefix}-email" type="email" bind:value={value.email} />
		</div>
		<div class="space-y-2">
			<Label for="{idPrefix}-number">Customer number</Label>
			<Input id="{idPrefix}-number" bind:value={value.customerNumber} />
		</div>
		<div class="space-y-2">
			<Label for="{idPrefix}-phone">Phone</Label>
			<Input id="{idPrefix}-phone" type="tel" bind:value={value.phone} />
		</div>
		<div class="space-y-2 sm:col-span-2">
			<Label for="{idPrefix}-vat">VAT ID</Label>
			<Input id="{idPrefix}-vat" bind:value={value.vatId} />
		</div>
	</div>
	<AddressInput bind:value={value.address} idPrefix="{idPrefix}-addr" />
</div>
