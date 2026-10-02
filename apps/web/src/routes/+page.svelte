<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { getMyOrgs } from '#lib/remote/orgs.remote.js';
	import {
		getPendingApprovals,
		getAwaitingApprovals,
		getDashboardStats
	} from '#lib/remote/productions.remote.js';
	import { groupApprovalRequests } from '#lib/approval-requests.js';
	import ApprovalRequestModal from './approval-request-modal.svelte';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import { refreshAll } from '$app/navigation';
	import { plural, orgLabel } from '#lib/utils.js';
	import { canManageInventory, roleAtLeast, ROLE_FOR } from '#lib/roles.js';
	import { billingSetupSteps } from '#lib/billing-setup.svelte.js';
	import { ContentSkeleton } from '#lib/components/ui/skeleton/index.js';
	import { getStocktakes } from '#lib/remote/stocktakes.remote.js';
	import { getHandoverTodos } from '#lib/remote/production-checks.remote.js';
	import { getPackTodos } from '#lib/remote/production-handout.remote.js';
	import { getBillingTodos } from '#lib/remote/billing.remote.js';
	import { BillingTodoActions } from '#lib/components/billing-todo/index.js';
	import StocktakeProgress from '#lib/components/stocktake-progress.svelte';
	import { formatReleaseDate, notesFor, releases } from '#lib/changelog.js';
	import {
		Package,
		Layers,
		CircleAlert,
		CircleCheck,
		ArrowRight,
		Users,
		Building2,
		Plus,
		Hourglass,
		ChevronRight,
		Sparkles,
		ReceiptText,
		PackageCheck,
		PackageOpen,
		Undo2
	} from '@lucide/svelte';

	let { data } = $props();

	// Compiled in, so unlike everything else on this page it needs no query and
	// never suspends — the card is there in the first frame.
	const latestRelease = releases[0];
	const releaseNotes = $derived(notesFor(latestRelease, data.locale));

	// Read through the queries rather than awaited: an `await` in a `$derived`
	// holds the whole page back until it answers, so the dashboard would show
	// nothing at all — not even its heading — while the counts were being
	// totted up. See CLAUDE.md, "Loading states".
	//
	// None of them is asked without an org: every answer would be a zero, and the
	// page says what to do about that instead.
	let active = $derived(!!data.user && data.hasOrg);
	let orgsQuery = $derived(active ? getMyOrgs() : null);
	let orgs = $derived(orgsQuery?.current ?? []);
	let adminOrgs = $derived(orgs.filter(canManageInventory));
	// Billing setup of the home org, for whoever can change it. Only the home org:
	// someone who owns several would otherwise get a card per org they never
	// bill from.
	let homeOrg = $derived(orgs.find((o) => o.id === data.homeOrgId));
	let billingSteps = $derived(
		homeOrg && (data.isAdmin || roleAtLeast(homeOrg.role, ROLE_FOR.organization))
			? billingSetupSteps(homeOrg)
			: []
	);
	let billingMissing = $derived(
		billingSteps
			.filter((step) => !step.done)
			.map((step) => step.label)
			.join(', ')
	);
	let billingIncomplete = $derived(billingMissing !== '');
	let pendingQueries = $derived(active ? adminOrgs.map((o) => getPendingApprovals(o.id)) : []);
	let pendingReady = $derived(pendingQueries.every((q) => q.ready));
	let pending = $derived(pendingQueries.flatMap((q) => q.current ?? []));
	let awaitingQuery = $derived(active ? getAwaitingApprovals() : null);
	let awaiting = $derived(awaitingQuery?.current ?? []);
	let handoverQuery = $derived(active ? getHandoverTodos() : null);
	let toReceive = $derived(handoverQuery?.current?.toReceive ?? []);
	let toTakeBack = $derived(handoverQuery?.current?.toTakeBack ?? []);
	// Our units another org's production has booked, starting within the week.
	let packQuery = $derived(active ? getPackTodos() : null);
	let toPack = $derived(packQuery?.current ?? []);
	// Productions our orgs still have to invoice — to a customer, or to the
	// org we lent to. See services/billing-todos.ts.
	let billingQuery = $derived(active ? getBillingTodos() : null);
	let toBill = $derived(billingQuery?.current ?? []);
	let statsQuery = $derived(active ? getDashboardStats() : null);
	let stocktakesQuery = $derived(active ? getStocktakes() : null);
	let openStocktakes = $derived(
		(stocktakesQuery?.current ?? []).filter((s) => s.status === 'OPEN')
	);
	let stats = $derived(statsQuery?.current ?? null);

	type AttentionItem = {
		key: string;
		count: number;
		label: string;
		hint: string;
		href: string;
		tone: 'red' | 'amber' | 'neutral';
	};

	// Held back until everything it counts has answered, so "All clear" never
	// flashes up in front of a queue that is still loading.
	let attentionReady = $derived(
		!!stats &&
			pendingReady &&
			!!awaitingQuery?.ready &&
			!!handoverQuery?.ready &&
			!!packQuery?.ready &&
			!!billingQuery?.ready
	);
	let attention = $derived.by(() => {
		if (!stats) return [];
		const items: AttentionItem[] = [];
		if (requests.length > 0)
			items.push({
				key: 'pending',
				count: requests.length,
				label: plural(requests.length, ['Request to approve', 'Requests to approve']),
				hint: 'Other organizations want your equipment',
				href: '#approvals',
				tone: 'amber'
			});
		if (stats.assetsByStatus.broken > 0)
			items.push({
				key: 'broken',
				count: stats.assetsByStatus.broken,
				label: plural(stats.assetsByStatus.broken, ['Broken device', 'Broken devices']),
				hint: 'Needs repair',
				href: `${resolve('assets')}?status=BROKEN&org=all`,
				tone: 'red'
			});
		if (stats.overdueInspections > 0)
			items.push({
				key: 'inspections',
				count: stats.overdueInspections,
				label: plural(stats.overdueInspections, ['Overdue inspection', 'Overdue inspections']),
				hint: 'DGUV inspection due',
				href: resolve('inspections'),
				tone: 'amber'
			});
		if (stats.assetsByStatus.maintenance > 0)
			items.push({
				key: 'maintenance',
				count: stats.assetsByStatus.maintenance,
				label: 'In maintenance',
				hint: 'Back in the pool once repaired',
				href: `${resolve('assets')}?status=MAINTENANCE&org=all`,
				tone: 'neutral'
			});
		const receiveCount = toReceive.reduce((sum, p) => sum + p.count, 0);
		if (receiveCount > 0)
			items.push({
				key: 'receive',
				count: receiveCount,
				label: 'Receipt to confirm',
				hint: 'Lent to your productions and handed over',
				href: '#handovers',
				tone: 'amber'
			});
		const takeBackCount = toTakeBack.reduce((sum, p) => sum + p.count, 0);
		if (takeBackCount > 0)
			items.push({
				key: 'take-back',
				count: takeBackCount,
				label: 'Reported returned',
				hint: 'Scan it back onto a shelf',
				href: '#handovers',
				tone: 'amber'
			});
		const packCount = toPack.reduce((sum, p) => sum + p.count, 0);
		if (packCount > 0)
			items.push({
				key: 'pack',
				count: packCount,
				label: 'To pack for others',
				hint: 'Lent out, starting within a week',
				href: '#pack',
				tone: 'amber'
			});
		if (toBill.length > 0)
			items.push({
				key: 'billing',
				count: toBill.length,
				label: plural(toBill.length, ['Production to invoice', 'Productions to invoice']),
				hint: 'Handed out or over, no invoice sent yet',
				href: '#billing',
				tone: 'amber'
			});
		const awaitingCount = awaiting.reduce((sum, req) => sum + req.count, 0);
		if (awaitingCount > 0)
			items.push({
				key: 'awaiting',
				count: awaitingCount,
				label: 'Awaiting approval',
				hint: 'Requested from other organizations',
				href: '#awaiting',
				tone: 'neutral'
			});
		return items;
	});

	// An in-page link to a section that is already on screen — the side column
	// on a desktop — scrolls nowhere, so the click looked like it did nothing.
	// Scroll if there is somewhere to go, and flash the section's cards either
	// way so the eye lands on what the link meant. Done by hand rather than via
	// `:target`, which fires once and not again for a second click on the
	// same hash.
	function jumpTo(event: MouseEvent, href: string) {
		if (!href.startsWith('#')) return;
		const section = document.getElementById(href.slice(1));
		if (!section) return;
		event.preventDefault();
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		section.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
		for (const card of section.querySelectorAll<HTMLElement>('[data-slot="card"]')) {
			card.animate(
				[
					{ boxShadow: '0 0 0 0 transparent' },
					{ boxShadow: '0 0 0 3px var(--ring)' },
					{ boxShadow: '0 0 0 0 transparent' }
				],
				{ duration: 1200, easing: 'ease-in-out' }
			);
		}
	}

	let requests = $derived(groupApprovalRequests(pending));

	// Held by key rather than as the request itself, so the dialog shows what
	// is still waiting after every decision and closes on its own once nothing
	// is left.
	let openRequestKey = $state<string | null>(null);
	let openRequest = $derived(requests.find((r) => r.key === openRequestKey) ?? null);

	let rangeFormat = $derived(
		new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', month: 'short' })
	);

	function formatPeriod(start: Date | null, end: Date | null) {
		if (!start) return '—';
		return end
			? rangeFormat.formatRange(new Date(start), new Date(end))
			: rangeFormat.format(new Date(start));
	}

	function formatDate(d: Date | null | undefined) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString(dateLocale(), {
			day: '2-digit',
			month: 'short'
		});
	}

	// Calendar days, not 24-hour spans: something at 9:00 tomorrow is
	// "tomorrow" at 23:00 today as well.
	function daysUntil(d: Date) {
		const dayNumber = (x: Date) =>
			Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86_400_000;
		return dayNumber(new Date(d)) - dayNumber(new Date());
	}

	function isRunning(prod: { startDate: Date; endDate: Date | null }) {
		const now = Date.now();
		return (
			new Date(prod.startDate).getTime() <= now &&
			(!prod.endDate || new Date(prod.endDate).getTime() >= now)
		);
	}

	function dateLocale() {
		return data.locale === 'en' ? 'en-GB' : 'de-DE';
	}

	function dayOfMonth(d: Date) {
		return new Date(d).getDate();
	}

	function monthShort(d: Date) {
		return new Date(d).toLocaleDateString(dateLocale(), { month: 'short' }).replace('.', '');
	}

	// `hasOrg` comes from the layout's server load, which has no reason to run
	// again while someone sits on this page waiting to be added.
	let checking = $state(false);

	async function checkAgain() {
		checking = true;
		try {
			await refreshAll();
			if (!data.hasOrg) toast.info('You have not been added to an organization yet.');
		} finally {
			checking = false;
		}
	}
