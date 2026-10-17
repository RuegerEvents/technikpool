<script lang="ts">
	import { orgLabel } from '#lib/utils.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { getOverdueAssets } from '#lib/remote/inspections.remote.js';
	import { OrgBadge } from '#lib/components/ui/org-badge/index.js';
	import { ProductThumb } from '#lib/components/ui/product-thumb/index.js';
	import { ContentSkeleton } from '#lib/components/ui/skeleton/index.js';
	import { InspectionDialog } from '#lib/components/ui/inspection-dialog/index.js';
	import { formatInspectionDay } from '#lib/inspection-ui.svelte.js';
	import { resolve } from '$app/paths';

	let overdueQuery = $derived(getOverdueAssets());
	let data = $derived(overdueQuery.current ?? { overdue: [], upcoming: [] });

	type AssetRow = Awaited<ReturnType<typeof getOverdueAssets>>['overdue'][number];

	let target = $state<AssetRow | null>(null);
	let dialogOpen = $state(false);

	function openDialog(asset: AssetRow) {
		target = asset;
		dialogOpen = true;
	}
</script>

<svelte:head><title>Inspections | Technikpool</title></svelte:head>

<InspectionDialog
	bind:open={dialogOpen}
	assetIds={target ? [target.id] : []}
	subject={target
		? `${target.product.name} · ${target.assetTag ?? target.serialNumber ?? `#${target.orgIndex}`}`
		: undefined}
/>

<div class="space-y-8">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">DGUV Inspections</h1>
		<p class="text-muted-foreground">
			Overdue and upcoming asset inspections across your orgs. A unit that was never inspected, or
			whose last inspection failed, is due at once.
		</p>
	</div>

	{#if !overdueQuery.ready}
		<ContentSkeleton shape="table" count={5} error={overdueQuery.error} />
	{:else}
		<div>
			<h2 class="mb-3 text-xl font-semibold text-destructive">
				Overdue ({data.overdue.length})
			</h2>
			{#if data.overdue.length === 0}
				<Card.Root
					><Card.Content class="py-8 text-center text-muted-foreground"
						>Nothing overdue.</Card.Content
					></Card.Root
				>
			{:else}
				<div class="overflow-x-auto rounded-md border">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b bg-muted/30">
								<th class="px-4 py-3 text-left font-medium text-muted-foreground">Asset</th>
								<th class="px-4 py-3 text-left font-medium text-muted-foreground">Org</th>
								<th class="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
								<th class="px-4 py-3 text-left font-medium text-muted-foreground"
									>Last inspection</th
								>
								<th class="px-4 py-3 text-left font-medium text-muted-foreground">Due</th>
								<th class="w-32 px-4 py-3"></th>
							</tr>
						</thead>
						<tbody>
							{#each data.overdue as asset (asset.id)}
								<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
									<td class="px-4 py-3">
										<div class="flex items-center gap-2">
											<ProductThumb path={asset.product.imagePath} alt={asset.product.name} />
											<div>
												<a
													href={resolve(`assets/${asset.id}`)}
													class="font-medium underline-offset-2 hover:underline"
													>{asset.product.name}</a
												>
												<p class="text-xs text-muted-foreground">
													{asset.assetTag ?? asset.serialNumber ?? '—'}
												</p>
											</div>
										</div>
									</td>
									<td class="px-4 py-3">
										<OrgBadge
											name={orgLabel(asset.organization)}
											color={asset.organization.color}
											avatarLabel={asset.organization.avatarLabel}
										/>
									</td>
									<td class="px-4 py-3 text-muted-foreground">{asset.location.name}</td>
									<td class="px-4 py-3">
										{#if asset.inspections[0]}
											{formatInspectionDay(asset.inspections[0].performedAt)}
											{#if asset.inspections[0].result === 'FAILED'}
												<span class="ml-1 text-xs font-medium text-destructive">Failed</span>
											{/if}
										{:else}
											<span class="text-muted-foreground">Never inspected</span>
										{/if}
									</td>
									<td class="px-4 py-3 font-medium text-destructive"
										>{formatInspectionDay(asset.nextInspectionDue!)}</td
									>
									<td class="px-4 py-3 text-right">
										<Button size="sm" variant="outline" onclick={() => openDialog(asset)}
											>Record inspection</Button
										>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<div>
			<h2 class="mb-3 text-xl font-semibold">
				Due soon ({data.upcoming.length})
			</h2>
			{#if data.upcoming.length === 0}
				<Card.Root
					><Card.Content class="py-8 text-center text-muted-foreground"
						>Nothing due in the next 30 days.</Card.Content
					></Card.Root
				>
			{:else}
				<div class="overflow-x-auto rounded-md border">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b bg-muted/30">
								<th class="px-4 py-3 text-left font-medium text-muted-foreground">Asset</th>
								<th class="px-4 py-3 text-left font-medium text-muted-foreground">Org</th>
								<th class="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
								<th class="px-4 py-3 text-left font-medium text-muted-foreground"
									>Last inspection</th
								>
								<th class="px-4 py-3 text-left font-medium text-muted-foreground">Due</th>
								<th class="w-32 px-4 py-3"></th>
							</tr>
						</thead>
						<tbody>
							{#each data.upcoming as asset (asset.id)}
								<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
									<td class="px-4 py-3">
										<div class="flex items-center gap-2">
											<ProductThumb path={asset.product.imagePath} alt={asset.product.name} />
											<div>
												<a
													href={resolve(`assets/${asset.id}`)}
													class="font-medium underline-offset-2 hover:underline"
													>{asset.product.name}</a
												>
												<p class="text-xs text-muted-foreground">
													{asset.assetTag ?? asset.serialNumber ?? '—'}
												</p>
											</div>
										</div>
									</td>
									<td class="px-4 py-3">
										<OrgBadge
											name={orgLabel(asset.organization)}
											color={asset.organization.color}
											avatarLabel={asset.organization.avatarLabel}
										/>
									</td>
									<td class="px-4 py-3 text-muted-foreground">{asset.location.name}</td>
									<td class="px-4 py-3">
										{#if asset.inspections[0]}
											{formatInspectionDay(asset.inspections[0].performedAt)}
											{#if asset.inspections[0].result === 'FAILED'}
												<span class="ml-1 text-xs font-medium text-destructive">Failed</span>
											{/if}
										{:else}
											<span class="text-muted-foreground">Never inspected</span>
										{/if}
									</td>
									<td class="px-4 py-3">{formatInspectionDay(asset.nextInspectionDue!)}</td>
									<td class="px-4 py-3 text-right">
										<Button size="sm" variant="outline" onclick={() => openDialog(asset)}
											>Record inspection</Button
										>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{/if}
</div>
