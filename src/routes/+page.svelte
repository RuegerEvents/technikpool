<script lang="ts">
	import { Dialog, DropdownMenu } from 'bits-ui';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import {
		getPendingApprovals,
		approveProductionItem,
		declineProductionItem
	} from '$lib/remote/productions.remote';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';

	let { data } = $props();

	let orgs = $derived(data.user ? await getMyOrgs() : []);
	let adminOrgs = $derived(orgs.filter((o) => o.role === 'ADMIN' || o.role === 'OWNER'));
	let pending = $derived(
		data.user ? (await Promise.all(adminOrgs.map((o) => getPendingApprovals(o.id)))).flat() : []
	);

	type PendingItem = (typeof pending)[number];

	type ProductGroup = {
		productId: string;
		productName: string;
		items: PendingItem[];
	};

	type RequestGroup = {
		productionId: string;
		productionName: string;
		requesterOrg: string;
		productGroups: ProductGroup[];
		allItems: PendingItem[];
	};

	let groups = $derived(
		Object.values(
			pending.reduce<Record<string, RequestGroup>>((acc, item) => {
				if (!acc[item.productionId]) {
					acc[item.productionId] = {
						productionId: item.productionId,
						productionName: item.production.name,
						requesterOrg: item.production.organization.name,
						productGroups: [],
						allItems: []
					};
				}
				const group = acc[item.productionId];
				group.allItems.push(item);
				let pg = group.productGroups.find((p) => p.productId === item.asset.product.id);
				if (!pg) {
					pg = {
						productId: item.asset.product.id,
						productName: item.asset.product.name,
						items: []
					};
					group.productGroups.push(pg);
				}
				pg.items.push(item);
				return acc;
			}, {})
		)
	);

	// Modal state
	type ModalState = { pg: ProductGroup; action: 'approve' | 'decline'; count: number } | null;
	let modal = $state<ModalState>(null);

	function openModal(pg: ProductGroup, action: 'approve' | 'decline') {
		modal = { pg, action, count: 1 };
	}

	async function confirmModal() {
		if (!modal) return;
		const { pg, action, count } = modal;
		modal = null;
		const items = pg.items.slice(0, count);
		if (action === 'approve') await handleApproveAll(items);
		else await handleDeclineAll(items);
	}

	async function handleApproveAll(items: PendingItem[]) {
		const results = await Promise.allSettled(items.map((i) => approveProductionItem(i.id)));
		const failed = results.filter((r) => r.status === 'rejected').length;
		if (failed === 0)
			toast.success(`${items.length} asset${items.length !== 1 ? 's' : ''} approved.`);
		else toast.error(`${failed} of ${items.length} approvals failed.`);
	}

	async function handleDeclineAll(items: PendingItem[]) {
		const results = await Promise.allSettled(items.map((i) => declineProductionItem(i.id)));
		const failed = results.filter((r) => r.status === 'rejected').length;
		if (failed === 0)
			toast.success(`${items.length} asset${items.length !== 1 ? 's' : ''} declined.`);
		else toast.error(`${failed} of ${items.length} declines failed.`);
	}
</script>