</script>

<svelte:head><title>Technikpool</title></svelte:head>

{#if openRequest}
	<ApprovalRequestModal
		request={openRequest}
		locale={data.locale}
		onclose={() => (openRequestKey = null)}
	/>
{/if}

{#if !data.user}
	<div class="flex flex-col items-center justify-center py-24 text-center">
		<h1 class="text-4xl font-extrabold tracking-tight lg:text-5xl">Welcome to Technikpool</h1>
		<p class="mt-4 text-xl text-muted-foreground">
			Manage your equipment across organizations seamlessly.
		</p>
		<div class="mt-8 flex gap-4">
			<Button href={resolve('auth/login')} size="lg">Login</Button>
			<Button href={resolve('auth/register')} variant="outline" size="lg">Sign Up</Button>
		</div>
	</div>
{:else if !data.hasOrg}
	<div class="mx-auto flex max-w-xl flex-col items-center py-16 text-center">
		<div class="flex size-14 items-center justify-center rounded-full bg-muted">
			<Building2 aria-hidden="true" class="size-7 text-muted-foreground" />
		</div>
		<h1 class="mt-6 text-3xl font-bold tracking-tight">You are not in an organization yet</h1>
		<p class="mt-3 text-muted-foreground">
			Devices, productions and everything else belong to an organization, so there is nothing to
			show you yet. Create one — you become its owner — or ask an owner of an existing one to add
			you with this email address:
		</p>
		<p class="mt-4 rounded-md border bg-card px-4 py-2 font-mono text-sm select-all">
			{data.user.email}
		</p>
		<div class="mt-8 flex flex-wrap justify-center gap-3">
			<Button href={resolve('orgs?new')}>
				<Plus aria-hidden="true" class="mr-1 size-4" />
				New Organization
			</Button>
			<Button variant="outline" onclick={checkAgain} disabled={checking}>Check again</Button>
		</div>
	</div>
{:else}
	<div class="space-y-6">
		<div class="flex flex-wrap items-end justify-between gap-4">
			<div>
				<h1 class="text-3xl font-bold tracking-tight">Dashboard</h1>
				<p class="text-muted-foreground">Welcome back, {data.user.name || data.user.email}.</p>
			</div>
			<div class="flex flex-wrap gap-2">
				<Button variant="outline" href={resolve('assets/new')}>
					<Package aria-hidden="true" class="mr-1 size-4" />
					Add Assets
				</Button>
				<Button href={resolve('productions/new')}>
					<Plus aria-hidden="true" class="mr-1 size-4" />
					New Production
				</Button>
			</div>
		</div>

		<!-- Needs attention: only what someone can act on, and only when it is not
		     zero. A row of calm zeros next to one amber number is exactly how the
		     number gets missed. The billing to-do is a strip of its own because it
		     has nothing to count, and it keeps "All clear" from being said over it. -->
		{#if homeOrg && billingIncomplete}
			<!-- eslint-disable svelte/no-navigation-without-resolve -- resolved, plus a hash -->
			<a
				href={resolve(`orgs/${homeOrg.id}`) + '#billing'}
				class="group flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-50/60 px-4 py-3 text-sm transition-colors hover:bg-amber-50 dark:bg-amber-950/20 dark:hover:bg-amber-950/40"
			>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
				<ReceiptText
					aria-hidden="true"
					class="size-5 shrink-0 text-amber-600 dark:text-amber-400"
				/>
				<span class="min-w-0 flex-1 leading-tight">
					<span class="block font-medium"
						>Billing details of {orgLabel(homeOrg)} are incomplete</span
					>
					<span class="block text-xs text-muted-foreground"
						>Missing: {billingMissing}. Offers and invoices can only be generated once these are
						filled in.</span
					>
				</span>
				<ArrowRight
					aria-hidden="true"
					class="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
				/>
			</a>
		{/if}
		{#if !attentionReady}
			<ContentSkeleton shape="block" class="h-16" error={statsQuery?.error} />
		{:else if attention.length === 0}
			{#if !billingIncomplete}
				<div
					class="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-50/60 px-4 py-3 text-sm dark:bg-emerald-950/20"
				>
					<CircleCheck aria-hidden="true" class="size-5 shrink-0 text-emerald-600" />
					<span>
						<span class="font-medium">All clear.</span>
						<span class="text-muted-foreground">Nothing needs your attention right now.</span>
					</span>
				</div>
			{/if}
		{:else}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{#each attention as item (item.key)}
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						href={item.href}
						onclick={(event) => jumpTo(event, item.href)}
						class="group flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors {item.tone ===
						'red'
							? 'border-red-500/40 bg-red-50/60 hover:bg-red-50 dark:bg-red-950/20 dark:hover:bg-red-950/40'
							: item.tone === 'amber'
								? 'border-amber-500/40 bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-950/20 dark:hover:bg-amber-950/40'
								: 'bg-card hover:bg-muted/50'}"
					>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
						<span
							class="text-2xl font-bold tabular-nums {item.tone === 'red'
								? 'text-red-600 dark:text-red-400'
								: item.tone === 'amber'
									? 'text-amber-600 dark:text-amber-400'
									: ''}">{item.count}</span
						>
						<span class="min-w-0 flex-1 text-sm leading-tight">
							<span class="block font-medium">{item.label}</span>
							<span class="block text-xs text-muted-foreground">{item.hint}</span>
						</span>
						<ArrowRight
							aria-hidden="true"
							class="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
						/>
					</a>
				{/each}
			</div>
		{/if}

		<div class="grid items-start gap-6 lg:grid-cols-3">
			<div class="space-y-6 lg:col-span-2">
				<!-- Action Required: the one section with buttons, so it comes first
				     when it has anything in it and disappears when it doesn't — the
				     strip above already says "all clear". -->
				{#if !pendingReady}
					<ContentSkeleton count={3} error={pendingQueries.find((q) => q.error)?.error} />
				{:else if requests.length > 0}
					<section id="approvals" class="scroll-mt-20">
						<h2 class="mb-3 flex items-center gap-2 text-lg font-semibold">
							<CircleAlert aria-hidden="true" class="size-5 text-amber-500" />
							Requests to approve
						</h2>
						<!-- One line per request; the equipment itself is in the dialog,
						     where there is room to nest cases and accessories. -->
						<Card.Root class="gap-0 overflow-hidden py-0">
							<div class="divide-y">
								{#each requests as request (request.key)}
									<button
										type="button"
										onclick={() => (openRequestKey = request.key)}
										class="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/40"
									>
										<div
											class="flex w-12 shrink-0 flex-col items-center rounded-md border bg-muted py-1 leading-none"
										>
											<span class="text-lg font-bold tabular-nums"
												>{request.startDate ? dayOfMonth(request.startDate) : '–'}</span
											>
											<span class="text-[10px] tracking-wide text-muted-foreground uppercase"
												>{request.startDate ? monthShort(request.startDate) : ''}</span
											>
										</div>
										<div class="min-w-0 flex-1">
											<p class="truncate font-medium">{request.productionName}</p>
											<p class="truncate text-xs text-muted-foreground">
												{request.requesterOrg}
												&middot;
												{formatPeriod(request.startDate, request.endDate)}
											</p>
										</div>
										{#if request.unpaid}
											<span
												class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200"
												>Unpaid</span
											>
										{/if}
										<span class="shrink-0 text-xs text-muted-foreground">
											{plural(request.unitCount, ['# device', '# devices'])}
										</span>
										<ChevronRight
											aria-hidden="true"
											class="size-4 shrink-0 text-muted-foreground"
										/>
									</button>
								{/each}
							</div>
						</Card.Root>
					</section>
				{/if}

				<!-- Productions: running and upcoming, soonest first. The date is
				     the thing people scan for, so it gets the tile on the left. -->
				<section>
					<div class="mb-3 flex items-center justify-between">
						<h2 class="text-lg font-semibold">Productions</h2>
						<Button variant="ghost" size="sm" href={resolve('productions')}>
							View all
							<ArrowRight aria-hidden="true" class="ml-1 size-4" />
						</Button>
					</div>
					{#if !stats}
						<ContentSkeleton count={4} error={statsQuery?.error} />
					{:else if stats.upcomingProductions.length === 0}
						<Card.Root>
							<Card.Content class="py-10 text-center text-sm text-muted-foreground">
								No upcoming productions scheduled.
								<br />
								<a
									href={resolve('productions/new')}
									class="mt-2 inline-block text-primary hover:underline">Create a production →</a
								>
							</Card.Content>
						</Card.Root>
					{:else}
						<Card.Root class="gap-0 overflow-hidden py-0">
							<div class="divide-y">
								{#each stats.upcomingProductions as prod (prod.id)}
									{@const days = daysUntil(prod.startDate)}
									{@const running = days < 0 || (days === 0 && isRunning(prod))}
									<a
										href={resolve(`productions/${prod.id}`)}
										class="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
									>
										<div
											class="flex w-12 shrink-0 flex-col items-center rounded-md border py-1 leading-none {running
												? 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30'
												: days <= 7
													? 'bg-muted'
													: ''}"
										>
											<span class="text-lg font-bold tabular-nums"
												>{dayOfMonth(prod.startDate)}</span
											>
											<span class="text-[10px] tracking-wide text-muted-foreground uppercase"
												>{monthShort(prod.startDate)}</span
											>
										</div>
										<div class="min-w-0 flex-1">
											<p class="flex items-center gap-2 font-medium">
												<span class="truncate">{prod.name}</span>
												{#if prod.onLoan}
													<span
														class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
														title="Another organization's production that yours lends equipment to"
														>On loan</span
													>
												{/if}
											</p>
											<p class="truncate text-xs text-muted-foreground">
												{orgLabel(prod.organization)}
												{#if prod.endDate}
													&middot; until {formatDate(prod.endDate)}
												{/if}
											</p>
										</div>
										<div
											class="hidden shrink-0 items-center gap-3 text-xs text-muted-foreground sm:flex"
										>
											<span class="flex items-center gap-1" title="Assets">
												<Package aria-hidden="true" class="size-3.5" />
												{prod._count.items}
											</span>
											<span class="flex items-center gap-1" title="Crew">
												<Users aria-hidden="true" class="size-3.5" />
												{prod._count.crew}
											</span>
										</div>
										<span
											class="w-24 shrink-0 text-right text-xs font-medium {running
												? 'text-emerald-600 dark:text-emerald-400'
												: days <= 7
													? 'text-foreground'
													: 'text-muted-foreground'}"
										>
											{#if running}
												Running now
											{:else if days === 0}
												Today
											{:else if days === 1}
												Tomorrow
											{:else}
												{plural(days, ['In # day', 'In # days'])}
											{/if}
										</span>
									</a>
								{/each}
							</div>
							{#if stats.upcomingCount > stats.upcomingProductions.length}
								<div class="border-t px-4 py-2 text-xs text-muted-foreground">
									{plural(stats.upcomingCount - stats.upcomingProductions.length, [
										'# more production planned',
										'# more productions planned'
									])}
								</div>
							{/if}
						</Card.Root>
					{/if}
				</section>
			</div>

			<!-- Side column: reference, not work. Quieter type, smaller cards. -->
			<aside class="space-y-6">
				<!-- Only while something is being counted: a finished stocktake is
				     reference, and lives on its own page. -->
				{#if openStocktakes.length > 0}
					<section>
						<div class="mb-3 flex items-center justify-between">
							<h2 class="text-lg font-semibold">Stocktakes</h2>
							<Button variant="ghost" size="sm" href={resolve('stocktakes')}>
								View all
								<ArrowRight aria-hidden="true" class="ml-1 size-4" />
							</Button>
						</div>
						<Card.Root class="gap-0 overflow-hidden py-0">
							<div class="divide-y">
								{#each openStocktakes as st (st.id)}
									<a
										href={resolve(`stocktakes/${st.id}`)}
										class="block space-y-2 px-4 py-3 transition-colors hover:bg-muted/40"
									>
										<p class="truncate text-sm font-medium">{st.name}</p>
										<StocktakeProgress progress={st.progress} />
									</a>
								{/each}
							</div>
						</Card.Root>
					</section>
				{/if}
				<section>
					<h2 class="mb-3 text-lg font-semibold">Inventory</h2>
					{#if !stats}
						<ContentSkeleton shape="block" class="h-36" error={statsQuery?.error} />
					{:else}
						<Card.Root>
							<Card.Content class="space-y-3">
								<a href={resolve('assets')} class="flex items-baseline justify-between">
									<span class="text-3xl font-bold tabular-nums">{stats.totalAssets}</span>
									<span class="text-sm text-muted-foreground hover:text-foreground">Devices →</span>
								</a>
								{#if stats.totalAssets > 0}
									<div class="flex h-2 w-full overflow-hidden rounded-full bg-muted">
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
									<dl class="space-y-1 text-sm">
										<div class="flex items-center justify-between">
											<dt class="flex items-center gap-2 text-muted-foreground">
												<span class="size-2 rounded-full bg-emerald-500"></span>Available
											</dt>
											<dd class="tabular-nums">{stats.assetsByStatus.available}</dd>
										</div>
										<div class="flex items-center justify-between">
											<dt class="flex items-center gap-2 text-muted-foreground">
												<span class="size-2 rounded-full bg-amber-400"></span>Maintenance
											</dt>
											<dd class="tabular-nums">{stats.assetsByStatus.maintenance}</dd>
										</div>
										<div class="flex items-center justify-between">
											<dt class="flex items-center gap-2 text-muted-foreground">
												<span class="size-2 rounded-full bg-red-500"></span>Broken
											</dt>
											<dd class="tabular-nums">{stats.assetsByStatus.broken}</dd>
										</div>
									</dl>
								{/if}
								<div
									class="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground"
								>
									<a
										href={resolve('assets/bundles')}
										class="flex items-center gap-1.5 hover:text-foreground"
									>
										<Layers aria-hidden="true" class="size-3.5" />
										{plural(stats.bundleCount, ['# bundle', '# bundles'])}
									</a>
									<a href={resolve('orgs')} class="flex items-center gap-1.5 hover:text-foreground">
										<Building2 aria-hidden="true" class="size-3.5" />
										{plural(orgs.length, ['# organization', '# organizations'])}
									</a>
								</div>
							</Card.Content>
						</Card.Root>
					{/if}
				</section>

				{#if toBill.length > 0}
					<section id="billing" class="scroll-mt-20">
						<h2 class="mb-3 text-lg font-semibold">To invoice</h2>
						<Card.Root class="gap-0 overflow-hidden py-0">
							<div class="divide-y">
								{#each toBill as t (`${t.productionId}:${t.organizationId}`)}
									<div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
										<a href={resolve(`productions/${t.productionId}`)} class="min-w-0 flex-1">
											<p class="truncate text-sm font-medium hover:underline">
												{t.productionName}
											</p>
											<p class="truncate text-xs text-muted-foreground">
												{t.organizationName} → {t.recipientName ?? 'no customer yet'} · {formatPeriod(
													t.startDate,
													t.endDate
												)}
											</p>
										</a>
										<BillingTodoActions todo={t} />
									</div>
								{/each}
							</div>
						</Card.Root>
					</section>
				{/if}

				<!-- Our units booked by another org's production that starts within a
				     week and nobody has handed out yet: the lender's packing list.
				     Packing earlier goes through the productions list's "Pack". -->
				{#if toPack.length > 0}
					<section id="pack" class="scroll-mt-20">
						<h2 class="mb-3 text-lg font-semibold">To pack for others</h2>
						<Card.Root class="gap-0 overflow-hidden py-0">
							<div class="divide-y">
								{#each toPack as p (`${p.productionId}:${p.organizationId}`)}
									<!-- resolve() takes a path only; the query is the lender's side. -->
									<!-- eslint-disable svelte/no-navigation-without-resolve -->
									<a
										href={`${resolve(`productions/${p.productionId}/checkout`)}?org=${encodeURIComponent(p.organizationId)}`}
										class="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
									>
										<!-- eslint-enable svelte/no-navigation-without-resolve -->
										<PackageOpen aria-hidden="true" class="size-4 shrink-0 text-amber-500" />
										<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-medium">{p.productionName}</p>
											<p class="truncate text-xs text-muted-foreground">
												{p.organizationName} · {plural(p.count, [
													'1 unit to pack',
													'# units to pack'
												])}
											</p>
										</div>
										<span class="shrink-0 text-xs text-muted-foreground"
											>{formatDate(p.startDate)}</span
										>
									</a>
								{/each}
							</div>
						</Card.Root>
					</section>
				{/if}

				<!-- Loans changing hands: lent units our productions have not confirmed
				     receiving, and our own units reported sent back that nobody has
				     scanned in yet. -->
				{#if toReceive.length > 0 || toTakeBack.length > 0}
					<section id="handovers" class="scroll-mt-20">
						<h2 class="mb-3 text-lg font-semibold">Handovers</h2>
						<Card.Root class="gap-0 overflow-hidden py-0">
							<div class="divide-y">
								{#each toReceive as p (p.productionId)}
									<a
										href={resolve(`productions/${p.productionId}`)}
										class="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
									>
										<PackageCheck aria-hidden="true" class="size-4 shrink-0 text-amber-500" />
										<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-medium">{p.productionName}</p>
											<p class="truncate text-xs text-muted-foreground">
												{plural(p.count, ['1 lent unit to confirm', '# lent units to confirm'])}
											</p>
										</div>
									</a>
								{/each}
								{#each toTakeBack as p (p.productionId)}
									<a
										href={resolve('checkout')}
										class="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
									>
										<Undo2 aria-hidden="true" class="size-4 shrink-0 text-amber-500" />
										<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-medium">{p.productionName}</p>
											<p class="truncate text-xs text-muted-foreground">
												{plural(p.count, [
													'1 unit reported returned — scan it in',
													'# units reported returned — scan them in'
												])}
											</p>
										</div>
									</a>
								{/each}
							</div>
						</Card.Root>
					</section>
				{/if}

				<!-- What our own productions asked other orgs for. Nobody can act on
				     it from here, so it lives in the side column. -->
				{#if awaiting.length > 0}
					<section id="awaiting" class="scroll-mt-20">
						<h2 class="mb-3 text-lg font-semibold">Waiting for Approval</h2>
						<Card.Root class="gap-0 overflow-hidden py-0">
							<div class="divide-y">
								{#each awaiting as req (`${req.productionId}:${req.lenderOrg}`)}
									<a
										href={resolve(`productions/${req.productionId}`)}
										class="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
									>
										<Hourglass aria-hidden="true" class="size-4 shrink-0 text-amber-500" />
										<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-medium">{req.productionName}</p>
											<p class="truncate text-xs text-muted-foreground">
												{plural(req.count, ['# asset', '# assets'])} from {req.lenderOrg}
											</p>
										</div>
										<span class="shrink-0 text-xs text-muted-foreground"
											>{formatDate(req.startDate)}</span
										>
									</a>
								{/each}
							</div>
						</Card.Root>
					</section>
				{/if}

				<!-- What's new. The one section nobody has to act on: a short
				     excerpt, with the full notes one click away. -->
				<section>
					<div class="mb-3 flex items-center justify-between">
						<h2 class="text-lg font-semibold">What's new</h2>
						<Button variant="ghost" size="sm" href={resolve('whats-new')}>
							All versions
							<ArrowRight aria-hidden="true" class="ml-1 size-4" />
						</Button>
					</div>
					<Card.Root>
						<Card.Header class="pb-2">
							<Card.Title class="flex items-center gap-2 text-sm">
								<Sparkles aria-hidden="true" class="size-4 text-muted-foreground" />
								Version {latestRelease.version}
							</Card.Title>
							<Card.Description class="text-xs"
								>{formatReleaseDate(latestRelease, data.locale)}</Card.Description
							>
						</Card.Header>
						<Card.Content class="pt-0">
							<ul class="space-y-1.5">
								{#each releaseNotes.slice(0, 3) as note, i (i)}
									<li class="flex gap-2 text-xs text-muted-foreground">
										<span aria-hidden="true">&bull;</span>
										<span class="line-clamp-2">{note}</span>
									</li>
								{/each}
							</ul>
							{#if releaseNotes.length > 3}
								<a
									href={resolve('whats-new')}
									class="mt-2 inline-block text-xs text-muted-foreground hover:text-foreground"
									>{plural(releaseNotes.length - 3, ['and # more change', 'and # more changes'])} →</a
								>
							{/if}
						</Card.Content>
					</Card.Root>
				</section>
			</aside>
		</div>
	</div>
{/if}
