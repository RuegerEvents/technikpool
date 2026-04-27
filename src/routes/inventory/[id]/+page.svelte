<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { page } from '$app/stores';
	import { getAssetHistory } from '$lib/remote/assets.remote';

	const assetId = $page.params.id as string;
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Asset Details</h1>
			<p class="text-muted-foreground">View asset information and history.</p>
		</div>
		<Button variant="outline" href="/inventory">Back to Inventory</Button>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Audit Log</Card.Title>
			<Card.Description>History of transactions and status changes for this asset.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			{#if true}
				{@const history = await getAssetHistory(assetId)}
				{#if history.length === 0}
					<p class="text-muted-foreground">No history available for this asset.</p>
				{:else}
					<div class="relative ml-3 space-y-8 border-l border-muted-foreground/20 py-4">
						{#each history as item (item.id)}
							<div class="relative pl-6">
								<div
									class="absolute top-1 -left-[5px] h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background"
								></div>
								<div class="flex flex-col gap-1">
									<div class="text-sm font-medium">
										{item.action}
										{#if item.production}
											<span class="font-normal text-muted-foreground">
												for production <span class="font-medium text-foreground"
													>{item.production.name}</span
												>
											</span>
										{/if}
									</div>
									<div class="text-xs text-muted-foreground">
										By {item.user.name || item.user.email} on {new Date(
											item.createdAt
										).toLocaleString()}
									</div>
									{#if item.notes}
										<p class="mt-2 rounded-md bg-muted/50 p-2 text-sm text-muted-foreground">
											{item.notes}
										</p>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			{/if}
		</Card.Content>
	</Card.Root>
</div>
