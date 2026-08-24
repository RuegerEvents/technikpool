<script lang="ts">
	import { Dialog, DropdownMenu } from 'bits-ui';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import {
		getPendingApprovals,
		approveProductionItem,
		declineProductionItem,
		getDashboardStats
	} from '$lib/remote/productions.remote';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import { plural, orgLabel } from '$lib/utils';
	import {
		Package,
		Layers,
		CalendarDays,
		CircleAlert,
		ArrowRight,
		Clapperboard,
		Users,
		Building2,
		Plus,
		ClipboardCheck
	} from '@lucide/svelte';

	let { data } = $props();

	let orgs = $derived(data.user ? await getMyOrgs() : []);
	let adminOrgs = $derived(orgs.filter((o) => o.role === 'ADMIN' || o.role === 'OWNER'));
	let pending = $derived(
		data.user ? (await Promise.all(adminOrgs.map((o) => getPendingApprovals(o.id)))).flat() : []
	);
	let stats = $derived(data.user ? await getDashboardStats() : null);

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
						requesterOrg: orgLabel(item.production.organization),
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
			toast.success(plural(items.length, ['# asset approved.', '# assets approved.']));
		else toast.error(`${failed} of ${items.length} approvals failed.`);
	}

	async function handleDeclineAll(items: PendingItem[]) {
		const results = await Promise.allSettled(items.map((i) => declineProductionItem(i.id)));
		const failed = results.filter((r) => r.status === 'rejected').length;
		if (failed === 0)
			toast.success(plural(items.length, ['# asset declined.', '# assets declined.']));
		else toast.error(`${failed} of ${items.length} declines failed.`);
	}

	function formatDate(d: Date | null | undefined) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString(data.locale === 'en' ? 'en-GB' : 'de-DE', {
			day: '2-digit',
			month: 'short'
		});
	}
</script>

