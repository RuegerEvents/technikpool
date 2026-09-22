<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { ChevronDown, ChevronUp } from '@lucide/svelte';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Modal } from '$lib/components/ui/modal';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import { getErrorMessage } from '$lib/utils';
	import {
		SERVICE_UNITS,
		isServiceUnit,
		serviceUnitLabel,
		type ServiceUnit
	} from '$lib/service-lines.svelte';
	import {
		getServiceCatalog,
		createServiceCategory,
		updateServiceCategory,
		deleteServiceCategory,
		moveServiceCategory,
		createOrgService,
		updateOrgService,
		deleteOrgService
	} from '$lib/remote/service-catalog.remote';

	let { orgId }: { orgId: string } = $props();

	let catalogQuery = $derived(getServiceCatalog(orgId));
	let catalog = $derived(catalogQuery.current ?? []);

	function fmtEUR(n: unknown): string {
		return Number(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	let busy = $state<string | null>(null);
	async function run(key: string, action: () => Promise<unknown>, success?: string) {
		busy = key;
		try {
			await action();
			if (success) toast.success(success);
			return true;
		} catch (err) {
			toast.error(getErrorMessage(err));
			return false;
		} finally {
			busy = null;
		}
	}

	// ── Category dialog ──
	let categoryOpen = $state(false);
	let categoryId = $state<string | null>(null);
	let categoryName = $state('');
	let categoryColor = $state('#a1a1aa');

	function openCategory(category?: { id: string; name: string; color: string }) {
		categoryId = category?.id ?? null;
		categoryName = category?.name ?? '';
		categoryColor = category?.color ?? '#a1a1aa';
		categoryOpen = true;
	}

	async function saveCategory(e: Event) {
		e.preventDefault();
		const data = { name: categoryName.trim(), color: categoryColor };
		const id = categoryId;
		const ok = await run(
			'category',
			() =>
				id ? updateServiceCategory({ id, ...data }) : createServiceCategory({ orgId, ...data }),
			id ? 'Category updated' : 'Category added'
		);
		if (ok) categoryOpen = false;
	}

	function removeCategory(category: { id: string; name: string; services: unknown[] }) {
		const message = category.services.length
			? `Delete "${category.name}" and its ${category.services.length} service(s)? Offers and invoices keep their lines.`
			: `Delete "${category.name}"? Offers and invoices keep their lines.`;
		if (!confirm(message)) return;
		run(category.id, () => deleteServiceCategory(category.id), 'Category deleted');
	}

	// ── Service dialog ──
	let serviceOpen = $state(false);
	let serviceId = $state<string | null>(null);
	let serviceCategoryId = $state('');
	let serviceName = $state('');
	let serviceUnit = $state<ServiceUnit>('hour');
	let servicePrice = $state<string | number>('');
	let servicePerDay = $state(false);

	function openService(
		categoryIdForNew: string,
		service?: {
			id: string;
			categoryId: string;
			name: string;
			unit: string;
			unitPrice: unknown;
			perDay: boolean;
		}
	) {
		serviceId = service?.id ?? null;
		serviceCategoryId = service?.categoryId ?? categoryIdForNew;
		serviceName = service?.name ?? '';
		serviceUnit = isServiceUnit(service?.unit) ? service.unit : 'hour';
		servicePrice = service ? String(Number(service.unitPrice)) : '';
		servicePerDay = service?.perDay ?? false;
		serviceOpen = true;
	}

	let serviceValid = $derived(
		serviceName.trim() !== '' && String(servicePrice).trim() !== '' && Number(servicePrice) >= 0
	);

	async function saveService(e: Event) {
		e.preventDefault();
		if (!serviceValid) return;
		const data = {
			categoryId: serviceCategoryId,
			name: serviceName.trim(),
			unit: serviceUnit,
			unitPrice: Number(servicePrice),
			perDay: servicePerDay
		};
		const id = serviceId;
		const ok = await run(
			'service',
			() => (id ? updateOrgService({ id, ...data }) : createOrgService(data)),
			id ? 'Service updated' : 'Service added'
		);
		if (ok) serviceOpen = false;
	}

	function removeService(service: { id: string; name: string }) {
		if (!confirm(`Delete "${service.name}"? Offers and invoices keep their lines.`)) return;
		run(service.id, () => deleteOrgService(service.id), 'Service deleted');
	}

	const selectClass =
		'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-none';
</script>

<Card.Root class="max-w-2xl">
	<Card.Header>
		<Card.Title>Services</Card.Title>
		<Card.Description>
			What you bill besides equipment, such as crew, transport or programming. Each category is a
			section on offers and invoices, in this order. A line picked from here copies the price, so
			changing it later does not touch documents that already exist.
		</Card.Description>
		<Card.Action>
			<Button size="sm" variant="outline" icon="add" onclick={() => openCategory()}>Category</Button
			>
		</Card.Action>
	</Card.Header>
	<Card.Content class="space-y-5">
		{#if !catalogQuery.ready}
			<ContentSkeleton count={3} error={catalogQuery.error} />
		{:else if catalog.length === 0}
			<p class="text-sm text-muted-foreground">
				No service categories yet. Add one, for example Personal or Transport.
			</p>
		{/if}
		{#each catalog as category, index (category.id)}
			<div class="space-y-2 border-b pb-4 last:border-0 last:pb-0">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="flex min-w-0 items-center gap-2">
						<span
							class="h-2.5 w-2.5 shrink-0 rounded-full"
							style="background-color: {category.color}"
						></span>
						<span class="truncate font-medium">{category.name}</span>
					</div>
					<div class="flex items-center">
						<Button
							size="icon-xs"
							variant="ghost"
							title="Move up"
							disabled={busy !== null || index === 0}
							onclick={() =>
								run(category.id, () => moveServiceCategory({ id: category.id, direction: 'up' }))}
							><ChevronUp /></Button
						>
						<Button
							size="icon-xs"
							variant="ghost"
							title="Move down"
							disabled={busy !== null || index === catalog.length - 1}
							onclick={() =>
								run(category.id, () => moveServiceCategory({ id: category.id, direction: 'down' }))}
							><ChevronDown /></Button
						>
						<Button
							size="icon-xs"
							variant="ghost"
							icon="edit"
							title="Edit category"
							onclick={() => openCategory(category)}
						/>
						<Button
							size="icon-xs"
							variant="ghost"
							icon="delete"
							title="Delete category"
							disabled={busy !== null}
							onclick={() => removeCategory(category)}
						/>
					</div>
				</div>
				{#each category.services as service (service.id)}
					<div class="flex flex-wrap items-center justify-between gap-2 pl-4.5 text-sm">
						<span class="min-w-0 truncate">{service.name}</span>
						<div class="flex items-center gap-2">
							<span class="text-muted-foreground tabular-nums">
								{fmtEUR(service.unitPrice)} / {serviceUnitLabel(service.unit)}
								{#if service.perDay}· per day{/if}
							</span>
							<Button
								size="icon-xs"
								variant="ghost"
								icon="edit"
								title="Edit service"
								onclick={() => openService(category.id, service)}
							/>
							<Button
								size="icon-xs"
								variant="ghost"
								icon="delete"
								title="Delete service"
								disabled={busy !== null}
								onclick={() => removeService(service)}
							/>
						</div>
					</div>
				{/each}
				<div class="pl-4.5">
					<Button size="xs" variant="ghost" icon="add" onclick={() => openService(category.id)}
						>Service</Button
					>
				</div>
			</div>
		{/each}
	</Card.Content>
</Card.Root>

<Modal
	bind:open={categoryOpen}
	title={categoryId ? 'Edit category' : 'Add category'}
	dismissible={busy !== 'category'}
>
	{#snippet children()}
		<form id="service-category-form" class="space-y-4" onsubmit={saveCategory}>
			<div class="space-y-2">
				<Label for="service-category-name">Name</Label>
				<Input
					id="service-category-name"
					bind:value={categoryName}
					placeholder="Personal"
					required
				/>
				<p class="text-xs text-muted-foreground">Printed as the section heading on documents.</p>
			</div>
			<div class="space-y-2">
				<Label for="service-category-color">Colour</Label>
				<input
					id="service-category-color"
					type="color"
					bind:value={categoryColor}
					class="h-9 w-16 rounded-md border bg-background"
				/>
			</div>
		</form>
	{/snippet}

	{#snippet footer()}
		<Button
			icon="close"
			variant="outline"
			disabled={busy === 'category'}
			onclick={() => (categoryOpen = false)}>Cancel</Button
		>
		<Button
			icon="save"
			type="submit"
			form="service-category-form"
			disabled={busy === 'category' || !categoryName.trim()}>Save</Button
		>
	{/snippet}
</Modal>

<Modal
	bind:open={serviceOpen}
	title={serviceId ? 'Edit service' : 'Add service'}
	dismissible={busy !== 'service'}
>
	{#snippet children()}
		<form id="org-service-form" class="space-y-4" onsubmit={saveService}>
			<div class="space-y-2">
				<Label for="org-service-name">Name</Label>
				<Input id="org-service-name" bind:value={serviceName} placeholder="Techniker" required />
			</div>
			<div class="space-y-2">
				<Label for="org-service-category">Category</Label>
				<select id="org-service-category" class={selectClass} bind:value={serviceCategoryId}>
					{#each catalog as category (category.id)}
						<option value={category.id}>{category.name}</option>
					{/each}
				</select>
			</div>
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="space-y-2">
					<Label for="org-service-unit">Unit</Label>
					<select id="org-service-unit" class={selectClass} bind:value={serviceUnit}>
						{#each SERVICE_UNITS as option (option)}
							<option value={option}>{serviceUnitLabel(option)}</option>
						{/each}
					</select>
				</div>
				<div class="space-y-2">
					<Label for="org-service-price">Unit price (€, net)</Label>
					<Input
						id="org-service-price"
						type="number"
						min="0"
						step="0.01"
						bind:value={servicePrice}
						required
					/>
				</div>
			</div>
			<label class="flex items-start gap-2 text-sm">
				<input type="checkbox" bind:checked={servicePerDay} class="mt-0.5" />
				<span>
					Per day
					<span class="block text-xs text-muted-foreground"
						>Also multiplied by the document's day count, e.g. a technician's day rate.</span
					>
				</span>
			</label>
		</form>
	{/snippet}

	{#snippet footer()}
		<Button
			icon="close"
			variant="outline"
			disabled={busy === 'service'}
			onclick={() => (serviceOpen = false)}>Cancel</Button
		>
		<Button
			icon="save"
			type="submit"
			form="org-service-form"
			disabled={busy === 'service' || !serviceValid}>Save</Button
		>
	{/snippet}
</Modal>
