<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { getPendingApprovals, approveProductionItem } from '$lib/remote/productions.remote';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';

	let { data } = $props();

	let orgs = $derived(await getMyOrgs());
	let adminOrgs = $derived(orgs.filter((o) => o.role === 'ADMIN' || o.role === 'OWNER'));
	let pending = $derived((await Promise.all(adminOrgs.map((o) => getPendingApprovals(o.id)))).flat());

	async function handleApprove(itemId: string) {
		try {
			await approveProductionItem(itemId);
			toast.success('Asset approved!');
		} catch (err: any) {
			toast.error(err.message);
		}
	}
</script>

{#if !data.user}
	<div class="flex flex-col items-center justify-center py-24 text-center">
		<h1 class="text-4xl font-extrabold tracking-tight lg:text-5xl">Welcome to Technikpool</h1>
		<p class="mt-4 text-xl text-muted-foreground">
			Manage your equipment across organizations seamlessly.
		</p>
		<div class="mt-8 flex gap-4">
			<Button
				href={resolve('/auth/login')}
				size="lg">Login</Button
			>
			<Button
				href={resolve('/auth/register')}
				variant="outline"
				size="lg">Sign Up</Button
			>
		</div>
	</div>
{:else}
	<div class="space-y-6">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Dashboard</h1>
			<p class="text-muted-foreground">Welcome back, {data.user.name || data.user.email}.</p>
		</div>

		<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="text-sm font-medium text-muted-foreground"
						>My Organizations</Card.Title
					>
				</Card.Header>
				<Card.Content>
					<div class="text-2xl font-bold">{orgs.length}</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header class="pb-2">
					<Card.Title class="text-sm font-medium text-muted-foreground"
						>Pending Approvals</Card.Title
					>
				</Card.Header>
				<Card.Content>
					<div class="text-2xl font-bold">{pending.length}</div>
				</Card.Content>
			</Card.Root>
		</div>

		<div class="mt-8">
			<h2 class="mb-4 text-xl font-semibold">Action Required</h2>
			{#if pending.length === 0}
				<Card.Root>
					<Card.Content class="py-8 text-center text-muted-foreground">
						No pending approvals at this time.
					</Card.Content>
				</Card.Root>
			{:else}
				<div class="grid gap-4">
					{#each pending as item (item.id)}
						<Card.Root>
							<Card.Content class="flex items-center justify-between py-4">
								<div>
									<p class="font-medium">{item.asset.product.name}</p>
									<p class="text-sm text-muted-foreground">
										Requested for {item.production.name} by {item.production.organization.name}
									</p>
								</div>
								<Button onclick={() => handleApprove(item.id)}>Approve</Button>
							</Card.Content>
						</Card.Root>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}
