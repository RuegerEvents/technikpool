<script lang="ts">
	import { getErrorMessage, orgLabel, plural } from '#lib/utils.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { AddressInput } from '#lib/components/ui/address-input/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { getOrgWithMembers } from '#lib/remote/orgs.remote.js';
	import {
		createLocation,
		getLocations,
		getDefaultLocations,
		getPlaceableLocations,
		mergeLocations,
		setDefaultLocation,
		updateLocation
	} from '#lib/remote/assets.remote.js';
	import { LocationSelect } from '#lib/components/ui/location-select/index.js';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { Star } from '@lucide/svelte';
	import { ContentSkeleton } from '#lib/components/ui/skeleton/index.js';

	let { data } = $props();

	const orgId = $derived(page.params.id as string);
	let orgQuery = $derived(getOrgWithMembers(orgId));
	let org = $derived(orgQuery.current);
	let locationsQuery = $derived(getLocations(orgId));
	let locations = $derived(locationsQuery.current ?? []);

	let myMembership = $derived(org?.members.find((m) => m.userId === data.user?.id));
	let canManage = $derived(
		myMembership?.role === 'OWNER' || myMembership?.role === 'ADMIN' || data.isAdmin
	);

	type AddressDraft = {
		line1: string;
		line2: string;
		postalCode: string;
		city: string;
	};

	function emptyAddress(): AddressDraft {
		return { line1: '', line2: '', postalCode: '', city: '' };
	}

	// One dialog for both jobs: creating is editing a location that doesn't
	// exist yet, and the fields are the same either way. `editingId` is what
	// tells them apart.
	let formOpen = $state(false);
	let editingId = $state<string | null>(null);
	let saving = $state(false);
	let formName = $state('');
	let formAddress = $state<AddressDraft>(emptyAddress());

	function startCreate() {
		editingId = null;
		formName = '';
		formAddress = emptyAddress();
		formOpen = true;
	}

	function startEdit(loc: (typeof locations)[number]) {
		editingId = loc.id;
		formName = loc.name;
		formAddress = {
			line1: loc.address?.line1 ?? '',
			line2: loc.address?.line2 ?? '',
			postalCode: loc.address?.postalCode ?? '',
			city: loc.address?.city ?? ''
		};
		formOpen = true;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!formName.trim()) return;
		saving = true;
		try {
			const address = { ...formAddress };
			if (editingId) {
				await updateLocation({ locationId: editingId, name: formName, address });
				toast.success('Location updated');
			} else {
				await createLocation({ organizationId: orgId, name: formName, address });
				toast.success('Location created');
			}
			formOpen = false;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving = false;
		}
	}

	// Merging folds a duplicate into the place it really is — one of ours, or
	// the friend's own entry for the shelf we had typed in ourselves. Everything
	// kept here moves along, and this location is deleted.
	let mergeSource = $state<(typeof locations)[number] | null>(null);
	let mergeTargetId = $state('');
	let merging = $state(false);
	let placeableQuery = $derived(mergeSource ? getPlaceableLocations() : null);
	let placeable = $derived(placeableQuery?.current ?? []);
	let mergeTarget = $derived(placeable.find((l) => l.id === mergeTargetId));
	let mergeOpen = $derived(mergeSource !== null);

	function startMerge(loc: (typeof locations)[number]) {
		mergeSource = loc;
		mergeTargetId = '';
	}

	async function handleMerge() {
		if (!mergeSource || !mergeTargetId) return;
		merging = true;
		try {
			await mergeLocations({ sourceId: mergeSource.id, targetId: mergeTargetId });
			toast.success('Locations merged');
			mergeSource = null;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			merging = false;
		}
	}

	// The user's own default for this org's new units — the same star as in
	// every location picker. Anyone who belongs to the org may set their own.
	let defaultsQuery = $derived(getDefaultLocations());
	let starredId = $derived(defaultsQuery.current?.[orgId] ?? null);

	async function toggleStar(locationId: string) {
		try {
			await setDefaultLocation({
				organizationId: orgId,
				locationId: starredId === locationId ? null : locationId
			});
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}

	function formatAddress(addr: (typeof locations)[number]['address']) {
		if (!addr) return '—';
		const line1 = addr.line1?.trim();
		const line2 = addr.line2?.trim();
		const cityLine = [addr.postalCode?.trim(), addr.city?.trim()].filter(Boolean).join(' ');
		const parts = [line1, line2, cityLine].filter(Boolean);
		return parts.length ? parts.join(' · ') : '—';
	}
</script>

<svelte:head><title>Locations – {org?.name ?? ''} | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" href={resolve(`orgs/${orgId}`)} class="-ml-3 text-muted-foreground">
			← Organization
		</Button>
	</div>

	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Locations</h1>
			<p class="text-muted-foreground">Manage locations for {org?.name ?? '…'}.</p>
		</div>
		{#if canManage}
			<Button icon="add" onclick={startCreate}>New Location</Button>
		{/if}
	</div>

	{#if !canManage}
		<Card.Root>
			<Card.Content class="pt-6">
				<p class="text-muted-foreground">You don’t have permission to manage locations.</p>
			</Card.Content>
		</Card.Root>
	{/if}

	<div class="space-y-2">
		<h2 class="text-xl font-semibold">Existing Locations ({locations.length})</h2>
		{#if !locationsQuery.ready}
			<ContentSkeleton count={4} error={locationsQuery.error} />
		{:else if locations.length === 0}
			<p class="text-muted-foreground">No locations yet.</p>
		{:else}
			<div class="space-y-3">
				{#each locations as loc (loc.id)}
					<Card.Root>
						<Card.Header>
							<div class="flex flex-wrap items-start justify-between gap-4">
								<div class="min-w-0">
									<div class="flex items-center gap-2">
										<Card.Title class="truncate">{loc.name}</Card.Title>
										<button
											type="button"
											onclick={() => toggleStar(loc.id)}
											title={starredId === loc.id
												? 'Your default — click to clear'
												: 'Make this your default'}
											aria-pressed={starredId === loc.id}
											class="rounded p-1 transition-colors hover:bg-muted {starredId === loc.id
												? 'text-amber-500'
												: 'text-muted-foreground/40 hover:text-muted-foreground'}"
										>
											<Star
												aria-hidden="true"
												class="size-4 {starredId === loc.id ? 'fill-amber-400' : ''}"
											/>
										</button>
									</div>
									<Card.Description>{formatAddress(loc.address)}</Card.Description>
									<p class="mt-1 text-xs text-muted-foreground">
										{plural(loc._count.assets, [
											'1 unit',
											'# units'
										])}{#if loc._count.assetBundles > 0}
											· {plural(loc._count.assetBundles, ['1 case', '# cases'])}{/if}
									</p>
								</div>
								{#if canManage}
									<div class="flex gap-2">
										<Button
											icon="edit"
											type="button"
											variant="outline"
											onclick={() => startEdit(loc)}
										>
											Edit
										</Button>
										<Button type="button" variant="outline" onclick={() => startMerge(loc)}>
											Merge…
										</Button>
									</div>
								{/if}
							</div>
						</Card.Header>
					</Card.Root>
				{/each}
			</div>
		{/if}
	</div>
</div>

<Modal
	bind:open={formOpen}
	title={editingId ? 'Edit Location' : 'Create Location'}
	dismissible={!saving}
>
	{#snippet description()}
		{editingId ? 'Rename it or correct its address.' : 'Add a new storage or pickup location.'}
	{/snippet}
	{#snippet children()}
		<form id="location-form" class="space-y-4" onsubmit={handleSubmit}>
			<div class="space-y-2">
				<Label for="loc-name">Name</Label>
				<Input id="loc-name" bind:value={formName} placeholder="e.g. Warehouse" required />
			</div>
			<AddressInput bind:value={formAddress} idPrefix="loc" />
		</form>
	{/snippet}
	{#snippet footer()}
		<Button icon="save" type="submit" form="location-form" disabled={saving}>
			{saving ? 'Saving…' : editingId ? 'Save' : 'Create Location'}
		</Button>
		<Button
			icon="close"
			type="button"
			variant="outline"
			onclick={() => (formOpen = false)}
			disabled={saving}
		>
			Cancel
		</Button>
	{/snippet}
</Modal>

<Modal
	open={mergeOpen}
	onclose={() => (mergeSource = null)}
	title="Merge location"
	dismissible={!merging}
>
	{#snippet children()}
		{#if mergeSource}
			<div class="space-y-4">
				<p class="text-sm text-muted-foreground">
					Everything kept at <span class="font-medium text-foreground">{mergeSource.name}</span>
					moves to the location you pick, and {mergeSource.name} is deleted. Stocktake reports keep their
					counts under the new name.
				</p>
				<div class="space-y-2">
					<Label for="merge-target">Merge into</Label>
					<LocationSelect
						id="merge-target"
						locations={placeable}
						ownerOrgId={orgId}
						exclude={[mergeSource.id]}
						starrable={false}
						bind:value={mergeTargetId}
						disabled={merging}
					/>
				</div>
				{#if mergeTarget}
					<p class="text-sm">
						{plural(mergeSource._count.assets, ['1 unit', '# units'])} will be at
						<span class="font-medium">{mergeTarget.name}</span
						>{#if mergeTarget.organizationId !== orgId}
							({orgLabel(mergeTarget.organization)}){/if}.
					</p>
				{/if}
			</div>
		{/if}
	{/snippet}
	{#snippet footer()}
		<Button
			type="button"
			variant="destructive"
			onclick={handleMerge}
			disabled={!mergeTargetId || merging}
		>
			{merging ? 'Merging…' : 'Merge and delete'}
		</Button>
		<Button
			icon="close"
			type="button"
			variant="outline"
			onclick={() => (mergeSource = null)}
			disabled={merging}
		>
			Cancel
		</Button>
	{/snippet}
</Modal>
