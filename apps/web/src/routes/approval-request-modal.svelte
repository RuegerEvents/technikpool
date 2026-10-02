<script lang="ts" generics="T extends RequestItem">
	import { DropdownMenu } from 'bits-ui';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { ProductThumb } from '#lib/components/ui/product-thumb/index.js';
	import {
		approveProductionItems,
		declineProductionItems
	} from '#lib/remote/productions.remote.js';
	import { getPackTodos } from '#lib/remote/production-handout.remote.js';
	import { accessorySummary } from '#lib/production-items.js';
	import {
		itemsOf,
		type ApprovalRequest,
		type RequestItem,
		type RequestUnit
	} from '#lib/approval-requests.js';
	import { dayCountBetween, getErrorMessage, plural } from '#lib/utils.js';
	import { EllipsisVertical, Layers } from '@lucide/svelte';

	type Props = {
		request: ApprovalRequest<T>;
		locale: string;
		onclose: () => void;
	};

	let { request, locale, onclose }: Props = $props();

	let busy = $state(false);

	let dateFormat = $derived(
		new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		})
	);
	let start = $derived(request.startDate);
	let period = $derived(
		!start
			? null
			: request.endDate
				? dateFormat.formatRange(new Date(start), new Date(request.endDate))
				: dateFormat.format(new Date(start))
	);
	let days = $derived(dayCountBetween(start, request.endDate ?? start) ?? 1);

	// One call per selection, not per unit: the server tells the borrower once
	// their queue is empty, and it can only tell which call emptied it when the
	// whole selection arrives together.
	async function decide(items: T[], action: 'approve' | 'decline') {
		busy = true;
		try {
			const ids = items.map((i) => i.id);
			if (action === 'approve') {
				const { reviewed } = await approveProductionItems(ids);
				toast.success(plural(reviewed, ['# asset approved.', '# assets approved.']));
				// What was just approved is what has to be packed next.
				void getPackTodos().refresh();
			} else {
				const { reviewed } = await declineProductionItems(ids);
				toast.success(plural(reviewed, ['# asset declined.', '# assets declined.']));
			}
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			busy = false;
		}
	}

	// "Approve some": a count of a product's units, each with its accessories.
	type Partial = {
		label: string;
		units: RequestUnit<T>[];
		action: 'approve' | 'decline';
		count: number;
	};
	let partial = $state<Partial | null>(null);

	async function confirmPartial() {
		if (!partial) return;
		const { units, action, count } = partial;
		partial = null;
		await decide(itemsOf(units.slice(0, count)), action);
	}

	/** "2× SM58 · 1× Kaltgerätekabel" — what a case holds. */
	function contentsOf(units: RequestUnit<T>[]) {
		const counts: Record<string, number> = {};
		for (const unit of units) {
			const name = unit.asset.product.name;
			counts[name] = (counts[name] ?? 0) + 1;
		}
		return Object.entries(counts)
			.map(([name, count]) => `${count}× ${name}`)
			.join(' · ');
	}
</script>

