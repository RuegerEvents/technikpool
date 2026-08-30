<script lang="ts">
	import { getErrorMessage } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { AddressInput } from '$lib/components/ui/address-input';
	import { getOrgWithMembers } from '$lib/remote/orgs.remote';
	import { createLocation, getLocations, updateLocation } from '$lib/remote/assets.remote';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	const orgId = $derived(page.params.id as string);
	let org = $derived(await getOrgWithMembers(orgId));
	let locations = $derived(await getLocations(orgId));

	let myMembership = $derived(org.members.find((m) => m.userId === data.user?.id));
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

	let creating = $state(false);
	let newName = $state('');
	let newAddress = $state<AddressDraft>(emptyAddress());

	async function handleCreate(e: Event) {
		e.preventDefault();
		if (!newName.trim()) return;
		creating = true;
		try {
			await createLocation({
				organizationId: orgId,
				name: newName,
				address: {
					line1: newAddress.line1,
					line2: newAddress.line2,
					postalCode: newAddress.postalCode,
					city: newAddress.city
				}
			});
			toast.success('Location created');
			newName = '';
			newAddress = emptyAddress();
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			creating = false;
		}
	}

	let editingId = $state<string | null>(null);
	let saving = $state(false);
	let editName = $state('');
	let editAddress = $state<AddressDraft>(emptyAddress());

	function startEdit(loc: (typeof locations)[number]) {
		editingId = loc.id;
		saving = false;
		editName = loc.name;
		editAddress = {
			line1: loc.address?.line1 ?? '',
			line2: loc.address?.line2 ?? '',
			postalCode: loc.address?.postalCode ?? '',
			city: loc.address?.city ?? ''
		};
	}

	function cancelEdit() {
		editingId = null;
		saving = false;
		editName = '';
		editAddress = emptyAddress();
	}

	async function handleSave(e: Event) {
		e.preventDefault();
		if (!editingId) return;
		if (!editName.trim()) return;
		saving = true;
		try {
			await updateLocation({
				locationId: editingId,
				name: editName,
				address: {
					line1: editAddress.line1,
					line2: editAddress.line2,
					postalCode: editAddress.postalCode,
					city: editAddress.city
				}
			});
			toast.success('Location updated');
			editingId = null;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			saving = false;
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

<svelte:head><title>Locations – {org.name} | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-4">
		<Button variant="ghost" href={resolve(`/orgs/${orgId}`)} class="-ml-3 text-muted-foreground">
			← Organization
		</Button>
	</div>

	<div>
		<h1 class="text-3xl font-bold tracking-tight">Locations</h1>
		<p class="text-muted-foreground">Manage locations for {org.name}.</p>
	</div>

	{#if !canManage}
		<Card.Root>
			<Card.Content class="pt-6">
				<p class="text-muted-foreground">You don’t have permission to manage locations.</p>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title>Create Location</Card.Title>
				<Card.Description>Add a new storage or pickup location.</Card.Description>
			</Card.Header>
			<Card.Content>
				<form class="space-y-4" onsubmit={handleCreate}>
					<div class="space-y-2">
						<Label for="name">Name</Label>
						<Input id="name" bind:value={newName} placeholder="e.g. Warehouse" required />
					</div>

					<AddressInput bind:value={newAddress} idPrefix="new-loc" />

					<div class="flex justify-end">
						<Button type="submit" disabled={creating}>
							{creating ? 'Creating…' : 'Create Location'}
						</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	<div class="space-y-2">
		<h2 class="text-xl font-semibold">Existing Locations ({locations.length})</h2>
		{#if locations.length === 0}
			<p class="text-muted-foreground">No locations yet.</p>
		{:else}
			<div class="space-y-3">
				{#each locations as loc (loc.id)}
					<Card.Root>
						<Card.Header>
							<div class="flex items-start justify-between gap-4">
								<div class="min-w-0">
									<Card.Title class="truncate">{loc.name}</Card.Title>
									<Card.Description>{formatAddress(loc.address)}</Card.Description>
								</div>
								{#if canManage}
									{#if editingId === loc.id}
										<Button type="button" variant="outline" onclick={cancelEdit}>Cancel</Button>
									{:else}
										<Button type="button" variant="outline" onclick={() => startEdit(loc)}>
											Edit
										</Button>
									{/if}
								{/if}
							</div>
						</Card.Header>

						{#if editingId === loc.id}
							<Card.Content>
								<form class="space-y-4" onsubmit={handleSave}>
									<div class="space-y-2">
										<Label for={`edit-name-${loc.id}`}>Name</Label>
										<Input id={`edit-name-${loc.id}`} bind:value={editName} required />
									</div>

									<AddressInput bind:value={editAddress} idPrefix={`edit-${loc.id}`} />

									<div class="flex justify-end">
										<Button type="submit" disabled={saving}>
											{saving ? 'Saving…' : 'Save'}
										</Button>
									</div>
								</form>
							</Card.Content>
						{/if}
					</Card.Root>
				{/each}
			</div>
		{/if}
	</div>
</div>
