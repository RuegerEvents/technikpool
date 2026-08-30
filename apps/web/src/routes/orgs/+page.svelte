<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { getMyOrgs, getAllOrgs, createOrg } from '$lib/remote/orgs.remote';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import { plural, getErrorMessage, orgLabel } from '$lib/utils';
	import { OrgBadge } from '$lib/components/ui/org-badge';
	import { Modal } from '$lib/components/ui/modal';

	let { data } = $props();

	let orgs = $derived(await (data.isAdmin ? getAllOrgs() : getMyOrgs()));
	let newOrgName = $state('');
	let newOrgShortName = $state('');
	let newOrgPrefix = $state('');
	let newOrgColor = $state('#0069c9');
	let newOrgAvatarLabel = $state('');
	let creating = $state(false);
	let createOpen = $state(false);

	const roleLabels: Record<string, string> = {
		OWNER: 'Owner',
		ADMIN: 'Admin',
		MEMBER: 'Member',
		VIEWER: 'Viewer'
	};

	async function handleCreateOrg(e: Event) {
		e.preventDefault();
		if (!newOrgName) return;
		try {
			creating = true;
			await createOrg({
				name: newOrgName,
				shortName: newOrgShortName || undefined,
				assetIdPrefix: newOrgPrefix,
				color: newOrgColor,
				avatarLabel: newOrgAvatarLabel
			});
			toast.success(`Organization "${newOrgName}" created!`);
			newOrgName = '';
			newOrgShortName = '';
			newOrgPrefix = '';
			newOrgColor = '#0069c9';
			newOrgAvatarLabel = '';
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			creating = false;
		}
	}
</script>

<svelte:head><title>Organizations | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Organizations</h1>
			<p class="text-muted-foreground">
				{data.isAdmin
					? 'All organizations in the system.'
					: 'Manage your organizations and memberships.'}
			</p>
		</div>
		<Button onclick={() => (createOpen = true)}>New Organization</Button>
	</div>

	<div class="space-y-4">
		<h2 class="text-xl font-semibold">
			{data.isAdmin ? `All Organizations (${orgs.length})` : 'Your Organizations'}
		</h2>
		{#if orgs.length === 0}
			<p class="text-muted-foreground">
				{data.isAdmin
					? 'No organizations exist yet.'
					: 'You are not a member of any organization yet.'}
			</p>
		{:else}
			<div class="grid gap-4">
				{#each orgs as org (org.id)}
					<Card.Root>
						<Card.Content class="flex items-center justify-between py-4">
							<div>
								<p class="font-medium">
									<OrgBadge name={orgLabel(org)} color={org.color} avatarLabel={org.avatarLabel} />
								</p>
								<p class="text-sm text-muted-foreground">
									{#if org.role}
										Role: {roleLabels[org.role] ?? org.role}
									{:else if data.isAdmin && 'memberCount' in org}
										{plural(org.memberCount, ['# member', '# members'])}
									{/if}
								</p>
							</div>
							<div class="flex gap-2">
								{#if org.role === 'OWNER' || data.isAdmin}
									<Button variant="outline" href={resolve(`/orgs/${org.id}`)}>Manage</Button>
								{/if}
								<Button variant="outline" href={resolve(`/assets?org=${org.id}`)}
									>View Assets</Button
								>
							</div>
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		{/if}
	</div>
</div>

<Modal bind:open={createOpen} title="Create Organization" dismissible={!creating}>
	{#snippet description()}
		Create a new organization to manage assets and productions.
	{/snippet}
	<form id="create-org-form" onsubmit={handleCreateOrg} class="space-y-4">
		<div class="space-y-2">
			<Label for="orgName">Organization Name</Label>
			<Input id="orgName" bind:value={newOrgName} placeholder="e.g. Acme Corp" required />
		</div>
		<div class="space-y-2">
			<Label for="orgShortName"
				>Short Name <span class="text-muted-foreground">(optional)</span></Label
			>
			<Input
				id="orgShortName"
				bind:value={newOrgShortName}
				placeholder="e.g. Acme"
				maxlength={24}
			/>
			<p class="text-xs text-muted-foreground">
				Shown instead of the full name in tables and pickers.
			</p>
		</div>
		<div class="space-y-2">
			<Label for="orgPrefix">Asset ID Prefix</Label>
			<Input
				id="orgPrefix"
				bind:value={newOrgPrefix}
				placeholder="e.g. 123"
				maxlength={3}
				required
				class="w-24"
			/>
			<p class="text-xs text-muted-foreground">
				3-digit prefix for asset IDs (e.g. 123 → 12300001).
			</p>
		</div>
		<div class="flex gap-4">
			<div class="space-y-2">
				<Label for="orgColor">Color</Label>
				<div class="flex gap-2">
					<Input id="orgColor" type="color" bind:value={newOrgColor} class="h-10 w-14 p-1" />
					<Input bind:value={newOrgColor} class="w-28 font-mono" required />
				</div>
			</div>
			<div class="space-y-2">
				<Label for="orgAvatarLabel">Avatar label</Label>
				<Input
					id="orgAvatarLabel"
					bind:value={newOrgAvatarLabel}
					placeholder="e.g. RE"
					maxlength={2}
					required
					class="w-20 font-mono uppercase"
				/>
			</div>
		</div>
		<p class="text-xs text-muted-foreground">
			Color and a 2-letter label identify this org at a glance in the calendar and device lists.
		</p>
	</form>
	{#snippet footer()}
		<Button
			type="button"
			variant="outline"
			onclick={() => (createOpen = false)}
			disabled={creating}
		>
			Cancel
		</Button>
		<Button type="submit" form="create-org-form" disabled={creating}>
			{creating ? 'Creating...' : 'Create Organization'}
		</Button>
	{/snippet}
</Modal>
