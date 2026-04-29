<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
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
		region: string;
		country: string;
	};

	function emptyAddress(): AddressDraft {
		return { line1: '', line2: '', postalCode: '', city: '', region: '', country: '' };
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
					city: newAddress.city,
					region: newAddress.region,
					country: newAddress.country
				}
			});
			toast.success('Location created');
			newName = '';
			newAddress = emptyAddress();
		} catch (err) {
			toast.error((err as Error).message);
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
			city: loc.address?.city ?? '',
			region: loc.address?.region ?? '',
			country: loc.address?.country ?? ''
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
					city: editAddress.city,
					region: editAddress.region,
					country: editAddress.country
				}
			});
			toast.success('Location updated');
			editingId = null;
		} catch (err) {
			toast.error((err as Error).message);
		} finally {
			saving = false;
		}
	}

	function formatAddress(addr: (typeof locations)[number]['address']) {
		if (!addr) return '—';
		const line1 = addr.line1?.trim();
		const line2 = addr.line2?.trim();
		const cityLine = [addr.postalCode?.trim(), addr.city?.trim()].filter(Boolean).join(' ');
		const regionCountry = [addr.region?.trim(), addr.country?.trim()].filter(Boolean).join(', ');
		const parts = [line1, line2, cityLine, regionCountry].filter(Boolean);
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

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2 sm:col-span-2">
							<Label for="line1">Address line 1</Label>
							<Input id="line1" bind:value={newAddress.line1} placeholder="Street and number" />
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="line2">Address line 2</Label>
							<Input id="line2" bind:value={newAddress.line2} placeholder="Building, floor, c/o" />
						</div>
						<div class="space-y-2">
							<Label for="postal">Postal code</Label>
							<Input id="postal" bind:value={newAddress.postalCode} placeholder="12345" />
						</div>
						<div class="space-y-2">
							<Label for="city">City</Label>
							<Input id="city" bind:value={newAddress.city} placeholder="Berlin" />
						</div>
						<div class="space-y-2">
							<Label for="region">Region/State</Label>
							<Input id="region" bind:value={newAddress.region} placeholder="BE" />
						</div>
						<div class="space-y-2">
							<Label for="country">Country</Label>
							<Input id="country" bind:value={newAddress.country} placeholder="DE" />
						</div>
					</div>

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

									<div class="grid gap-4 sm:grid-cols-2">
										<div class="space-y-2 sm:col-span-2">
											<Label for={`edit-line1-${loc.id}`}>Address line 1</Label>
											<Input id={`edit-line1-${loc.id}`} bind:value={editAddress.line1} />
										</div>
										<div class="space-y-2 sm:col-span-2">
											<Label for={`edit-line2-${loc.id}`}>Address line 2</Label>
											<Input id={`edit-line2-${loc.id}`} bind:value={editAddress.line2} />
										</div>
										<div class="space-y-2">
											<Label for={`edit-postal-${loc.id}`}>Postal code</Label>
											<Input id={`edit-postal-${loc.id}`} bind:value={editAddress.postalCode} />
										</div>
										<div class="space-y-2">
											<Label for={`edit-city-${loc.id}`}>City</Label>
											<Input id={`edit-city-${loc.id}`} bind:value={editAddress.city} />
										</div>
										<div class="space-y-2">
											<Label for={`edit-region-${loc.id}`}>Region/State</Label>
											<Input id={`edit-region-${loc.id}`} bind:value={editAddress.region} />
										</div>
										<div class="space-y-2">
											<Label for={`edit-country-${loc.id}`}>Country</Label>
											<Input id={`edit-country-${loc.id}`} bind:value={editAddress.country} />
										</div>
									</div>

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
