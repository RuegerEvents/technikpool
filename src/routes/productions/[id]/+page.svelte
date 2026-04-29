<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		getProduction,
		addAssetToProduction,
		addBundleToProduction,
		removeBundleFromProduction,
		addCrewMember,
		removeCrewMember,
		removeProductionItem,
		updateProductionAddress
	} from '$lib/remote/productions.remote';
	import { getAssets, getBundles } from '$lib/remote/assets.remote';
	import { getOrgUsers } from '$lib/remote/orgs.remote';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import type { Prisma } from '$lib/prisma/client';
	import { SvelteMap } from 'svelte/reactivity';
	import { resolve } from '$app/paths';

	const productionId = $derived(page.params.id as string);
	let production = $derived(await getProduction(productionId));

	let showAddPanel = $state(false);
	let searchQuery = $state('');
	let working = $state(false);

	let allAssets = $derived(await getAssets());
	let allBundles = $derived(await getBundles());

	let addedAssetIds = $derived(new Set<string>(production.items.map((i) => i.assetId)));
	let addedBundleIds = $derived(
		new Set<string>(production.items.filter((i) => i.sourceBundle).map((i) => i.sourceBundle!.id))
	);

	type BundleRow = { kind: 'bundle'; id: string; name: string; orgName: string; count: number };
	type AssetRow = {
		kind: 'asset';
		id: string;
		productName: string;
		manufacturerName: string;
		serialNumber: string | null;
		assetTag: string | null;
		orgName: string;
		status: string;
	};

	let allAddRows = $derived.by((): (BundleRow | AssetRow)[] => [
		...allBundles.map(
			(b): BundleRow => ({
				kind: 'bundle',
				id: b.id,
				name: b.name,
				orgName: b.organization.name,
				count: b.assets.length
			})
		),
		...allAssets.map(
			(a): AssetRow => ({
				kind: 'asset',
				id: a.id,
				productName: a.product.name,
				manufacturerName: a.product.manufacturer.name,
				serialNumber: a.serialNumber,
				assetTag: a.assetTag,
				orgName: a.organization.name,
				status: a.status
			})
		)
	]);

	let filteredAddRows = $derived.by(() => {
		const q = searchQuery.toLowerCase().trim();
		if (!q) return allAddRows;
		return allAddRows.filter((r) =>
			r.kind === 'bundle'
				? r.name.toLowerCase().includes(q) || r.orgName.toLowerCase().includes(q)
				: r.productName.toLowerCase().includes(q) ||
					r.manufacturerName.toLowerCase().includes(q) ||
					(r.serialNumber?.toLowerCase().includes(q) ?? false) ||
					(r.assetTag?.toLowerCase().includes(q) ?? false) ||
					r.orgName.toLowerCase().includes(q)
		);
	});

	async function handleAdd(row: BundleRow | AssetRow) {
		working = true;
		try {
			if (row.kind === 'bundle') {
				const result = await addBundleToProduction({ productionId, bundleId: row.id });
				toast.success(`Added ${result.added} asset${result.added !== 1 ? 's' : ''} from bundle`);
			} else {
				await addAssetToProduction({ productionId, assetId: row.id });
			}
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			working = false;
		}
	}

	async function handleRemoveItem(itemId: string) {
		try {
			await removeProductionItem(itemId);
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	async function handleRemoveBundle(bundleId: string) {
		try {
			await removeBundleFromProduction({ productionId, bundleId });
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	type ItemPayload = Prisma.ProductionItemGetPayload<{
		include: {
			asset: { include: { product: { include: { manufacturer: true } }; organization: true } };
			sourceBundle: { select: { id: true; name: true } };
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
						bundleName: item.sourceBundle.name,
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
			toast.error((err as Error).message);
		} finally {
			savingCrew = false;
		}
	}

	async function handleRemoveCrew(id: string) {
		try {
			await removeCrewMember(id);
		} catch (err) {
			toast.error((err as Error).message);
		}
	}

	const statusClass: Record<string, string> = {
		APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
		PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
		CHECKED_OUT: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
		RETURNED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
	};

	const assetStatusClass: Record<string, string> = {
		AVAILABLE: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
		MAINTENANCE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
		BROKEN: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
	};

	let editingAddress = $state(false);
	let savingAddress = $state(false);
	let addressDraft = $state({
		line1: '',
		line2: '',
		postalCode: '',
		city: '',
		region: '',
		country: ''
	});

	$effect(() => {
		if (editingAddress) return;
		addressDraft = {
			line1: production.address?.line1 ?? '',
			line2: production.address?.line2 ?? '',
			postalCode: production.address?.postalCode ?? '',
			city: production.address?.city ?? '',
			region: production.address?.region ?? '',
			country: production.address?.country ?? ''
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
			toast.error((err as Error).message);
		} finally {
			savingAddress = false;
		}
	}

	function formatAddress(addr: typeof production.address) {
		if (!addr) return '—';
		const parts = [
			addr.line1?.trim(),
			addr.line2?.trim(),
			[addr.postalCode?.trim(), addr.city?.trim()].filter(Boolean).join(' '),
			[addr.region?.trim(), addr.country?.trim()].filter(Boolean).join(', ')
		].filter(Boolean);
		return parts.length ? parts.join(' · ') : '—';
	}
</script>

<svelte:head><title>{production.name} | Technikpool</title></svelte:head>

<div class="space-y-8">
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
		</div>
	</div>

	<!-- Address -->
	<Card.Root>
		<Card.Header>
			<div class="flex items-start justify-between gap-4">
				<div>
					<Card.Title>Address</Card.Title>
					<Card.Description>{formatAddress(production.address)}</Card.Description>
				</div>
				{#if !editingAddress}
					<Button variant="outline" onclick={() => (editingAddress = true)}>Edit</Button>
				{/if}
			</div>
		</Card.Header>
		{#if editingAddress}
			<Card.Content>
				<form class="space-y-4" onsubmit={handleSaveAddress}>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2 sm:col-span-2">
							<Label for="addr-line1">Address line 1</Label>
							<Input
								id="addr-line1"
								bind:value={addressDraft.line1}
								placeholder="Street and number"
							/>
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="addr-line2">Address line 2</Label>
							<Input
								id="addr-line2"
								bind:value={addressDraft.line2}
								placeholder="Building, floor, c/o"
							/>
						</div>
						<div class="space-y-2">
							<Label for="addr-postal">Postal code</Label>
							<Input id="addr-postal" bind:value={addressDraft.postalCode} placeholder="12345" />
						</div>
						<div class="space-y-2">
							<Label for="addr-city">City</Label>
							<Input id="addr-city" bind:value={addressDraft.city} placeholder="Berlin" />
						</div>
						<div class="space-y-2">
							<Label for="addr-region">Region/State</Label>
							<Input id="addr-region" bind:value={addressDraft.region} placeholder="BE" />
						</div>
						<div class="space-y-2">
							<Label for="addr-country">Country</Label>
							<Input id="addr-country" bind:value={addressDraft.country} placeholder="DE" />
						</div>
					</div>

					<div class="flex justify-end gap-2">
						<Button type="button" variant="outline" onclick={() => (editingAddress = false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={savingAddress}>
							{savingAddress ? 'Saving…' : 'Save'}
						</Button>
					</div>
				</form>
			</Card.Content>
		{/if}
	</Card.Root>

	<!-- Equipment section -->
	<div>
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-xl font-semibold">Booked Equipment</h2>
			<Button onclick={() => (showAddPanel = !showAddPanel)}>
				{showAddPanel ? 'Done' : 'Add Equipment'}
			</Button>
		</div>

		{#if showAddPanel}
			<Card.Root class="mb-6 bg-muted/30">
				<Card.Header>
					<Card.Title>Add Equipment</Card.Title>
					<div class="mt-2">
						<Input
							type="search"
							placeholder="Search assets and bundles…"
							bind:value={searchQuery}
							class="max-w-sm"
						/>
					</div>
				</Card.Header>
				<Card.Content>
					{#if filteredAddRows.length === 0}
						<p class="text-sm text-muted-foreground">No results.</p>
					{:else}
						<div class="max-h-72 overflow-y-auto rounded-md border">
							<table class="w-full text-sm">
								<thead class="sticky top-0 bg-muted/80 backdrop-blur-sm">
									<tr class="border-b">
										<th class="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
										<th class="px-3 py-2 text-left font-medium text-muted-foreground">Info</th>
										<th class="px-3 py-2 text-left font-medium text-muted-foreground">Org</th>
										<th class="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
										<th class="w-12 px-3 py-2 text-center font-medium text-muted-foreground">Add</th
										>
									</tr>
								</thead>
								<tbody>
									{#each filteredAddRows as row (row.id)}
										{@const isAdded =
											row.kind === 'bundle'
												? addedBundleIds.has(row.id)
												: addedAssetIds.has(row.id)}
										<tr
											class="border-b bg-background transition-colors last:border-0 hover:bg-muted/30 {isAdded
												? 'opacity-60'
												: ''}"
										>
											<td class="px-3 py-2">
												{#if row.kind === 'bundle'}
													<div class="flex items-center gap-2">
														<span
															class="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
															>Bundle</span
														>
														<span class="font-medium">{row.name}</span>
													</div>
												{:else}
													<p class="font-medium">{row.productName}</p>
													<p class="text-xs text-muted-foreground">{row.manufacturerName}</p>
												{/if}
											</td>
											<td class="px-3 py-2 font-mono text-xs text-muted-foreground">
												{#if row.kind === 'bundle'}
													{row.count} item{row.count !== 1 ? 's' : ''}
												{:else}
													{row.serialNumber ?? row.assetTag ?? '—'}
												{/if}
											</td>
											<td class="px-3 py-2 text-xs text-muted-foreground">{row.orgName}</td>
											<td class="px-3 py-2">
												{#if row.kind === 'asset'}
													<span
														class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold {assetStatusClass[
															row.status
														] ?? ''}">{row.status}</span
													>
												{:else}
													<span class="text-muted-foreground">—</span>
												{/if}
											</td>
											<td class="px-3 py-2 text-center">
												<button
													type="button"
													disabled={working}
													onclick={() => {
														if (!isAdded) handleAdd(row);
													}}
													class="mx-auto flex h-5 w-5 items-center justify-center rounded border-2 transition-colors {isAdded
														? 'cursor-default border-primary bg-primary text-primary-foreground'
														: 'cursor-pointer border-input hover:border-primary'}"
												>
													{#if isAdded}
														<svg
															xmlns="http://www.w3.org/2000/svg"
															width="12"
															height="12"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															stroke-width="3"
															stroke-linecap="round"
															stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg
														>
													{/if}
												</button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}

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
							<tr
								class="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
								onclick={() => toggleSection(sectionId)}
							>
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
										<td colspan="7" class="px-4 py-2">
											<div class="flex items-center gap-4 pl-5 text-sm">
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
													] ?? ''}">{item.status}</span
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
