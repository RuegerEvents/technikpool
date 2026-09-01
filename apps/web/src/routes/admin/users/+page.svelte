<script lang="ts">
	import { getErrorMessage, orgLabel } from '$lib/utils';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Modal } from '$lib/components/ui/modal';
	import { deleteUser, getAllUsers, setUserAdmin } from '$lib/remote/orgs.remote';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	let users = $derived(await getAllUsers());
	let deleteTarget = $state<(typeof users)[number] | null>(null);
	let deleteOpen = $state(false);
	let deleting = $state(false);

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
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">User Management</h1>
			<p class="text-muted-foreground">Manage system admin privileges for all users.</p>
		</div>
		<Button variant="outline" href={resolve('/admin/catalog-log')}>Catalog Log</Button>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>All Users ({users.length})</Card.Title>
			<Card.Description>
				System admins can manage all organizations and grant admin access to others.
			</Card.Description>
		</Card.Header>
		<Card.Content class="p-0">
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
												<span class="text-muted-foreground">({roleLabels[m.role] ?? m.role})</span>
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
