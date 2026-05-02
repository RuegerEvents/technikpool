<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CategoryPill } from '$lib/components/ui/category-pill';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { getAsset, getAssetHistory, getLocations, updateAsset } from '$lib/remote/assets.remote';

	let assetId = $derived(page.params.id as string);
	let asset = $derived(await getAsset(assetId));
	let history = $derived(await getAssetHistory(assetId));
	let locations = $derived(await getLocations(asset.organizationId));

	const STATUSES = ['AVAILABLE', 'MAINTENANCE', 'BROKEN'] as const;
	type AssetStatus = (typeof STATUSES)[number];

	let editing = $state(false);
	let saving = $state(false);

	let draft = $state({
		serialNumber: '',
		assetTag: '',
		status: 'AVAILABLE' as AssetStatus,
		locationId: '',
		imageUrl: ''
	});

	$effect(() => {
		if (editing) return;
		draft = {
			serialNumber: asset.serialNumber ?? '',
			assetTag: asset.assetTag ?? '',
			status: asset.status as AssetStatus,
			locationId: asset.locationId,
			imageUrl: asset.imageUrl ?? ''
		};
	});

	async function handleSave(e: Event) {
		e.preventDefault();
		saving = true;
		try {
			await updateAsset({
				assetId,
				serialNumber: draft.serialNumber,
				assetTag: draft.assetTag,
				status: draft.status,
				imageUrl: draft.imageUrl,
				locationId: draft.locationId
			});
			toast.success('Asset updated');
			editing = false;
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>{asset.product.name} | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Asset Details</h1>
			<p class="text-muted-foreground">View asset information and history.</p>
		</div>
		<Button variant="outline" href={resolve('/inventory')}>Back to Inventory</Button>
	</div>

	<Card.Root>
		<Card.Header>
			<div class="flex items-start justify-between gap-4">
				<div>
					<Card.Title>Asset</Card.Title>
					<Card.Description>Update serial, tag, status, and location.</Card.Description>
				</div>
				{#if !editing}
					<Button variant="outline" onclick={() => (editing = true)}>Edit</Button>
				{/if}
			</div>
		</Card.Header>
		<Card.Content>
			<form class="space-y-6" onsubmit={handleSave}>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label>Organization</Label>
						<Input value={asset.organization.name} disabled />
					</div>
					<div class="space-y-2">
						<Label>Bundle</Label>
						<Input value={asset.bundle?.name ?? '—'} disabled />
					</div>
					<div class="space-y-2">
						<Label>Manufacturer</Label>
						<Input value={asset.product.manufacturer.name} disabled />
					</div>
					<div class="space-y-2">
						<Label>Product</Label>
						<Input value={asset.product.name} disabled />
					</div>
					<div class="space-y-2">
						<Label>Category</Label>
						<div
							class="flex h-10 items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
						>
							<CategoryPill
								name={asset.product.category.name}
								color={asset.product.category.color}
							/>
						</div>
					</div>
					<div class="space-y-2">
						<Label for="serial">Serial Number</Label>
						<Input id="serial" bind:value={draft.serialNumber} disabled={!editing} />
					</div>
					<div class="space-y-2">
						<Label for="tag">Asset Tag</Label>
						<Input id="tag" bind:value={draft.assetTag} disabled={!editing} />
					</div>
					<div class="space-y-2">
						<Label for="status">Status</Label>
						<select
							id="status"
							bind:value={draft.status}
							disabled={!editing}
							class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#each STATUSES as s (s)}
								<option value={s}>{s}</option>
							{/each}
						</select>
					</div>
					<div class="space-y-2">
						<Label for="location">Location</Label>
						<select
							id="location"
							bind:value={draft.locationId}
							disabled={!editing}
							class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#each locations as loc (loc.id)}
								{@const city = loc.address?.city?.trim()}
								{@const line1 = loc.address?.line1?.trim()}
								{@const addrParts = [line1, city].filter(Boolean).join(', ')}
								<option value={loc.id}>{addrParts ? `${loc.name} (${addrParts})` : loc.name}</option
								>
							{/each}
						</select>
					</div>
					<div class="space-y-2 sm:col-span-2">
						<Label for="image">Image URL</Label>
						<Input
							id="image"
							type="url"
							placeholder="https://…"
							bind:value={draft.imageUrl}
							disabled={!editing}
						/>
					</div>
				</div>

				{#if editing}
					<div class="flex justify-end gap-4">
						<Button
							type="button"
							variant="outline"
							onclick={() => (editing = false)}
							disabled={saving}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={saving}>
							{saving ? 'Saving…' : 'Save'}
						</Button>
					</div>
				{/if}
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Audit Log</Card.Title>
			<Card.Description>History of transactions and status changes for this asset.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			{#if history.length === 0}
				<p class="text-muted-foreground">No history available for this asset.</p>
			{:else}
				<div class="relative ml-3 space-y-8 border-l border-muted-foreground/20 py-4">
					{#each history as item (item.id)}
						<div class="relative pl-6">
							<div
								class="absolute top-1 -left-[5px] h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background"
							></div>
							<div class="flex flex-col gap-1">
								<div class="text-sm font-medium">
									{item.action}
									{#if item.production}
										<span class="font-normal text-muted-foreground">
											for production <span class="font-medium text-foreground"
												>{item.production.name}</span
											>
										</span>
									{/if}
								</div>
								<div class="text-xs text-muted-foreground">
									By {item.user.name || item.user.email} on {new Date(
										item.createdAt
									).toLocaleString()}
								</div>
								{#if item.notes}
									<p
										class="mt-2 rounded-md bg-muted/50 p-2 text-sm whitespace-pre-line text-muted-foreground"
									>
										{item.notes}
									</p>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
