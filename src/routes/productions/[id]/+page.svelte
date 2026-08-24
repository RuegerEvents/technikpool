<script lang="ts">
	import { getErrorMessage } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { AddressInput } from '$lib/components/ui/address-input';
	import {
		getProduction,
		removeBundleFromProduction,
		syncBundleInProduction,
		addCrewMember,
		removeCrewMember,
		removeProductionItem,
		updateProductionAddress,
		updateProductionDuration,
		updateProductionCustomer
	} from '$lib/remote/productions.remote';
	import { getBundles } from '$lib/remote/assets.remote';
	import { getOrgUsers } from '$lib/remote/orgs.remote';
	import { getCustomers, createCustomer } from '$lib/remote/customers.remote';
	import { getOffersForProduction, getInvoicesForProduction } from '$lib/remote/offers.remote';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import type { Prisma } from '$lib/prisma/client';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import CheckoutBar from '$lib/components/ui/checkout-bar.svelte';

	const productionId = $derived(page.params.id as string);
	let production = $derived(await getProduction(productionId));

	let working = $state(false);

	let allBundles = $derived(await getBundles());
	let offers = $derived(await getOffersForProduction(productionId));
	let invoices = $derived(await getInvoicesForProduction(productionId));

	function fmtEUR(n: number): string {
		return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	function offerTotal(offer: (typeof offers)[number]): number {
		return offer.items.reduce((sum, i) => sum + Number(i.lineTotal), 0);
	}

	function invoiceTotal(invoice: (typeof invoices)[number]): number {
		return invoice.items.reduce((sum, i) => sum + Number(i.lineTotal), 0);
	}

	async function handleRemoveItem(itemId: string) {
		try {
			await removeProductionItem(itemId);
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}

	async function handleRemoveBundle(bundleId: string) {
		try {
			await removeBundleFromProduction({ productionId, bundleId });
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}

	async function handleSyncBundle(bundleId: string) {
		working = true;
		try {
			const result = await syncBundleInProduction({ productionId, bundleId });
			const parts: string[] = [];
			if (result.added > 0)
				parts.push(`${result.added} asset${result.added !== 1 ? 's' : ''} added`);
			if (result.removed > 0)
				parts.push(`${result.removed} asset${result.removed !== 1 ? 's' : ''} removed`);
			if (result.skippedConflicts > 0) parts.push(`${result.skippedConflicts} skipped (conflict)`);
			toast.success(
				parts.length ? `Bundle updated: ${parts.join(', ')}` : 'Bundle already in sync'
			);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			working = false;
		}
	}

	let bundleDivergence = $derived.by(() => {
		const map = new SvelteMap<string, { addedCount: number; removedCount: number }>();
		for (const section of displaySections) {
			if (section.kind !== 'bundle') continue;
			const currentBundle = allBundles.find((b) => b.id === section.bundleId);
			if (!currentBundle) continue;
			const bundleAssetIds = new Set(currentBundle.assets.map((a) => a.id));
			const productionAssetIds = new Set(section.items.map((i) => i.assetId));
			const addedCount = currentBundle.assets.filter((a) => !productionAssetIds.has(a.id)).length;
			const removedCount = section.items.filter((i) => !bundleAssetIds.has(i.assetId)).length;
			if (addedCount > 0 || removedCount > 0) {
				map.set(section.bundleId, { addedCount, removedCount });
			}
		}
		return map;
	});

	type ItemPayload = Prisma.ProductionItemGetPayload<{
		include: {
			asset: { include: { product: { include: { manufacturer: true } }; organization: true } };
			sourceBundle: { select: { id: true; template: { select: { name: true } } } };
		};
	}>;

	type BundleSection = {
		kind: 'bundle';
		bundleId: string;
		bundleName: string;
		total: number;
		pending: number;
		approved: number;
		checkedOut: number;
		returned: number;
		items: ItemPayload[];
	};

	type ProductSection = {
		kind: 'product';
		productId: string;
		productName: string;
		manufacturerName: string;
		total: number;
		pending: number;
		approved: number;
		checkedOut: number;
		returned: number;
		items: ItemPayload[];
	};

	type DisplaySection = BundleSection | ProductSection;

	let displaySections = $derived.by((): DisplaySection[] => {
		const bundleMap = new SvelteMap<string, BundleSection>();
		const productMap = new SvelteMap<string, ProductSection>();
		for (const item of production.items) {
			if (item.sourceBundle) {
				const bid = item.sourceBundle.id;
				if (!bundleMap.has(bid)) {
					bundleMap.set(bid, {
						kind: 'bundle',
						bundleId: bid,
						bundleName: item.sourceBundle.template.name,
						total: 0,
						pending: 0,
						approved: 0,
						checkedOut: 0,
						returned: 0,
						items: []
					});
				}
				const g = bundleMap.get(bid)!;
				g.total++;
				g.items.push(item);
				if (item.status === 'PENDING') g.pending++;
				else if (item.status === 'APPROVED') g.approved++;
				else if (item.status === 'CHECKED_OUT') g.checkedOut++;
				else if (item.status === 'RETURNED') g.returned++;
			} else {
				const pid = item.asset.product.id;
				if (!productMap.has(pid)) {
					productMap.set(pid, {
						kind: 'product',
						productId: pid,
						productName: item.asset.product.name,
						manufacturerName: item.asset.product.manufacturer.name,
						total: 0,
						pending: 0,
						approved: 0,
						checkedOut: 0,
						returned: 0,
						items: []
					});
				}
				const g = productMap.get(pid)!;
				g.total++;
				g.items.push(item);
				if (item.status === 'PENDING') g.pending++;
				else if (item.status === 'APPROVED') g.approved++;
				else if (item.status === 'CHECKED_OUT') g.checkedOut++;
				else if (item.status === 'RETURNED') g.returned++;
			}
		}
		return [...bundleMap.values(), ...productMap.values()];
	});

	let expanded = new SvelteMap<string, boolean>();
	let selectedItemAssetIds = new SvelteSet<string>();

	let allItemAssetIds = $derived(production.items.map((i) => i.asset.id));
	let allItemsSelected = $derived(
		allItemAssetIds.length > 0 && allItemAssetIds.every((id) => selectedItemAssetIds.has(id))
	);
	let someItemsSelected = $derived(allItemAssetIds.some((id) => selectedItemAssetIds.has(id)));

	function toggleSelectAllItems() {
		if (allItemsSelected) {
			allItemAssetIds.forEach((id) => selectedItemAssetIds.delete(id));
		} else {
			allItemAssetIds.forEach((id) => selectedItemAssetIds.add(id));
		}
	}

	function indeterminate(node: HTMLInputElement, value: boolean) {
		node.indeterminate = value;
		return {
			update(v: boolean) {
				node.indeterminate = v;
			}
		};
	}

	function toggleSection(id: string) {
		expanded.set(id, !expanded.get(id));
	}

	let showCrewForm = $state(false);
	let crewUserId = $state('');
	let crewRole = $state('');
	let savingCrew = $state(false);
	let orgUsers = $derived(await getOrgUsers());

	async function handleAddCrew(e: Event) {
		e.preventDefault();
		if (!crewUserId) return;
		savingCrew = true;
		try {
			await addCrewMember({
				productionId,
				userId: crewUserId,
				role: crewRole.trim() || undefined
			});
			crewUserId = '';
			crewRole = '';
			showCrewForm = false;
			toast.success('Crew member added');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingCrew = false;
		}
	}

	async function handleRemoveCrew(id: string) {
		try {
			await removeCrewMember(id);
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}

	const statusClass: Record<string, string> = {
		APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
		PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
		CHECKED_OUT: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
		RETURNED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
	};

	const statusLabels: Record<string, string> = {
		APPROVED: 'Approved',
		PENDING: 'Pending',
		CHECKED_OUT: 'Checked out',
		RETURNED: 'Returned'
	};

	let editingAddress = $state(false);
	let savingAddress = $state(false);
	let addressDraft = $state({
		line1: '',
		line2: '',
		postalCode: '',
		city: ''
	});

	$effect(() => {
		if (editingAddress) return;
		addressDraft = {
			line1: production.address?.line1 ?? '',
			line2: production.address?.line2 ?? '',
			postalCode: production.address?.postalCode ?? '',
			city: production.address?.city ?? ''
		};
	});

	async function handleSaveAddress(e: Event) {
		e.preventDefault();
		savingAddress = true;
		try {
			await updateProductionAddress({ productionId, address: addressDraft });
			toast.success('Address updated');
			editingAddress = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingAddress = false;
		}
	}

	function formatAddress(addr: typeof production.address) {
		if (!addr) return '—';
		const parts = [
			addr.line1?.trim(),
			addr.line2?.trim(),
			[addr.postalCode?.trim(), addr.city?.trim()].filter(Boolean).join(' ')
		].filter(Boolean);
		return parts.length ? parts.join(' · ') : '—';
	}

	let editingCustomer = $state(false);
	let savingCustomer = $state(false);
	let creatingCustomer = $state(false);
	let customerDraftId = $state('');
	let newCustomer = $state({ companyName: '', contactPerson: '', email: '' });
	let newCustomerAddress = $state({ line1: '', line2: '', postalCode: '', city: '' });
	let orgCustomers = $derived(await getCustomers(production.organizationId));

	$effect(() => {
		if (editingCustomer) return;
		customerDraftId = production.customerId ?? '';
	});

	function customerLabel(c: { companyName: string | null; contactPerson: string | null }) {
		return c.companyName || c.contactPerson || 'Unnamed customer';
	}

	async function handleSaveCustomer(e: Event) {
		e.preventDefault();
		savingCustomer = true;
		try {
			let finalCustomerId = customerDraftId || undefined;
			if (creatingCustomer) {
				const created = await createCustomer({
					organizationId: production.organizationId,
					companyName: newCustomer.companyName || undefined,
					contactPerson: newCustomer.contactPerson || undefined,
					email: newCustomer.email || undefined,
					address: newCustomerAddress
				});
				finalCustomerId = created.id;
			}
			await updateProductionCustomer({ productionId, customerId: finalCustomerId });
			toast.success('Customer updated');
			editingCustomer = false;
			creatingCustomer = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingCustomer = false;
		}
	}

	function toDateInput(d: Date | string | null | undefined) {
		if (!d) return '';
		return new Date(d).toISOString().slice(0, 10);
	}

	function formatDateRange(
		start: Date | string | null | undefined,
		end: Date | string | null | undefined
	) {
		if (!start && !end) return '—';
		const fmt = (d: Date | string) => new Date(d).toLocaleDateString('de-DE');
		if (start && end)
			return start === end || fmt(start) === fmt(end) ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
		return fmt((start ?? end)!);
	}

	let editingDuration = $state(false);
	let savingDuration = $state(false);
	let durationDraft = $state({
		startDate: '',
		endDate: '',
		sameAsTotalDuration: true,
		showStartDate: '',
		showEndDate: ''
	});

	$effect(() => {
		if (editingDuration) return;
		const hasCustomShow = !!(production.showStartDate || production.showEndDate);
		durationDraft = {
			startDate: toDateInput(production.startDate),
			endDate: toDateInput(production.endDate),
			sameAsTotalDuration: !hasCustomShow,
			showStartDate: toDateInput(production.showStartDate),
			showEndDate: toDateInput(production.showEndDate)
		};
	});

	async function handleSaveDuration(e: Event) {
		e.preventDefault();
		savingDuration = true;
		try {
			await updateProductionDuration({
				productionId,
				startDate: durationDraft.startDate ? new Date(durationDraft.startDate) : undefined,
				endDate: durationDraft.endDate ? new Date(durationDraft.endDate) : undefined,
				showStartDate:
					!durationDraft.sameAsTotalDuration && durationDraft.showStartDate
						? new Date(durationDraft.showStartDate)
						: undefined,
				showEndDate:
					!durationDraft.sameAsTotalDuration && durationDraft.showEndDate
						? new Date(durationDraft.showEndDate)
						: undefined
			});
			toast.success('Duration updated');
			editingDuration = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingDuration = false;
		}
	}
</script>

<svelte:head><title>{production.name} | Technikpool</title></svelte:head>

<div class="space-y-8 {selectedItemAssetIds.size > 0 ? 'pb-20' : ''}">
	<!-- Header -->
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">{production.name}</h1>
			<p class="text-muted-foreground">Owned by {production.organization.name}</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button variant="outline" href={resolve('/productions')}>Back</Button>
			<Button
				variant="secondary"
				href={resolve(`/productions/${production.id}/packing-list`)}
				target="_blank">Packing List</Button
			>
			<Button
				variant="secondary"
				href={resolve(`/productions/${production.id}/delivery-note`)}
				target="_blank">Delivery Note</Button
			>
			<Button
				variant="secondary"
				href={resolve(`/productions/${production.id}/crew-passes`)}
				target="_blank">Crew Passes</Button
			>
			<Button href={resolve(`/offers/new?productionId=${production.id}`)}>Create Offer</Button>
		</div>
	</div>

	<!-- Offers & Invoices -->
	{#if offers.length > 0 || invoices.length > 0}
		<div class="grid gap-4 sm:grid-cols-2">
			<Card.Root>
				<Card.Header>
					<Card.Title>Offers</Card.Title>
				</Card.Header>
				<Card.Content>
					{#if offers.length === 0}
						<p class="text-sm text-muted-foreground">No offers yet.</p>
					{:else}
						<div class="space-y-2">
							{#each offers as offer (offer.id)}
								<a
									href={resolve(`/offers/${offer.id}`)}
									class="flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/30"
								>
									<div>
										<p class="font-medium">{offer.customerName}</p>
										<p class="text-xs text-muted-foreground">
											{offer.dayCount} d
											{#if offer.invoices.length > 0}
												· Invoiced ({offer.invoices[0].number})
											{/if}
										</p>
									</div>
									<span class="font-medium tabular-nums">{fmtEUR(offerTotal(offer))}</span>
								</a>
							{/each}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Invoices</Card.Title>
				</Card.Header>
				<Card.Content>
					{#if invoices.length === 0}
						<p class="text-sm text-muted-foreground">No invoices yet.</p>
					{:else}
						<div class="space-y-2">
							{#each invoices as invoice (invoice.id)}
								<a
									href={resolve(`/invoices/${invoice.id}`)}
									class="flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/30"
								>
									<div>
										<p class="font-medium">{invoice.number}</p>
										<p class="text-xs text-muted-foreground">
											{invoice.dayCount} d · {invoice.sentAt ? 'Sent' : 'Draft'}
										</p>
									</div>
									<span class="font-medium tabular-nums">{fmtEUR(invoiceTotal(invoice))}</span>
								</a>
							{/each}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	{/if}

	<!-- Main info -->
	<Card.Root>
		<Card.Header>
			<Card.Title>Production Info</Card.Title>
			<Card.Description>Duration and address for this production.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-6">
			<!-- Duration -->
			<div class="space-y-3">
				<div class="flex items-start justify-between gap-4">
					<div class="grid flex-1 gap-4 sm:grid-cols-2">
						<div>
							<h3 class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
								Total Duration
							</h3>
							<p class="text-sm">{formatDateRange(production.startDate, production.endDate)}</p>
						</div>
						<div>
							<h3 class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
								Show Duration
							</h3>
							<p class="text-sm">
								{formatDateRange(
									production.showStartDate ?? production.startDate,
									production.showEndDate ?? production.endDate
								)}
							</p>
						</div>
					</div>
					{#if !editingDuration}
						<Button variant="outline" onclick={() => (editingDuration = true)}>Edit</Button>
					{/if}
				</div>

				{#if editingDuration}
					<form class="space-y-4" onsubmit={handleSaveDuration}>
						<div class="grid grid-cols-2 gap-4">
							<div class="space-y-2">
								<Label for="dur-startDate">Start Date</Label>
								<Input id="dur-startDate" type="date" bind:value={durationDraft.startDate} />
							</div>
							<div class="space-y-2">
								<Label for="dur-endDate">End Date</Label>
								<Input
									id="dur-endDate"
									type="date"
									bind:value={durationDraft.endDate}
									min={durationDraft.startDate}
								/>
							</div>
						</div>

						<label class="flex cursor-pointer items-center gap-2 text-sm select-none">
							<input
								type="checkbox"
								bind:checked={durationDraft.sameAsTotalDuration}
								class="h-4 w-4 rounded border-input"
							/>
							Show duration same as total duration
						</label>

						{#if !durationDraft.sameAsTotalDuration}
							<div class="grid grid-cols-2 gap-4">
								<div class="space-y-2">
									<Label for="dur-showStartDate">Show Start Date</Label>
									<Input
										id="dur-showStartDate"
										type="date"
										bind:value={durationDraft.showStartDate}
										min={durationDraft.startDate}
										max={durationDraft.endDate}
									/>
								</div>
								<div class="space-y-2">
									<Label for="dur-showEndDate">Show End Date</Label>
									<Input
										id="dur-showEndDate"
										type="date"
										bind:value={durationDraft.showEndDate}
										min={durationDraft.showStartDate || durationDraft.startDate}
										max={durationDraft.endDate}
									/>
								</div>
							</div>
						{/if}

						<div class="flex justify-end gap-2">
							<Button type="button" variant="outline" onclick={() => (editingDuration = false)}>
								Cancel
							</Button>
							<Button type="submit" disabled={savingDuration}>
								{savingDuration ? 'Saving…' : 'Save'}
							</Button>
						</div>
					</form>
				{/if}
			</div>

			<!-- Address -->
			<div class="space-y-3 border-t pt-6">
				<div class="flex items-start justify-between gap-4">
					<div>
						<h3 class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							Address
						</h3>
						<p class="text-sm">{formatAddress(production.address)}</p>
					</div>
					{#if !editingAddress}
						<Button variant="outline" onclick={() => (editingAddress = true)}>Edit</Button>
					{/if}
				</div>

				{#if editingAddress}
					<form class="space-y-4" onsubmit={handleSaveAddress}>
						<AddressInput bind:value={addressDraft} idPrefix="addr" />

						<div class="flex justify-end gap-2">
							<Button type="button" variant="outline" onclick={() => (editingAddress = false)}>
								Cancel
							</Button>
							<Button type="submit" disabled={savingAddress}>
								{savingAddress ? 'Saving…' : 'Save'}
							</Button>
						</div>
					</form>
				{/if}
			</div>

			<!-- Customer -->
			<div class="space-y-3 border-t pt-6">
				<div class="flex items-start justify-between gap-4">
					<div>
						<h3 class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
							Customer
						</h3>
						<p class="text-sm">
							{production.customer ? customerLabel(production.customer) : '—'}
						</p>
					</div>
					{#if !editingCustomer}
						<Button variant="outline" onclick={() => (editingCustomer = true)}>Edit</Button>
					{/if}
				</div>

				{#if editingCustomer}
					<form class="space-y-4" onsubmit={handleSaveCustomer}>
						{#if !creatingCustomer}
							<div class="space-y-2">
								<select
									bind:value={customerDraftId}
									class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
								>
									<option value="">— None —</option>
									{#each orgCustomers as c (c.id)}
										<option value={c.id}>{customerLabel(c)}</option>
									{/each}
								</select>
								<Button type="button" variant="outline" onclick={() => (creatingCustomer = true)}>
									+ New customer
								</Button>
							</div>
						{:else}
							<div class="space-y-4 rounded-md border p-4">
								<div class="grid gap-4 sm:grid-cols-2">
									<div class="space-y-2">
										<Label for="cust-company">Company name</Label>
										<Input id="cust-company" bind:value={newCustomer.companyName} />
									</div>
									<div class="space-y-2">
										<Label for="cust-contact">Contact person</Label>
										<Input id="cust-contact" bind:value={newCustomer.contactPerson} />
									</div>
									<div class="space-y-2 sm:col-span-2">
										<Label for="cust-email">Email</Label>
										<Input id="cust-email" type="email" bind:value={newCustomer.email} />
									</div>
								</div>
								<AddressInput bind:value={newCustomerAddress} idPrefix="cust-addr" />
								<Button type="button" variant="outline" onclick={() => (creatingCustomer = false)}>
									Cancel new customer
								</Button>
							</div>
						{/if}

						<div class="flex justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								onclick={() => {
									editingCustomer = false;
									creatingCustomer = false;
								}}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={savingCustomer}>
								{savingCustomer ? 'Saving…' : 'Save'}
							</Button>
						</div>
					</form>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Equipment section -->
	<div>
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-xl font-semibold">Booked Equipment</h2>
			<Button href={resolve(`/productions/${productionId}/equipment`)}>Manage Equipment</Button>
		</div>

		{#if production.items.length === 0}
			<Card.Root>
				<Card.Content class="py-12 text-center text-muted-foreground">
					No equipment booked yet.
				</Card.Content>
			</Card.Root>
		{:else}
			<div class="rounded-md border">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b bg-muted/30">
							<th class="w-10 px-4 py-3">
								<input
									type="checkbox"
									checked={allItemsSelected}
									use:indeterminate={someItemsSelected && !allItemsSelected}
									onclick={toggleSelectAllItems}
									class="h-4 w-4 cursor-pointer rounded border-input"
								/>
							</th>
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Product</th>
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Manufacturer</th>
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Pending</th>
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Approved</th>
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Out</th>
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Returned</th>
						</tr>
					</thead>
					<tbody>
						{#each displaySections as section (section.kind === 'bundle' ? section.bundleId : section.productId)}
							{@const sectionId = section.kind === 'bundle' ? section.bundleId : section.productId}
							{@const sectionAssetIds = section.items.map((i) => i.asset.id)}
							{@const allInSectionSelected =
								sectionAssetIds.length > 0 &&
								sectionAssetIds.every((id) => selectedItemAssetIds.has(id))}
							{@const divergence =
								section.kind === 'bundle' ? bundleDivergence.get(section.bundleId) : null}
							<tr
								class="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
								onclick={() => toggleSection(sectionId)}
							>
								<td class="px-4 py-3">
									<input
										type="checkbox"
										checked={allInSectionSelected}
										onclick={(e) => {
											e.stopPropagation();
											if (allInSectionSelected) {
												sectionAssetIds.forEach((id) => selectedItemAssetIds.delete(id));
											} else {
												sectionAssetIds.forEach((id) => selectedItemAssetIds.add(id));
											}
										}}
										class="h-4 w-4 cursor-pointer rounded border-input"
									/>
								</td>
								<td class="px-4 py-3">
									<div class="flex items-center gap-2">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											class="shrink-0 text-muted-foreground transition-transform {expanded.get(
												sectionId
											)
												? 'rotate-90'
												: ''}"
										>
											<path d="m9 18 6-6-6-6" />
										</svg>
										{#if section.kind === 'bundle'}
											<span
												class="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
												>Bundle</span
											>
											<span class="font-medium">{section.bundleName}</span>
											{#if divergence}
												<span
													class="rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
													title="{divergence.addedCount > 0
														? `${divergence.addedCount} new asset${divergence.addedCount !== 1 ? 's' : ''} in bundle`
														: ''}{divergence.addedCount > 0 && divergence.removedCount > 0
														? ', '
														: ''}{divergence.removedCount > 0
														? `${divergence.removedCount} asset${divergence.removedCount !== 1 ? 's' : ''} removed from bundle`
														: ''}">Bundle changed</span
												>
												<button
													type="button"
													disabled={working}
													onclick={(e) => {
														e.stopPropagation();
														handleSyncBundle(section.bundleId);
													}}
													class="rounded border border-yellow-400 px-2 py-0.5 text-xs text-yellow-800 transition-colors hover:bg-yellow-100 dark:border-yellow-600 dark:text-yellow-300 dark:hover:bg-yellow-900/40"
												>
													Update from bundle
												</button>
											{/if}
											<button
												type="button"
												onclick={(e) => {
													e.stopPropagation();
													handleRemoveBundle(section.bundleId);
												}}
												class="ml-auto text-xs text-muted-foreground transition-colors hover:text-destructive"
											>
												Remove
											</button>
										{:else}
											<span class="font-medium">{section.productName}</span>
										{/if}
									</div>
								</td>
								<td class="px-4 py-3 text-muted-foreground">
									{section.kind === 'bundle' ? '—' : section.manufacturerName}
								</td>
								<td class="px-4 py-3 text-right font-mono tabular-nums">{section.total}</td>
								<td
									class="px-4 py-3 text-right font-mono tabular-nums {section.pending > 0
										? 'text-yellow-600 dark:text-yellow-400'
										: 'text-muted-foreground'}">{section.pending > 0 ? section.pending : '—'}</td
								>
								<td
									class="px-4 py-3 text-right font-mono tabular-nums {section.approved > 0
										? 'text-green-700 dark:text-green-400'
										: 'text-muted-foreground'}">{section.approved > 0 ? section.approved : '—'}</td
								>
								<td
									class="px-4 py-3 text-right font-mono tabular-nums {section.checkedOut > 0
										? 'text-blue-600 dark:text-blue-400'
										: 'text-muted-foreground'}"
									>{section.checkedOut > 0 ? section.checkedOut : '—'}</td
								>
								<td class="px-4 py-3 text-right font-mono text-muted-foreground tabular-nums"
									>{section.returned > 0 ? section.returned : '—'}</td
								>
							</tr>
							{#if expanded.get(sectionId)}
								{#each section.items as item (item.id)}
									<tr class="border-b bg-muted/10 last:border-0">
										<td class="px-4 py-2">
											<input
												type="checkbox"
												checked={selectedItemAssetIds.has(item.asset.id)}
												onclick={() => {
													if (selectedItemAssetIds.has(item.asset.id)) {
														selectedItemAssetIds.delete(item.asset.id);
													} else {
														selectedItemAssetIds.add(item.asset.id);
													}
												}}
												class="h-4 w-4 cursor-pointer rounded border-input"
											/>
										</td>
										<td colspan="7" class="px-4 py-2">
											<div class="flex items-center gap-4 text-sm">
												{#if section.kind === 'bundle'}
													<span class="font-medium">{item.asset.product.name}</span>
												{/if}
												<span class="w-36 font-mono text-xs text-muted-foreground">
													{item.asset.serialNumber ? `S/N: ${item.asset.serialNumber}` : '—'}
												</span>
												<span class="text-xs text-muted-foreground"
													>{item.asset.organization.name}</span
												>
												<span
													class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold {statusClass[
														item.status
													] ?? ''}">{statusLabels[item.status] ?? item.status}</span
												>
												<button
													type="button"
													onclick={() => handleRemoveItem(item.id)}
													class="ml-auto text-xs text-muted-foreground transition-colors hover:text-destructive"
												>
													Remove
												</button>
											</div>
										</td>
									</tr>
								{/each}
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<!-- Crew section -->
	<div>
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-xl font-semibold">Crew</h2>
			<Button variant="outline" onclick={() => (showCrewForm = !showCrewForm)}>
				{showCrewForm ? 'Cancel' : 'Add Crew Member'}
			</Button>
		</div>

		{#if showCrewForm}
			<Card.Root class="mb-4 max-w-lg">
				<Card.Content class="pt-6">
					<form onsubmit={handleAddCrew} class="space-y-4">
						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-2">
								<Label for="crewUser">User *</Label>
								<select
									id="crewUser"
									bind:value={crewUserId}
									class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
									required
								>
									<option value="" disabled> Select a user… </option>
									{#each orgUsers as u (u.id)}
										{@const alreadyAdded = production?.crew.some((c) => c.userId === u.id)}
										<option value={u.id} disabled={alreadyAdded}>
											{u.name || u.email}{alreadyAdded ? ' (already added)' : ''}
										</option>
									{/each}
								</select>
							</div>
							<div class="space-y-2">
								<Label for="crewRole">Role</Label>
								<Input id="crewRole" bind:value={crewRole} placeholder="Camera Operator" />
							</div>
						</div>
						<div class="flex justify-end gap-3">
							<Button type="button" variant="outline" onclick={() => (showCrewForm = false)}
								>Cancel</Button
							>
							<Button type="submit" disabled={savingCrew}>{savingCrew ? 'Adding…' : 'Add'}</Button>
						</div>
					</form>
				</Card.Content>
			</Card.Root>
		{/if}

		{#if production.crew.length === 0}
			<Card.Root>
				<Card.Content class="py-8 text-center text-sm text-muted-foreground">
					No crew members added yet.
				</Card.Content>
			</Card.Root>
		{:else}
			<div class="overflow-hidden rounded-lg border bg-card">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b bg-muted/30">
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
							<th class="px-4 py-3"></th>
						</tr>
					</thead>
					<tbody>
						{#each production.crew as member (member.id)}
							<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
								<td class="px-4 py-3 font-medium">{member.user.name ?? '—'}</td>
								<td class="px-4 py-3 text-muted-foreground">{member.role ?? '—'}</td>
								<td class="px-4 py-3 text-muted-foreground">{member.user.email ?? '—'}</td>
								<td class="px-4 py-3 text-right">
									<button
										type="button"
										onclick={() => handleRemoveCrew(member.id)}
										class="text-xs text-muted-foreground transition-colors hover:text-destructive"
									>
										Remove
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>

<CheckoutBar selectedIds={selectedItemAssetIds} onClear={() => selectedItemAssetIds.clear()} />