<Modal open={true} size="full" {onclose} title={request.productionName}>
	{#snippet description()}
		Requested by <span class="font-medium text-foreground">{request.requesterOrg}</span>
	{/snippet}
	{#snippet children()}
		<div class="space-y-5">
			<dl
				class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-muted/50 px-4 py-3 text-sm"
			>
				<dt class="text-muted-foreground">Period</dt>
				<dd class="font-medium">
					{#if period}
						{period}
						<span class="font-normal text-muted-foreground"
							>· {plural(days, ['# day', '# days'])}</span
						>
					{:else}
						<span class="font-normal text-muted-foreground">No date yet</span>
					{/if}
				</dd>
				<dt class="text-muted-foreground">Requested</dt>
				<dd>{plural(request.unitCount, ['# device', '# devices'])}</dd>
			</dl>

			{#if request.bundles.length > 0}
				<section>
					<h3 class="mb-2 text-sm font-semibold">Cases</h3>
					<div class="divide-y rounded-lg border">
						{#each request.bundles as bundle (bundle.id)}
							<div class="flex flex-wrap items-center gap-3 px-3 py-2.5">
								<ProductThumb path={bundle.imagePath} size={36} />
								<div class="min-w-0 flex-1">
									<p class="flex items-center gap-1.5 text-sm font-medium">
										<Layers aria-hidden="true" class="size-3.5 shrink-0 text-muted-foreground" />
										<span class="truncate">{bundle.label}</span>
									</p>
									<p class="text-xs text-muted-foreground">{contentsOf(bundle.units)}</p>
								</div>
								<div class="flex shrink-0 gap-1.5">
									<Button
										variant="ghost"
										size="sm"
										disabled={busy}
										onclick={() => decide(itemsOf(bundle.units), 'decline')}>Decline</Button
									>
									<Button
										variant="outline"
										size="sm"
										disabled={busy}
										onclick={() => decide(itemsOf(bundle.units), 'approve')}>Approve</Button
									>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			{#if request.products.length > 0}
				<section>
					{#if request.bundles.length > 0}
						<h3 class="mb-2 text-sm font-semibold">Individual devices</h3>
					{/if}
					<div class="divide-y rounded-lg border">
						{#each request.products as pg (pg.productId)}
							{@const accessories = pg.units.flatMap((u) => u.accessories)}
							<div class="flex flex-wrap items-center gap-3 px-3 py-2.5">
								<ProductThumb path={pg.imagePath} size={36} />
								<div class="min-w-0 flex-1">
									<p class="text-sm">
										{#if pg.units.length > 1}
											<span class="font-medium text-muted-foreground">{pg.units.length}×</span>
										{/if}
										{pg.label}
									</p>
									{#if accessories.length > 0}
										<p class="text-xs text-muted-foreground">
											↳ {accessorySummary(accessories)}
										</p>
									{/if}
								</div>
								<div class="flex shrink-0 items-center gap-1.5">
									<Button
										variant="ghost"
										size="sm"
										disabled={busy}
										onclick={() => decide(itemsOf(pg.units), 'decline')}>Decline</Button
									>
									<Button
										variant="outline"
										size="sm"
										disabled={busy}
										onclick={() => decide(itemsOf(pg.units), 'approve')}>Approve</Button
									>
									{#if pg.units.length > 1}
										<DropdownMenu.Root>
											<DropdownMenu.Trigger>
												<button
													type="button"
													class="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
													aria-label="Partial actions"
												>
													<EllipsisVertical aria-hidden="true" class="size-4" />
												</button>
											</DropdownMenu.Trigger>
											<DropdownMenu.Portal>
												<DropdownMenu.Content
													align="end"
													sideOffset={4}
													class="z-[60] min-w-[160px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
												>
													<DropdownMenu.Item
														onSelect={() =>
															(partial = {
																label: pg.label,
																units: pg.units,
																action: 'approve',
																count: 1
															})}
														class="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent data-[highlighted]:bg-accent"
														>Approve some…</DropdownMenu.Item
													>
													<DropdownMenu.Item
														onSelect={() =>
															(partial = {
																label: pg.label,
																units: pg.units,
																action: 'decline',
																count: 1
															})}
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
				</section>
			{/if}

			{#if request.productionVisible}
				<a
					href={resolve(`productions/${request.productionId}`)}
					class="inline-block text-sm text-muted-foreground hover:text-foreground hover:underline"
					>Open production →</a
				>
			{/if}
		</div>
	{/snippet}
	{#snippet footer()}
		<Button disabled={busy} onclick={() => decide(request.items, 'approve')}>Approve all</Button>
		<Button variant="outline" disabled={busy} onclick={() => decide(request.items, 'decline')}
			>Decline all</Button
		>
		<Button variant="ghost" class="mr-auto" onclick={onclose}>Close</Button>
	{/snippet}
</Modal>

<!-- Count picker for "Approve some…" -->
{#if partial}
	<!-- Bound here because a snippet is its own closure: the narrowing the {#if}
	     gives us doesn't reach inside one. -->
	{@const p = partial}
	<Modal
		open={true}
		onclose={() => (partial = null)}
		title={p.action === 'approve' ? 'Approve some units' : 'Decline some units'}
	>
		{#snippet children()}
			<p class="mb-3 text-sm text-muted-foreground">{p.label}</p>
			<div class="flex items-center gap-3">
				<input
					type="number"
					min="1"
					max={p.units.length}
					bind:value={p.count}
					oninput={(e) => {
						p.count = Math.min(Math.max(1, +e.currentTarget.value), p.units.length);
					}}
					class="w-24 rounded-md border border-input bg-background px-3 py-2 text-center text-sm focus:ring-1 focus:ring-ring focus:outline-none"
				/>
				<span class="text-sm text-muted-foreground">of {p.units.length}</span>
			</div>
		{/snippet}
		{#snippet footer()}
			<Button variant={p.action === 'approve' ? 'default' : 'destructive'} onclick={confirmPartial}>
				{p.action === 'approve' ? 'Approve' : 'Decline'}
				{p.count}
			</Button>
			<Button icon="close" variant="outline" onclick={() => (partial = null)}>Cancel</Button>
		{/snippet}
	</Modal>
{/if}
