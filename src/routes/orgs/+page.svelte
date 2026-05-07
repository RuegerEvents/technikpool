<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { getMyOrgs, getAllOrgs, createOrg } from '$lib/remote/orgs.remote';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import { plural } from '$lib/utils';

	let { data } = $props();

	let orgs = $derived(await (data.isAdmin ? getAllOrgs() : getMyOrgs()));
	let newOrgName = $state('');
	let newOrgPrefix = $state('');
	let creating = $state(false);

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
			await createOrg({ name: newOrgName, assetIdPrefix: newOrgPrefix });
			toast.success(`Organization "${newOrgName}" created!`);
			newOrgName = '';
			newOrgPrefix = '';
		} catch (err) {
			toast.error((err as Error).message);
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
	</div>

	<div class="grid gap-6 md:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Create Organization</Card.Title>
				<Card.Description
					>Create a new organization to manage assets and productions.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<form onsubmit={handleCreateOrg} class="space-y-4">
					<div class="space-y-2">
						<Label for="orgName">Organization Name</Label>
						<Input id="orgName" bind:value={newOrgName} placeholder="e.g. Acme Corp" required />
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
					<Button type="submit" disabled={creating}>
						{creating ? 'Creating...' : 'Create Organization'}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>

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
									<p class="font-medium">{org.name}</p>
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
									<Button variant="outline" href={resolve(`/inventory?org=${org.id}`)}
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
</div>
