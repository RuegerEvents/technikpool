<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	export type AddressValue = {
		/** The place's own name, when the address belongs to one (a venue). */
		name?: string;
		line1: string;
		line2: string;
		postalCode: string;
		city: string;
	};

	type Props = {
		value?: AddressValue;
		idPrefix?: string;
		/** Adds a name field above line 1 — for a venue, whose name is part of the address. */
		withName?: boolean;
	};

	let {
		value = $bindable({ line1: '', line2: '', postalCode: '', city: '' }),
		idPrefix = 'addr',
		withName = false
	}: Props = $props();
</script>

<div class="grid gap-4 sm:grid-cols-2">
	{#if withName}
		<div class="space-y-2 sm:col-span-2">
			<Label for="{idPrefix}-name">Venue name</Label>
			<Input
				id="{idPrefix}-name"
				bind:value={value.name}
				placeholder="Stadthalle, club, open air…"
			/>
		</div>
	{/if}
	<div class="space-y-2 sm:col-span-2">
		<Label for="{idPrefix}-line1">Address line 1</Label>
		<Input id="{idPrefix}-line1" bind:value={value.line1} placeholder="Street and number" />
	</div>
	<div class="space-y-2 sm:col-span-2">
		<Label for="{idPrefix}-line2">Address line 2</Label>
		<Input id="{idPrefix}-line2" bind:value={value.line2} placeholder="Building, floor, c/o" />
	</div>
	<div class="space-y-2">
		<Label for="{idPrefix}-postal">Postal code</Label>
		<Input id="{idPrefix}-postal" bind:value={value.postalCode} placeholder="12345" />
	</div>
	<div class="space-y-2">
		<Label for="{idPrefix}-city">City</Label>
		<Input id="{idPrefix}-city" bind:value={value.city} placeholder="Berlin" />
	</div>
</div>
