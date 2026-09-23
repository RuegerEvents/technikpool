<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { OrgBadge } from '$lib/components/ui/org-badge';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import { getStocktakes } from '$lib/remote/stocktakes.remote';
	import { orgLabel } from '$lib/utils';
	import StocktakeProgress from '$lib/components/stocktake-progress.svelte';

	let stocktakesQuery = $derived(getStocktakes());
	let stocktakes = $derived(stocktakesQuery.current ?? []);
	let open = $derived(stocktakes.filter((s) => s.status === 'OPEN'));
	let closed = $derived(stocktakes.filter((s) => s.status === 'CLOSED'));

	function formatDate(d: Date) {
		return new Date(d).toLocaleDateString('de-DE', {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<svelte:head><title>Stocktakes | Technikpool</title></svelte:head>

<div class="space-y-8">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Stocktakes</h1>
			<p class="text-muted-foreground">
				Count what is actually on the shelves — over several days and devices if need be.
			</p>
		</div>
		<Button icon="add" href={resolve('/stocktakes/new')}>New stocktake</Button>
	</div>

	{#if !stocktakesQuery.ready}
		<ContentSkeleton shape="rows" count={4} error={stocktakesQuery.error} />
	{:else if stocktakes.length === 0}
		<Card.Root>
			<Card.Content class="py-10 text-center text-sm text-muted-foreground">
				No stocktakes yet. Start one to count a location, a department or everything.
			</Card.Content>
		</Card.Root>
	{:else}
		<section class="space-y-3">
			<h2 class="text-lg font-semibold">Open ({open.length})</h2>
			{#if open.length === 0}
				<p class="text-sm text-muted-foreground">Nothing being counted right now.</p>
			{:else}
				<Card.Root class="gap-0 overflow-hidden py-0">
					<div class="divide-y">
						{#each open as s (s.id)}
							<a
								href={resolve(`/stocktakes/${s.id}`)}
								class="flex flex-wrap items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
							>
								<div class="min-w-0 flex-1">
									<p class="truncate font-medium">{s.name}</p>
									<p class="flex items-center gap-2 text-xs text-muted-foreground">
										<OrgBadge
											name={orgLabel(s.organization)}
											color={s.organization.color}
											avatarLabel={s.organization.avatarLabel}
										/>
										<span>
											Started {formatDate(s.createdAt)} by {s.createdBy.name || s.createdBy.email}
										</span>
									</p>
								</div>
								<StocktakeProgress progress={s.progress} class="w-full sm:w-64" />
							</a>
						{/each}
					</div>
				</Card.Root>
			{/if}
		</section>

		{#if closed.length > 0}
			<section class="space-y-3">
				<h2 class="text-lg font-semibold">Closed ({closed.length})</h2>
				<div class="overflow-x-auto rounded-md border">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b bg-muted/30">
								<th class="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
								<th class="px-4 py-3 text-left font-medium text-muted-foreground">Org</th>
								<th class="px-4 py-3 text-left font-medium text-muted-foreground">Closed</th>
								<th class="px-4 py-3 text-right font-medium text-muted-foreground">Found</th>
								<th class="px-4 py-3 text-right font-medium text-muted-foreground">Missing</th>
							</tr>
						</thead>
						<tbody>
							{#each closed as s (s.id)}
								<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
									<td class="px-4 py-3">
										<a
											href={resolve(`/stocktakes/${s.id}`)}
											class="font-medium underline-offset-2 hover:underline">{s.name}</a
										>
									</td>
									<td class="px-4 py-3">
										<OrgBadge
											name={orgLabel(s.organization)}
											color={s.organization.color}
											avatarLabel={s.organization.avatarLabel}
										/>
									</td>
									<td class="px-4 py-3 text-muted-foreground">
										{s.closedAt ? formatDate(s.closedAt) : '—'}
									</td>
									<td class="px-4 py-3 text-right tabular-nums">
										{s.progress.found} / {s.progress.expected}
									</td>
									<td
										class="px-4 py-3 text-right tabular-nums {s.progress.expected -
											s.progress.found >
										0
											? 'font-medium text-destructive'
											: 'text-muted-foreground'}"
									>
										{s.progress.expected - s.progress.found}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}
	{/if}
</div>
