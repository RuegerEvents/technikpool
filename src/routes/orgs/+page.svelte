<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { getMyOrgs, createOrg } from '$lib/remote/orgs.remote';
	import { toast } from 'svelte-sonner';

	let newOrgName = $state('');
	let creating = $state(false);

	async function handleCreateOrg(e: Event) {
		e.preventDefault();
		if (!newOrgName) return;
		try {
			creating = true;
			await createOrg(newOrgName);
			toast.success(`Organization "${newOrgName}" created!`);
			newOrgName = '';
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			creating = false;
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Organizations</h1>
			<p class="text-muted-foreground">Manage your organizations and memberships.</p>
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
					<Button type="submit" disabled={creating}>
						{creating ? 'Creating...' : 'Create Organization'}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>

		<div class="space-y-4">
			<h2 class="text-xl font-semibold">Your Organizations</h2>
			{#if (await getMyOrgs()).length === 0}
				<p class="text-muted-foreground">You are not a member of any organization yet.</p>
			{:else}
				<div class="grid gap-4">
					{#each await getMyOrgs() as org (org.id)}
						<Card.Root>
							<Card.Content class="flex items-center justify-between py-4">
								<div>
									<p class="font-medium">{org.name}</p>
									<p class="text-sm text-muted-foreground">Role: {org.role}</p>
								</div>
								<Button variant="outline" href="/inventory?org={org.id}">View Assets</Button>
							</Card.Content>
						</Card.Root>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
