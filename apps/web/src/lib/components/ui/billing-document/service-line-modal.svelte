<script lang="ts">
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Modal } from '$lib/components/ui/modal';
	import { getErrorMessage } from '$lib/utils';
	import { getServiceCatalog } from '$lib/remote/service-catalog.remote';
	import { addServiceLine, updateServiceLine } from '$lib/remote/offers.remote';
	import {
		SERVICE_UNITS,
		isServiceUnit,
		serviceLineTotal,
		serviceUnitLabel,
		type ServiceUnit
	} from '$lib/service-lines.svelte';
	import type { EditedServiceLine, ServiceLineTarget } from './types';

	let {
		open = $bindable(false),
		target,
		dayCount,
		line = null
	}: {
		open: boolean;
		target: ServiceLineTarget;
		dayCount: number;
		/** The line being edited; null adds a new one. */
		line?: EditedServiceLine | null;
	} = $props();

	let catalogQuery = $derived(getServiceCatalog(target.organizationId));
	let catalog = $derived(catalogQuery.current ?? []);
	let services = $derived(catalog.flatMap((category) => category.services));
	// A line whose price-list entry has been deleted since counts as typed in.
	let fromCatalog = $derived(services.some((service) => service.id === serviceId));

	let serviceId = $state('');
	let name = $state('');
	let note = $state('');
	let categoryId = $state('');
	// A number input binds a number once typed into, and a string until then.
	let quantity = $state<string | number>('1');
	let unit = $state<ServiceUnit>('hour');
	let unitPrice = $state<string | number>('');
	let perDay = $state(false);
	let saveToCatalog = $state(false);
	let saving = $state(false);

	// Filled once per opening, from the line or blank — not on every catalog
	// refresh, which would throw away what is being typed.
	let filledFor = $state<string | null>(null);
	$effect(() => {
		if (!open) {
			filledFor = null;
			return;
		}
		const key = line?.id ?? 'new';
		if (filledFor === key) return;
		filledFor = key;
		serviceId = line?.serviceId ?? '';
		name = line?.name ?? '';
		note = line?.note ?? '';
		categoryId = line?.categoryId ?? '';
		quantity = line ? String(line.quantity) : '1';
		unit = isServiceUnit(line?.unit) ? line.unit : 'hour';
		unitPrice = line ? String(line.unitPrice) : '';
		perDay = line?.perDay ?? false;
		saveToCatalog = false;
	});

	// A new line lands in the first section until one is chosen.
	$effect(() => {
		if (open && !categoryId && catalog.length > 0) categoryId = catalog[0].id;
	});

	/** Picking a catalog entry copies it in; every field stays editable. */
	function pick(id: string) {
		serviceId = id;
		const service = services.find((s) => s.id === id);
		if (!service) return;
		name = service.name;
		categoryId = service.categoryId;
		unit = isServiceUnit(service.unit) ? service.unit : 'flat';
		unitPrice = String(Number(service.unitPrice));
		perDay = service.perDay;
	}

	// A line whose section has since been deleted keeps it until moved.
	let orphanedCategory = $derived(
		line?.categoryId && !catalog.some((category) => category.id === line.categoryId)
			? line.categoryId
			: null
	);

	let valid = $derived(
		name.trim() !== '' &&
			categoryId !== '' &&
			Number(quantity) > 0 &&
			String(unitPrice).trim() !== '' &&
			Number(unitPrice) >= 0
	);
	let total = $derived(
		valid ? serviceLineTotal(Number(quantity), Number(unitPrice), perDay, dayCount) : null
	);

	function fmtEUR(n: number): string {
		return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	async function save(e: Event) {
		e.preventDefault();
		if (!valid) return;
		saving = true;
		const input = {
			serviceId: fromCatalog ? serviceId : undefined,
			name: name.trim(),
			note: note.trim() || undefined,
			categoryId,
			quantity: Number(quantity),
			unit,
			unitPrice: Number(unitPrice),
			perDay,
			saveToCatalog: !fromCatalog && saveToCatalog
		};
		try {
			if (line) await updateServiceLine({ kind: target.kind, lineId: line.id, ...input });
			else await addServiceLine({ kind: target.kind, documentId: target.documentId, ...input });
			toast.success(line ? 'Service updated' : 'Service added');
			open = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving = false;
		}
	}

	const selectClass =
		'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-none';
</script>

<Modal bind:open title={line ? 'Edit service' : 'Add service'} size="lg" dismissible={!saving}>
	{#snippet children()}
		{#if catalogQuery.ready && catalog.length === 0}
			<p class="text-sm text-muted-foreground">
				A service goes into one of your organization's service categories, such as Personal or
				Transport. Set them up under
				<a
					href={resolve(`/orgs/${target.organizationId}/rates`)}
					class="underline underline-offset-2 hover:text-foreground">Rates & services</a
				>
				first.
			</p>
		{:else}
			<form id="service-line-form" class="space-y-4" onsubmit={save}>
				{#if services.length > 0}
					<div class="space-y-2">
						<Label for="service-pick">From the price list</Label>
						<select
							id="service-pick"
							class={selectClass}
							value={fromCatalog ? serviceId : ''}
							onchange={(e) => pick((e.target as HTMLSelectElement).value)}
						>
							<option value="">Custom</option>
							{#each catalog as category (category.id)}
								{#if category.services.length > 0}
									<optgroup label={category.name}>
										{#each category.services as service (service.id)}
											<option value={service.id}>{service.name}</option>
										{/each}
									</optgroup>
								{/if}
							{/each}
						</select>
					</div>
				{/if}
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="service-name">Name</Label>
						<Input id="service-name" bind:value={name} required />
					</div>
					<div class="space-y-2">
						<Label for="service-category">Section</Label>
						<select id="service-category" class={selectClass} bind:value={categoryId}>
							{#if orphanedCategory}
								<option value={orphanedCategory}>(deleted section)</option>
							{/if}
							{#each catalog as category (category.id)}
								<option value={category.id}>{category.name}</option>
							{/each}
						</select>
					</div>
				</div>
				<div class="space-y-2">
					<Label for="service-note">Note</Label>
					<textarea
						id="service-note"
						bind:value={note}
						rows="2"
						placeholder="Optional, printed under the name"
						class="w-full rounded-md border bg-background px-3 py-2 text-sm"></textarea>
				</div>
				<div class="grid gap-4 sm:grid-cols-3">
					<div class="space-y-2">
						<Label for="service-quantity">Quantity</Label>
						<Input
							id="service-quantity"
							type="number"
							min="0.01"
							step="0.01"
							bind:value={quantity}
							required
						/>
					</div>
					<div class="space-y-2">
						<Label for="service-unit">Unit</Label>
						<select id="service-unit" class={selectClass} bind:value={unit}>
							{#each SERVICE_UNITS as option (option)}
								<option value={option}>{serviceUnitLabel(option)}</option>
							{/each}
						</select>
					</div>
					<div class="space-y-2">
						<Label for="service-price">Unit price (€, net)</Label>
						<Input
							id="service-price"
							type="number"
							min="0"
							step="0.01"
							bind:value={unitPrice}
							required
						/>
					</div>
				</div>
				<label class="flex items-start gap-2 text-sm">
					<input type="checkbox" bind:checked={perDay} class="mt-0.5" />
					<span>
						Per day
						<span class="block text-xs text-muted-foreground"
							>Multiplied by the document's day count ({dayCount}) as well, and follows it when it
							changes.</span
						>
					</span>
				</label>
				{#if !fromCatalog}
					<label class="flex items-start gap-2 text-sm">
						<input type="checkbox" bind:checked={saveToCatalog} class="mt-0.5" />
						<span>
							Save to price list
							<span class="block text-xs text-muted-foreground"
								>Keeps name, section, unit and price as a service to pick next time. The quantity
								and note stay on this line only.</span
							>
						</span>
					</label>
				{/if}
				{#if total !== null}
					<p class="text-sm">Line total: <span class="font-semibold">{fmtEUR(total)}</span></p>
				{/if}
			</form>
		{/if}
	{/snippet}

	{#snippet footer()}
		<Button icon="close" variant="outline" disabled={saving} onclick={() => (open = false)}>
			Cancel
		</Button>
		<Button icon="save" type="submit" form="service-line-form" disabled={saving || !valid}>
			{saving ? 'Saving…' : 'Save'}
		</Button>
	{/snippet}
</Modal>
