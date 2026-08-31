<script lang="ts">
	import { getErrorMessage } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { AddressInput } from '$lib/components/ui/address-input';
	import { Modal } from '$lib/components/ui/modal';
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

	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Locations</h1>
			<p class="text-muted-foreground">Manage locations for {org.name}.</p>
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
									<Button
										icon="edit"
										type="button"
										variant="outline"
										onclick={() => startEdit(loc)}
									>
										Edit
									</Button>
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
	<form id="location-form" class="space-y-4" onsubmit={handleSubmit}>
		<div class="space-y-2">
			<Label for="loc-name">Name</Label>
			<Input id="loc-name" bind:value={formName} placeholder="e.g. Warehouse" required />
		</div>
		<AddressInput bind:value={formAddress} idPrefix="loc" />
	</form>
	{#snippet footer()}
		<Button
			icon="close"
			type="button"
			variant="outline"
			onclick={() => (formOpen = false)}
			disabled={saving}
		>
			Cancel
		</Button>
		<Button icon="save" type="submit" form="location-form" disabled={saving}>
			{saving ? 'Saving…' : editingId ? 'Save' : 'Create Location'}
		</Button>
	{/snippet}
</Modal>
