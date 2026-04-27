<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		getProduction,
		addAssetToProduction,
		addBundleToProduction,
		addCrewMember,
		removeCrewMember
	} from '$lib/remote/productions.remote';
	import { getAssets, getBundles } from '$lib/remote/assets.remote';
	import { getOrgUsers } from '$lib/remote/orgs.remote';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import type { Prisma } from '@prisma/client';
	import { SvelteMap } from 'svelte/reactivity';
	import { resolve } from '$app/paths';

	const productionId = $derived(page.params.id as string);

	let production = $derived(await getProduction(productionId));

	// Equipment modal
	let showAddModal = $state(false);
	let equipmentTab = $state<'assets' | 'bundles'>('assets');
	let searchQuery = $state('');
	let working = $state(false);

	let allAssets = $derived(await getAssets());
	let allBundles = $derived(await getBundles());

	// Optimistic set of added asset IDs, seeded from production data
	let addedAssetIds = $derived(new Set<string>(production?.items.map((i) => i.assetId) ?? []));
	let addedBundleIds = $state(new Set<string>());

	async function handleAddAsset(assetId: string) {
		working = true;
		try {
			await addAssetToProduction({ productionId, assetId });
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			working = false;
		}
	}

	async function handleAddBundle(bundleId: string) {
		working = true;
		try {
			const result = await addBundleToProduction({ productionId, bundleId });
			addedBundleIds = new Set([...addedBundleIds, bundleId]);
			toast.success(`Added ${result.added} asset${result.added !== 1 ? 's' : ''} from bundle`);
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			working = false;
		}
	}

	let groupedItems = $derived.by(() => {
		if (!production)
			return [] as Array<{
				bundleName: string | null;
				items: Prisma.ProductionItemGetPayload<{
					include: {
						asset: {
							include: { product: { include: { manufacturer: true } }; organization: true };
						};
					};
				}>[];
			}>;
		const map = new SvelteMap<
			string,
			{
				bundleName: string | null;
				items: Prisma.ProductionItemGetPayload<{
					include: {
						asset: {
							include: { product: { include: { manufacturer: true } }; organization: true };
						};
					};
				}>[];
			}
		>();
		for (const item of production.items) {
			const key = item.sourceBundle?.id ?? '__none__';
			if (!map.has(key)) map.set(key, { bundleName: item.sourceBundle?.name ?? null, items: [] });
			map.get(key)!.items.push(item);
		}
		// Standalone items first, then bundles
		const none = map.get('__none__');
		const result = none ? [none] : [];
		for (const [key, group] of map) {
			if (key !== '__none__') result.push(group);
		}
		return result;
	});

	// Crew
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
</script>

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

	<!-- Equipment section -->
	<div>
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-xl font-semibold">Booked Equipment</h2>
			<Button onclick={() => (showAddModal = !showAddModal)}>
				{showAddModal ? 'Done' : 'Add Equipment'}
			</Button>
		</div>

		{#if showAddModal}
			<Card.Root class="mb-6 bg-muted/30">
				<Card.Header>
					<div class="flex items-center gap-4">
						<Card.Title>Add Equipment</Card.Title>
						<div class="flex overflow-hidden rounded-md border border-input text-sm">
							<button
								type="button"
								class="px-3 py-1.5 transition-colors {equipmentTab === 'assets'
									? 'bg-primary text-primary-foreground'
									: 'bg-background hover:bg-muted'}"
								onclick={() => (equipmentTab = 'assets')}>Assets</button
							>
							<button
								type="button"
								class="px-3 py-1.5 transition-colors {equipmentTab === 'bundles'
									? 'bg-primary text-primary-foreground'
									: 'bg-background hover:bg-muted'}"
								onclick={() => (equipmentTab = 'bundles')}>Bundles</button
							>
						</div>
					</div>
					{#if equipmentTab === 'assets'}
						<div class="mt-2">
							<Input
								type="search"
								placeholder="Search by name, manufacturer, S/N…"
								bind:value={searchQuery}
								class="max-w-sm"
							/>
						</div>
					{/if}
				</Card.Header>
				<Card.Content>
					{#if equipmentTab === 'assets'}
						{@const q = searchQuery.toLowerCase().trim()}
						{@const filtered = allAssets.filter((a) => {
							if (!q) return true;
							return (
								a.product.name.toLowerCase().includes(q) ||
								a.product.manufacturer.name.toLowerCase().includes(q) ||
								(a.serialNumber?.toLowerCase().includes(q) ?? false) ||
								(a.assetTag?.toLowerCase().includes(q) ?? false)
							);
						})}
						{#if filtered.length === 0}
							<p class="text-sm text-muted-foreground">No assets found.</p>
						{:else}
							<div class="max-h-72 overflow-y-auto rounded-md border">
								<table class="w-full text-sm">
									<thead class="sticky top-0 bg-muted/80 backdrop-blur-sm">
										<tr class="border-b">
											<th class="px-3 py-2 text-left font-medium text-muted-foreground">Product</th>
											<th class="px-3 py-2 text-left font-medium text-muted-foreground">S/N</th>
											<th class="px-3 py-2 text-left font-medium text-muted-foreground">Org</th>
											<th class="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
											<th class="w-12 px-3 py-2 text-center font-medium text-muted-foreground"
												>Added</th
											>
										</tr>
									</thead>
									<tbody>
										{#each filtered as asset (asset.id)}
											{@const added = addedAssetIds.has(asset.id)}
											<tr
												class="border-b bg-background transition-colors last:border-0 hover:bg-muted/30 {added
													? 'opacity-60'
													: ''}"
											>
												<td class="px-3 py-2">
													<p class="font-medium">{asset.product.name}</p>
													<p class="text-xs text-muted-foreground">
														{asset.product.manufacturer.name}
													</p>
												</td>
												<td class="px-3 py-2 font-mono text-xs">{asset.serialNumber ?? '—'}</td>
												<td class="px-3 py-2 text-xs text-muted-foreground"
													>{asset.organization.name}</td
												>
												<td class="px-3 py-2">
													<span
														class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold {statusClass[
															asset.status
														] ?? ''}"
													>
														{asset.status}
													</span>
												</td>
												<td class="px-3 py-2 text-center">
													<button
														type="button"
														disabled={working}
														onclick={() => {
															if (!added) handleAddAsset(asset.id);
														}}
														class="mx-auto flex h-5 w-5 items-center justify-center rounded border-2 transition-colors {added
															? 'cursor-default border-primary bg-primary text-primary-foreground'
															: 'cursor-pointer border-input hover:border-primary'}"
													>
														{#if added}
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
					{:else if allBundles.length === 0}
						<p class="text-sm text-muted-foreground">
							No bundles found. <a href={resolve('/assets/bundles')} class="underline">Create one</a
							>.
						</p>
					{:else}
						<div class="space-y-2">
							{#each allBundles as bundle (bundle.id)}
								{@const added = addedBundleIds.has(bundle.id)}
								<div
									class="flex items-center justify-between rounded-md border bg-background p-3 {added
										? 'opacity-60'
										: ''}"
								>
									<div>
										<p class="font-medium">{bundle.name}</p>
										<p class="text-xs text-muted-foreground">
											{bundle.organization.name} · {bundle.assets.length} item{bundle.assets
												.length !== 1
												? 's'
												: ''}
										</p>
									</div>
									<button
										type="button"
										disabled={working}
										onclick={() => {
											if (!added) handleAddBundle(bundle.id);
										}}
										class="flex h-5 w-5 items-center justify-center rounded border-2 transition-colors {added
											? 'cursor-default border-primary bg-primary text-primary-foreground'
											: 'cursor-pointer border-input hover:border-primary'}"
									>
										{#if added}
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
								</div>
							{/each}
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
			<div class="space-y-4">
				{#each groupedItems as group (group.bundleName)}
					{#if group.bundleName}
						<div>
							<div class="mb-1 flex items-center gap-2 text-sm font-medium text-muted-foreground">
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
									><path
										d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
									/></svg
								>
								{group.bundleName}
							</div>
							<div class="ml-4 overflow-hidden rounded-lg border bg-card">
								{@render itemTable(group.items)}
							</div>
						</div>
					{:else}
						<div class="overflow-hidden rounded-lg border bg-card">
							{@render itemTable(group.items)}
						</div>
					{/if}
				{/each}
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

{#snippet itemTable(
	items: Prisma.ProductionItemGetPayload<{
		include: {
			asset: { include: { product: { include: { manufacturer: true } }; organization: true } };
		};
	}>[]
)}
	<table class="w-full text-sm">
		<thead>
			<tr class="border-b bg-muted/20">
				<th class="px-4 py-2 text-left font-medium text-muted-foreground">Product</th>
				<th class="px-4 py-2 text-left font-medium text-muted-foreground">Manufacturer</th>
				<th class="px-4 py-2 text-left font-medium text-muted-foreground">Org</th>
				<th class="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
			</tr>
		</thead>
		<tbody>
			{#each items as item (item.id)}
				<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
					<td class="px-4 py-2 font-medium">{item.asset.product.name}</td>
					<td class="px-4 py-2 text-muted-foreground">{item.asset.product.manufacturer.name}</td>
					<td class="px-4 py-2 text-muted-foreground">{item.asset.organization.name}</td>
					<td class="px-4 py-2">
						<span
							class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {statusClass[
								item.status
							] ?? ''}"
						>
							{item.status}
						</span>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}
