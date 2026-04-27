<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		getOrgWithMembers,
		addUserToOrg,
		removeUserFromOrg,
		updateMemberRole
	} from '$lib/remote/orgs.remote';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';

	let { data } = $props();

	const orgId = $derived(page.params.id as string);
	let org = $derived(await getOrgWithMembers(orgId));

	let myMembership = $derived(org.members.find((m) => m.userId === data.user?.id));
	let canManage = $derived(myMembership?.role === 'OWNER' || data.isAdmin);

	let addEmail = $state('');
	let addRole = $state<'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'>('MEMBER');
	let adding = $state(false);

	async function handleAddUser(e: Event) {
		e.preventDefault();
		if (!addEmail) return;
		try {
			adding = true;
			await addUserToOrg({ orgId, email: addEmail, role: addRole });
			toast.success(`${addEmail} added to organization`);
			addEmail = '';
		} catch (err: any) {
			toast.error(err.message);
		} finally {
			adding = false;
		}
	}

	async function handleRemove(userId: string, name: string) {
		try {
			await removeUserFromOrg({ orgId, userId });
			toast.success(`${name} removed from organization`);
		} catch (err: any) {
			toast.error(err.message);
		}
	}

	async function handleRoleChange(userId: string, role: string) {
		try {
			await updateMemberRole({
				orgId,
				userId,
				role: role as 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'
			});
			toast.success('Role updated');
		} catch (err: any) {
			toast.error(err.message);
		}
	}

	const roleLabels: Record<string, string> = {
		OWNER: 'Owner',
		ADMIN: 'Admin',
		MEMBER: 'Member',
		VIEWER: 'Viewer'
	};
</script>

<div class="space-y-6">
	<div class="flex items-center gap-4">
		<Button
			variant="ghost"
			href={resolve('/orgs')}
			class="flex items-center gap-1 text-muted-foreground">
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="m15 18-6-6 6-6"/>
			</svg>
			Organizations
		</Button>
	</div>

	<div>
		<h1 class="text-3xl font-bold tracking-tight">{org.name}</h1>
		<p class="text-muted-foreground">Manage members and roles.</p>
	</div>

	<div class="grid gap-6 lg:grid-cols-3">
		{#if canManage}
			<Card.Root>
				<Card.Header>
					<Card.Title>Add Member</Card.Title>
					<Card.Description>Add a registered user to this organization by email.</Card.Description>
				</Card.Header>
				<Card.Content>
					<form onsubmit={handleAddUser} class="space-y-4">
						<div class="space-y-2">
							<Label for="addEmail">Email address</Label>
							<Input
								id="addEmail"
								type="email"
								bind:value={addEmail}
								placeholder="user@example.com"
								required />
						</div>
						<div class="space-y-2">
							<Label for="addRole">Role</Label>
							<select
								id="addRole"
								bind:value={addRole}
								class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
								<option value="VIEWER">Viewer</option>
								<option value="MEMBER">Member</option>
								<option value="ADMIN">Admin</option>
								<option value="OWNER">Owner</option>
							</select>
						</div>
						<Button type="submit" disabled={adding} class="w-full">
							{adding ? 'Adding...' : 'Add Member'}
						</Button>
					</form>
				</Card.Content>
			</Card.Root>
		{/if}

		<div class="space-y-4 {canManage ? 'lg:col-span-2' : 'lg:col-span-3'}">
			<h2 class="text-xl font-semibold">Members ({org.members.length})</h2>
			<div class="space-y-2">
				{#each org.members as membership (membership.id)}
					<Card.Root>
						<Card.Content class="flex items-center justify-between py-3">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<p class="truncate font-medium">
										{membership.user.name || membership.user.email}
									</p>
									{#if membership.user.isAdmin}
										<span class="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
											System Admin
										</span>
									{/if}
								</div>
								<p class="truncate text-sm text-muted-foreground">{membership.user.email}</p>
							</div>
							<div class="ml-4 flex items-center gap-2">
								{#if canManage && membership.userId !== data.user?.id}
									<select
										value={membership.role}
										onchange={(e) => handleRoleChange(membership.userId, (e.target as HTMLSelectElement).value)}
										class="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
										<option value="VIEWER">Viewer</option>
										<option value="MEMBER">Member</option>
										<option value="ADMIN">Admin</option>
										<option value="OWNER">Owner</option>
									</select>
									<Button
										variant="destructive"
										size="sm"
										onclick={() => handleRemove(membership.userId, membership.user.name || membership.user.email)}>
										Remove
									</Button>
								{:else}
									<span class="rounded-md border border-input bg-background px-2 py-1 text-sm text-muted-foreground">
										{roleLabels[membership.role]}
									</span>
								{/if}
							</div>
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		</div>
	</div>
</div>
