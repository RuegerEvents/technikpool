<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	export type AddressValue = {
		line1: string;
		line2: string;
		postalCode: string;
		city: string;
	};

	type Props = {
		value?: AddressValue;
		idPrefix?: string;
	};

	let {
		value = $bindable({ line1: '', line2: '', postalCode: '', city: '' }),
		idPrefix = 'addr'
	}: Props = $props();
</script>

<div class="grid gap-4 sm:grid-cols-2">
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
