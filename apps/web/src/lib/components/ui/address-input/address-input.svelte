<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import { CreatableSelect } from '$lib/components/ui/creatable-select';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { getKnownAddresses, type KnownAddress } from '$lib/remote/addresses.remote';
	import { formatAddress } from '$lib/utils';

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

	// Not awaited: a form must not wait for a list of suggestions (see "Loading
	// States" in CLAUDE.md). Until it answers, an empty input shows a skeleton.
	let knownQuery = $derived(getKnownAddresses());
	let known = $derived(knownQuery.current ?? []);
	// Nothing to choose from — also when the list failed to load, because a
	// picker that never arrives must not stand between someone and the form.
	let noneKnown = $derived(!!knownQuery.error || (knownQuery.ready && known.length === 0));

	function kindLabel(kind: KnownAddress['kind']) {
		switch (kind) {
			case 'venue':
				return 'Venue';
			case 'location':
				return 'Location';
			case 'customer':
				return 'Customer';
			case 'organization':
				return 'Organization';
		}
	}

	// The whole address goes into `name` because that is the only thing the
	// picker searches: a venue is looked up by its name, a customer by street.
	let options = $derived(
		known.map((a) => ({
			id: a.id,
			name: [a.label, formatAddress(a)].filter(Boolean).join(' — '),
			hint: kindLabel(a.kind)
		}))
	);

	let hasValue = $derived(
		[value.name, value.line1, value.line2, value.postalCode, value.city].some((s) => s?.trim())
	);

	// An address is chosen, not typed: what is set shows as text, and the fields
	// only come out for one the list does not have. Both flags are the user's
	// own moves — `hasValue` alone must never pick the view, or the fields
	// would turn into text under the first keystroke.
	let manual = $state(false);
	let choosing = $state(false);
	let view = $derived<'fields' | 'picker' | 'summary' | 'waiting'>(
		manual || noneKnown
			? 'fields'
			: hasValue && !choosing
				? 'summary'
				: knownQuery.ready
					? 'picker'
					: 'waiting'
	);

	let picked = $state<{ id: string | null; name: string } | null>(null);

	const empty = (): AddressValue => ({
		...(withName ? { name: '' } : {}),
		line1: '',
		line2: '',
		postalCode: '',
		city: ''
	});

	function applyKnown(id: string | null | undefined) {
		const a = known.find((k) => k.id === id);
		picked = null;
		if (!a) return;
		// Copied, not linked: see `getKnownAddresses`.
		value = {
			...(withName ? { name: a.label } : {}),
			line1: a.line1,
			line2: a.line2,
			postalCode: a.postalCode,
			city: a.city
		};
		choosing = false;
	}

	/** "Create …" in the picker: what was typed is the start of the new address. */
	function enterNew(typed: string) {
		picked = null;
		value = { ...empty(), ...(withName ? { name: typed } : { line1: typed }) };
		manual = true;
		choosing = false;
	}
</script>

{#if view === 'waiting'}
	<ContentSkeleton shape="inline" />
{:else if view === 'summary'}
	<div class="space-y-2">
		<Label>Address</Label>
		<div class="flex items-start justify-between gap-4 rounded-md border bg-muted/30 px-3 py-2">
			<div class="min-w-0 text-sm">
				{#if value.name?.trim()}
					<p class="font-medium">{value.name}</p>
				{/if}
				{#if value.line1?.trim()}<p>{value.line1}</p>{/if}
				{#if value.line2?.trim()}<p>{value.line2}</p>{/if}
				{#if value.postalCode?.trim() || value.city?.trim()}
					<p>{value.postalCode} {value.city}</p>
				{/if}
			</div>
			<div class="flex shrink-0 gap-1">
				<Button
					icon="edit"
					type="button"
					variant="ghost"
					size="sm"
					onclick={() => (choosing = true)}
				>
					Change
				</Button>
				<Button
					icon="close"
					type="button"
					variant="ghost"
					size="sm"
					onclick={() => (value = empty())}
				>
					Remove
				</Button>
			</div>
		</div>
	</div>
{:else if view === 'picker'}
	<div class="space-y-2">
		<Label for="{idPrefix}-known">Address</Label>
		<CreatableSelect
			id="{idPrefix}-known"
			items={options}
			bind:value={picked}
			onchange={(item) => applyKnown(item?.id)}
			oncreate={enterNew}
			placeholder="Search by name, street or city…"
		/>
		<div class="flex gap-1">
			<Button
				icon="add"
				type="button"
				variant="ghost"
				size="sm"
				onclick={() => {
					manual = true;
					choosing = false;
				}}
			>
				Enter a new address
			</Button>
			{#if hasValue}
				<Button type="button" variant="ghost" size="sm" onclick={() => (choosing = false)}>
					Cancel
				</Button>
			{/if}
		</div>
	</div>
{:else}
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
		{#if !noneKnown}
			<div class="sm:col-span-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={() => {
						manual = false;
						choosing = true;
					}}
				>
					Choose an existing address
				</Button>
			</div>
		{/if}
	</div>
{/if}
