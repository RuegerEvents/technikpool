<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { getAllUsers, setUserAdmin } from '$lib/remote/orgs.remote';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	let users = $derived(await getAllUsers());

	async function handleToggleAdmin(userId: string, currentIsAdmin: boolean, name: string) {
		try {
			await setUserAdmin({ userId, isAdmin: !currentIsAdmin });
			toast.success(`${name} ${!currentIsAdmin ? 'granted' : 'revoked'} admin access`);
		} catch (err: any) {
			toast.error(err.message);
		}
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">User Management</h1>
		<p class="text-muted-foreground">Manage system admin privileges for all users.</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>All Users ({users.length})</Card.Title>
			<Card.Description>
				System admins can manage all organizations and grant admin access to others.
			</Card.Description>
		</Card.Header>
		<Card.Content class="p-0">
			<div class="divide-y">
				{#each users as user (user.id)}
					<div class="flex items-center justify-between px-6 py-4">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<p class="truncate font-medium">{user.name || user.email}</p>
								{#if user.isAdmin}
									<span class="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
										Admin
									</span>
								{/if}
								{#if user.id === data.user?.id}
									<span class="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
										You
									</span>
								{/if}
							</div>
							<p class="truncate text-sm text-muted-foreground">{user.email}</p>
							<p class="text-xs text-muted-foreground">
								Joined {new Date(user.createdAt).toLocaleDateString()}
							</p>
						</div>
						{#if user.id !== data.user?.id}
							<Button
								variant={user.isAdmin ? 'destructive' : 'outline'}
								size="sm"
								onclick={() => handleToggleAdmin(user.id, user.isAdmin, user.name || user.email)}>
								{user.isAdmin ? 'Revoke Admin' : 'Make Admin'}
							</Button>
						{/if}
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>
</div>
