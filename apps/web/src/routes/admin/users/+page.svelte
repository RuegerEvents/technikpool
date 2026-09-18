<script lang="ts">
	import { getErrorMessage, orgLabel } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Modal } from '$lib/components/ui/modal';
	import { deleteUser, getAllOrgs, getAllUsers, setUserAdmin } from '$lib/remote/orgs.remote';
	import { getSignUpSettings, inviteUser, setSignUpEnabled } from '$lib/remote/invitations.remote';
	import {
		InvitationLink,
		InvitationList,
		type IssuedInvitation
	} from '$lib/components/ui/invitations';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { ORG_ROLES, type OrgRole } from '$lib/roles';
	import { roleName } from '$lib/role-descriptions.svelte';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';

	let { data } = $props();

	let usersQuery = $derived(getAllUsers());
	let users = $derived(usersQuery.current ?? []);
	let deleteTarget = $state<(typeof users)[number] | null>(null);
	let deleteOpen = $state(false);
	let deleting = $state(false);

	let settingsQuery = $derived(getSignUpSettings());
	let signUpEnabled = $derived(settingsQuery.current?.signUpEnabled ?? false);
	let orgs = $derived(getAllOrgs().current ?? []);

	let inviteEmail = $state('');
	let inviteOrgId = $state('');
	let inviteRole = $state<OrgRole>('MEMBER');
	let inviting = $state(false);
	let issued = $state<IssuedInvitation | null>(null);

	async function handleToggleSignUp(enabled: boolean) {
		try {
			await setSignUpEnabled(enabled);
			toast.success(enabled ? 'Sign-up is open to everyone' : 'Sign-up is by invitation only');
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}

	async function handleInvite(e: Event) {
		e.preventDefault();
		if (!inviteEmail || inviting) return;
		inviting = true;
		try {
			issued = await inviteUser({
				email: inviteEmail,
				...(inviteOrgId ? { organizationId: inviteOrgId, role: inviteRole } : {})
			});
			inviteEmail = '';
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			inviting = false;
		}
	}

	const selectClass =
		'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';

	const roleLabels: Record<string, string> = {
		OWNER: 'Owner',
		ADMIN: 'Admin',
		MEMBER: 'Member',
		VIEWER: 'Viewer'
	};

	async function handleToggleAdmin(userId: string, currentIsAdmin: boolean, name: string) {
		try {
			await setUserAdmin({ userId, isAdmin: !currentIsAdmin });
			toast.success(`${name} ${!currentIsAdmin ? 'granted' : 'revoked'} admin access`);
		} catch (err) {
			toast.error(getErrorMessage(err));
		}
	}

	async function handleDeleteUser() {
		if (!deleteTarget || deleting) return;
		deleting = true;
		try {
			await deleteUser(deleteTarget.id);
			toast.success(`${deleteTarget.name || deleteTarget.email} deleted`);
			deleteOpen = false;
			deleteTarget = null;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head><title>User Management | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">User Management</h1>
		<p class="text-muted-foreground">
			Manage who can get in, and system admin privileges for all users.
		</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Access</Card.Title>
			<Card.Description>
				Who can create an account. An invitation works whether sign-up is open or not.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-6">
			{#if !settingsQuery.ready}
				<ContentSkeleton shape="inline" error={settingsQuery.error} />
			{:else}
				<label class="flex items-start gap-3 text-sm">
					<input
						type="checkbox"
						class="mt-0.5 h-4 w-4"
						checked={signUpEnabled}
						onchange={(e) => handleToggleSignUp(e.currentTarget.checked)}
					/>
					<span>
						<span class="font-medium">Allow anyone to sign up</span>
						<span class="block text-muted-foreground">
							When this is off, the register page only accepts invitation links.
						</span>
					</span>
				</label>
			{/if}

			<form onsubmit={handleInvite} class="space-y-4">
				<div class="grid gap-4 sm:grid-cols-3">
					<div class="space-y-2">
						<Label for="inviteEmail">Email address</Label>
						<Input
							id="inviteEmail"
							type="email"
							bind:value={inviteEmail}
							placeholder="user@example.com"
							required
						/>
					</div>
					<div class="space-y-2">
						<Label for="inviteOrg">Organization</Label>
						<select id="inviteOrg" bind:value={inviteOrgId} class={selectClass}>
							<option value="">No organization</option>
							{#each orgs as org (org.id)}
								<option value={org.id}>{orgLabel(org)}</option>
							{/each}
						</select>
					</div>
					<div class="space-y-2">
						<Label for="inviteRole">Role</Label>
						<select
							id="inviteRole"
							bind:value={inviteRole}
							disabled={!inviteOrgId}
							class="{selectClass} disabled:opacity-50"
						>
							{#each ORG_ROLES as role (role)}
								<option value={role}>{roleName(role)}</option>
							{/each}
						</select>
					</div>
				</div>
				<Button icon="send" type="submit" disabled={inviting}>
					{inviting ? 'Sending…' : 'Send invitation'}
				</Button>
			</form>

			{#if issued}
				<InvitationLink {issued} onclose={() => (issued = null)} />
			{/if}

			<div class="space-y-2">
				<h3 class="text-sm font-medium">Open invitations</h3>
				<InvitationList onissued={(result) => (issued = result)} />
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>All Users ({users.length})</Card.Title>
			<Card.Description>
				System admins can manage all organizations and grant admin access to others.
			</Card.Description>
		</Card.Header>
		<Card.Content class="overflow-x-auto p-0">
			{#if !usersQuery.ready}
				<div class="p-6"><ContentSkeleton count={6} error={usersQuery.error} /></div>
			{:else}
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b text-left text-muted-foreground">
							<th class="px-6 py-3 font-medium">Name</th>
							<th class="px-6 py-3 font-medium">Email</th>
							<th class="px-6 py-3 font-medium">Organizations</th>
							<th class="px-6 py-3 font-medium">Joined</th>
							<th class="px-6 py-3 font-medium"></th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each users as user (user.id)}
							<tr class="hover:bg-muted/30">
								<td class="px-6 py-3">
									<div class="flex items-center gap-2">
										<span class="font-medium">{user.name || '—'}</span>
										{#if user.isAdmin}
											<span
												class="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
												>Admin</span
											>
										{/if}
										{#if user.id === data.user?.id}
											<span
												class="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
												>You</span
											>
										{/if}
									</div>
								</td>
								<td class="px-6 py-3 text-muted-foreground">{user.email}</td>
								<td class="px-6 py-3">
									{#if user.memberships.length === 0}
										<span class="text-muted-foreground">—</span>
									{:else}
										<div class="flex flex-wrap gap-1">
											{#each user.memberships as m (m.organization.id)}
												<a
													href={resolve(`/orgs/${m.organization.id}`)}
													class="rounded border px-1.5 py-0.5 text-xs hover:bg-muted"
												>
													{orgLabel(m.organization)}
													<span class="text-muted-foreground">({roleLabels[m.role] ?? m.role})</span
													>
												</a>
											{/each}
										</div>
									{/if}
								</td>
								<td class="px-6 py-3 text-muted-foreground">
									{new Date(user.createdAt).toLocaleDateString()}
								</td>
								<td class="px-6 py-3 text-right">
									{#if user.id !== data.user?.id}
										<div class="flex justify-end gap-2">
											<Button
												variant={user.isAdmin ? 'destructive' : 'outline'}
												size="sm"
												onclick={() =>
													handleToggleAdmin(user.id, user.isAdmin, user.name || user.email)}
											>
												{user.isAdmin ? 'Revoke Admin' : 'Make Admin'}
											</Button>
											<Button
												variant="destructive"
												size="sm"
												onclick={() => {
													deleteTarget = user;
													deleteOpen = true;
												}}
											>
												Delete
											</Button>
										</div>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<Modal bind:open={deleteOpen} title="Delete user" dismissible={!deleting}>
	{#snippet description()}
		The account, sessions, and organization memberships are permanently removed. Users recorded in
		asset history cannot be deleted.
	{/snippet}
	{#if deleteTarget}
		<p class="text-sm">
			Delete <span class="font-medium">{deleteTarget.name || deleteTarget.email}</span>?
		</p>
	{/if}
	{#snippet footer()}
		<Button icon="close" variant="outline" onclick={() => (deleteTarget = null)} disabled={deleting}
			>Cancel</Button
		>
		<Button icon="delete" variant="destructive" onclick={handleDeleteUser} disabled={deleting}>
			{deleting ? 'Deleting…' : 'Delete user'}
		</Button>
	{/snippet}
</Modal>