<!-- Count picker modal -->
<Dialog.Root
	open={modal !== null}
	onOpenChange={(open) => {
		if (!open) modal = null;
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
		<Dialog.Content
			class="fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg"
		>
			{#if modal}
				<Dialog.Title class="text-base font-semibold">
					{modal.action === 'approve' ? 'Approve' : 'Decline'} some {modal.pg.productName}
				</Dialog.Title>
				<Dialog.Description class="mt-1 text-sm text-muted-foreground">
					How many of the {modal.pg.items.length} units do you want to {modal.action}?
				</Dialog.Description>
				<div class="mt-4 flex items-center gap-3">
					<input
						type="number"
						min="1"
						max={modal.pg.items.length}
						bind:value={modal.count}
						oninput={(e) => {
							if (modal)
								modal.count = Math.min(Math.max(1, +e.currentTarget.value), modal.pg.items.length);
						}}
						class="w-24 rounded-md border border-input bg-background px-3 py-2 text-center text-sm focus:ring-1 focus:ring-ring focus:outline-none"
					/>
					<span class="text-sm text-muted-foreground">of {modal.pg.items.length}</span>
				</div>
				<div class="mt-6 flex justify-end gap-2">
					<Dialog.Close>
						<Button variant="outline">Cancel</Button>
					</Dialog.Close>
					<Button
						variant={modal.action === 'approve' ? 'default' : 'destructive'}
						onclick={confirmModal}
					>
						{modal.action === 'approve' ? 'Approve' : 'Decline'}
						{modal.count}
					</Button>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

{#if !data.user}
	<div class="flex flex-col items-center justify-center py-24 text-center">
		<h1 class="text-4xl font-extrabold tracking-tight lg:text-5xl">Welcome to Technikpool</h1>
		<p class="mt-4 text-xl text-muted-foreground">
			Manage your equipment across organizations seamlessly.
		</p>
		<div class="mt-8 flex gap-4">
			<Button href={resolve('/auth/login')} size="lg">Login</Button>
			<Button href={resolve('/auth/register')} variant="outline" size="lg">Sign Up</Button>
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
					<Card.Title class="text-sm font-medium text-muted-foreground">My Organizations</Card.Title
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
			{#if groups.length === 0}
				<Card.Root>
					<Card.Content class="py-8 text-center text-muted-foreground">
						No pending approvals at this time.
					</Card.Content>
				</Card.Root>
			{:else}
				<div class="grid gap-4">
					{#each groups as group (group.productionId)}
						<Card.Root>
							<Card.Header class="flex flex-row items-start justify-between gap-4 pb-3">
								<div>
									<a
										href={resolve(`/productions/${group.productionId}`)}
										class="font-semibold hover:underline">{group.productionName}</a
									>
									<p class="mt-0.5 text-sm text-muted-foreground">
										Requested by <span class="font-medium text-foreground"
											>{group.requesterOrg}</span
										>
										&middot;
										{group.allItems.length}
										{group.allItems.length === 1 ? 'asset' : 'assets'}
									</p>
								</div>
								<div class="flex shrink-0 gap-2">
									<Button
										variant="outline"
										size="sm"
										onclick={() => handleDeclineAll(group.allItems)}>Decline all</Button
									>
									<Button size="sm" onclick={() => handleApproveAll(group.allItems)}
										>Approve all</Button
									>
								</div>
							</Card.Header>
							<Card.Content class="pt-0">
								<div class="divide-y">
									{#each group.productGroups as pg (pg.productId)}
										<div class="flex items-center justify-between py-2.5">
											<span class="text-sm">
												{#if pg.items.length > 1}
													<span class="font-medium text-muted-foreground">{pg.items.length}×</span>
												{/if}
												{pg.productName}
											</span>
											<div class="flex items-center gap-1.5">
												<Button variant="ghost" size="sm" onclick={() => handleDeclineAll(pg.items)}
													>Decline{pg.items.length > 1 ? ' all' : ''}</Button
												>
												<Button
													variant="outline"
													size="sm"
													onclick={() => handleApproveAll(pg.items)}
													>Approve{pg.items.length > 1 ? ' all' : ''}</Button
												>
												{#if pg.items.length > 1}
													<DropdownMenu.Root>
														<DropdownMenu.Trigger>
															<button
																type="button"
																class="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
																aria-label="Partial actions"
															>
																<svg
																	xmlns="http://www.w3.org/2000/svg"
																	width="15"
																	height="15"
																	viewBox="0 0 24 24"
																	fill="currentColor"
																>
																	<circle cx="12" cy="5" r="1.5" /><circle
																		cx="12"
																		cy="12"
																		r="1.5"
																	/><circle cx="12" cy="19" r="1.5" />
																</svg>
															</button>
														</DropdownMenu.Trigger>
														<DropdownMenu.Portal>
															<DropdownMenu.Content
																align="end"
																sideOffset={4}
																class="z-50 min-w-[160px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
															>
																<DropdownMenu.Item
																	onSelect={() => openModal(pg, 'approve')}
																	class="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent data-[highlighted]:bg-accent"
																	>Approve some…</DropdownMenu.Item
																>
																<DropdownMenu.Item
																	onSelect={() => openModal(pg, 'decline')}
																	class="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm text-destructive transition-colors outline-none hover:bg-accent data-[highlighted]:bg-accent"
																	>Decline some…</DropdownMenu.Item
																>
															</DropdownMenu.Content>
														</DropdownMenu.Portal>
													</DropdownMenu.Root>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							</Card.Content>
						</Card.Root>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}