<svelte:head><title>Technikpool</title></svelte:head>

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
	<div class="space-y-8">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Dashboard</h1>
			<p class="text-muted-foreground">Welcome back, {data.user.name || data.user.email}.</p>
		</div>

		<!-- Stats row -->
		{#if stats}
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
				<!-- Assets -->
				<a href={resolve('/assets')} class="group block">
					<Card.Root class="transition-shadow hover:shadow-md">
						<Card.Header class="flex flex-row items-center justify-between pb-2">
							<Card.Title class="text-sm font-medium text-muted-foreground">Total Assets</Card.Title
							>
							<Package class="h-4 w-4 text-muted-foreground" />
						</Card.Header>
						<Card.Content class="space-y-3">
							<div class="text-2xl font-bold">{stats.totalAssets}</div>
							{#if stats.totalAssets > 0}
								<div class="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
									<div
										class="bg-emerald-500"
										style="width: {(stats.assetsByStatus.available / stats.totalAssets) * 100}%"
									></div>
									<div
										class="bg-amber-400"
										style="width: {(stats.assetsByStatus.maintenance / stats.totalAssets) * 100}%"
									></div>
									<div
										class="bg-red-500"
										style="width: {(stats.assetsByStatus.broken / stats.totalAssets) * 100}%"
									></div>
								</div>
								<div class="flex gap-3 text-xs text-muted-foreground">
									<span class="flex items-center gap-1">
										<span class="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
										{stats.assetsByStatus.available} available
									</span>
									{#if stats.assetsByStatus.maintenance > 0}
										<span class="flex items-center gap-1">
											<span class="inline-block h-2 w-2 rounded-full bg-amber-400"></span>
											{stats.assetsByStatus.maintenance} maintenance
										</span>
									{/if}
									{#if stats.assetsByStatus.broken > 0}
										<span class="flex items-center gap-1">
											<span class="inline-block h-2 w-2 rounded-full bg-red-500"></span>
											{stats.assetsByStatus.broken} broken
										</span>
									{/if}
								</div>
							{/if}
						</Card.Content>
					</Card.Root>
				</a>

				<!-- Upcoming productions -->
				<a href={resolve('/productions')} class="group block">
					<Card.Root class="transition-shadow hover:shadow-md">
						<Card.Header class="flex flex-row items-center justify-between pb-2">
							<Card.Title class="text-sm font-medium text-muted-foreground"
								>Upcoming Productions</Card.Title
							>
							<Clapperboard class="h-4 w-4 text-muted-foreground" />
						</Card.Header>
						<Card.Content>
							<div class="text-2xl font-bold">{stats.upcomingProductions.length}</div>
							{#if stats.upcomingProductions.length > 0}
								<p class="mt-1 text-xs text-muted-foreground">
									Next: {stats.upcomingProductions[0].name}
								</p>
							{:else}
								<p class="mt-1 text-xs text-muted-foreground">No upcoming productions</p>
							{/if}
						</Card.Content>
					</Card.Root>
				</a>

				<!-- Bundles -->
				<a href={resolve('/assets/bundles')} class="group block">
					<Card.Root class="transition-shadow hover:shadow-md">
						<Card.Header class="flex flex-row items-center justify-between pb-2">
							<Card.Title class="text-sm font-medium text-muted-foreground"
								>Asset Bundles</Card.Title
							>
							<Layers class="h-4 w-4 text-muted-foreground" />
						</Card.Header>
						<Card.Content>
							<div class="text-2xl font-bold">{stats.bundleCount}</div>
							<p class="mt-1 text-xs text-muted-foreground">
								{plural(orgs.length, ['Across # organization', 'Across # organizations'])}
							</p>
						</Card.Content>
					</Card.Root>
				</a>

				<!-- Overdue DGUV inspections -->
				<a href={resolve('/inspections')} class="group block">
					<Card.Root
						class="transition-shadow hover:shadow-md {stats.overdueInspections > 0
							? 'border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20'
							: ''}"
					>
						<Card.Header class="flex flex-row items-center justify-between pb-2">
							<Card.Title class="text-sm font-medium text-muted-foreground"
								>Overdue Inspections</Card.Title
							>
							<ClipboardCheck class="h-4 w-4 text-muted-foreground" />
						</Card.Header>
						<Card.Content>
							<div class="text-2xl font-bold">{stats.overdueInspections}</div>
							<p class="mt-1 text-xs text-muted-foreground">
								{stats.overdueInspections > 0 ? 'DGUV inspection due' : 'All up to date'}
							</p>
						</Card.Content>
					</Card.Root>
				</a>

				<!-- Pending approvals -->
				<div class="block">
					<Card.Root
						class={pending.length > 0
							? 'border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20'
							: ''}
					>
						<Card.Header class="flex flex-row items-center justify-between pb-2">
							<Card.Title class="text-sm font-medium text-muted-foreground"
								>Pending Approvals</Card.Title
							>
							<CircleAlert
								class="h-4 w-4 {pending.length > 0 ? 'text-amber-500' : 'text-muted-foreground'}"
							/>
						</Card.Header>
						<Card.Content>
							<div class="text-2xl font-bold {pending.length > 0 ? 'text-amber-600' : ''}">
								{pending.length}
							</div>
							<p class="mt-1 text-xs text-muted-foreground">
								{plural(pending.length, [
									'Request needs your attention',
									'Requests need your attention'
								])}
							</p>
						</Card.Content>
					</Card.Root>
				</div>
			</div>

			<!-- Middle row: upcoming productions + quick links -->
			<div class="grid gap-6 lg:grid-cols-3">
				<!-- Upcoming productions list -->
				<div class="lg:col-span-2">
					<div class="mb-3 flex items-center justify-between">
						<h2 class="text-lg font-semibold">Upcoming Productions</h2>
						<Button variant="ghost" size="sm" href={resolve('/productions/new')}>
							<Plus class="mr-1 h-4 w-4" />
							New
						</Button>
					</div>
					<Card.Root>
						{#if stats.upcomingProductions.length === 0}
							<Card.Content class="py-8 text-center text-sm text-muted-foreground">
								No upcoming productions scheduled.
								<br />
								<a
									href={resolve('/productions/new')}
									class="mt-2 inline-block text-primary hover:underline"
									>Create your first production →</a
								>
							</Card.Content>
						{:else}
							<div class="divide-y">
								{#each stats.upcomingProductions as prod (prod.id)}
									<a
										href={resolve(`/productions/${prod.id}`)}
										class="flex items-center justify-between px-4 py-3 transition-colors hover:bg-muted/40"
									>
										<div class="min-w-0">
											<p class="truncate font-medium">{prod.name}</p>
											<p class="text-xs text-muted-foreground">{orgLabel(prod.organization)}</p>
										</div>
										<div class="ml-4 flex shrink-0 items-center gap-4 text-right">
											<div class="hidden text-xs text-muted-foreground sm:block">
												<div class="flex items-center gap-1">
													<Package class="h-3 w-3" />
													{prod._count.items}
												</div>
												<div class="flex items-center gap-1">
													<Users class="h-3 w-3" />
													{prod._count.crew}
												</div>
											</div>
											<div class="text-right">
												<p class="text-sm font-medium">{formatDate(prod.startDate)}</p>
												{#if prod.endDate}
													<p class="text-xs text-muted-foreground">– {formatDate(prod.endDate)}</p>
												{/if}
											</div>
											<ArrowRight class="h-4 w-4 text-muted-foreground" />
										</div>
									</a>
								{/each}
							</div>
							<div class="border-t px-4 py-2">
								<a
									href={resolve('/productions')}
									class="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
								>
									View all productions <ArrowRight class="h-3 w-3" />
								</a>
							</div>
						{/if}
					</Card.Root>
				</div>

				<!-- Quick links -->
				<div>
					<h2 class="mb-3 text-lg font-semibold">Quick Links</h2>
					<div class="space-y-2">
						<a
							href={resolve('/assets/new')}
							class="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50"
						>
							<div class="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
								<Package class="h-4 w-4 text-primary" />
							</div>
							Add Assets
						</a>
						<a
							href={resolve('/productions/new')}
							class="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50"
						>
							<div class="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
								<Clapperboard class="h-4 w-4 text-primary" />
							</div>
							New Production
						</a>
						<a
							href={resolve('/calendar')}
							class="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50"
						>
							<div class="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
								<CalendarDays class="h-4 w-4 text-primary" />
							</div>
							Asset Calendar
						</a>
						<a
							href={resolve('/assets')}
							class="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50"
						>
							<div class="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
								<Layers class="h-4 w-4 text-primary" />
							</div>
							Devices
						</a>
						<a
							href={resolve('/orgs')}
							class="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50"
						>
							<div class="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
								<Building2 class="h-4 w-4 text-primary" />
							</div>
							Organizations
						</a>
					</div>
				</div>
			</div>
		{/if}

		<!-- Action Required -->
		<div>
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
										{plural(group.allItems.length, ['# asset', '# assets'])}
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
