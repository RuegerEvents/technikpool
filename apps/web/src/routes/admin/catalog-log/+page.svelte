<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { getCatalogTransactions } from '$lib/remote/assets.remote';
	import { resolve } from '$app/paths';

	let log = $derived(await getCatalogTransactions());

	const actionLabels: Record<string, string> = {
		PRODUCT_UPDATED: 'Product updated',
		PRODUCT_DELETED: 'Product deleted',
		PRODUCT_MERGED: 'Products merged',
		PRODUCT_PRICE_SET: 'Price set',
		MANUFACTURER_UPDATED: 'Manufacturer updated',
		MANUFACTURER_MERGED: 'Manufacturers merged',
		CATEGORY_UPDATED: 'Category updated'
	};

	type Entry = (typeof log.entries)[number];

	// The log's references are soft (merges delete their rows) — resolved names
	// come along from the query; a dangling id falls back to the payload's own
	// name where the entry recorded one, then to the id.
	function subject(entry: Entry): string {
		const payload = entry.data as Record<string, unknown> | null;
		if (entry.productId) {
			return (
				log.products[entry.productId] ??
				(typeof payload?.name === 'string' ? payload.name : entry.productId)
			);
		}
		if (entry.manufacturerId)
			return log.manufacturers[entry.manufacturerId] ?? entry.manufacturerId;
		if (entry.categoryId) return log.categories[entry.categoryId] ?? entry.categoryId;
		return '—';
	}

	function details(entry: Entry): string {
		const payload = entry.data as {
			changes?: { field: string; from: unknown; to: unknown }[];
			source?: { name?: string };
			target?: { name?: string };
			movedAssets?: number;
			movedProducts?: number;
		} | null;
		if (!payload) return '';
		if (payload.changes) {
			return payload.changes
				.map((change) => `${change.field}: ${change.from ?? '—'} → ${change.to ?? '—'}`)
				.join(' · ');
		}
		if (payload.source && payload.target) {
			const moved = payload.movedAssets ?? payload.movedProducts ?? 0;
			return `${payload.source.name ?? '?'} → ${payload.target.name ?? '?'} (${moved} moved)`;
		}
		return '';
	}
</script>

<svelte:head><title>Catalog Log | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Catalog Log</h1>
			<p class="text-muted-foreground">
				Every change to the shared catalog — products, manufacturers, categories and per-org prices
				— with who made it.
			</p>
		</div>
		<Button variant="outline" href={resolve('/admin/users')}>User Management</Button>
	</div>

	{#if log.entries.length === 0}
		<Card.Root>
			<Card.Content class="py-12 text-center text-muted-foreground"
				>No catalog changes recorded yet.</Card.Content
			>
		</Card.Root>
	{:else}
		<div class="overflow-x-auto rounded-md border">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b bg-muted/30">
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">When</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Who</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Subject</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Org</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Details</th>
					</tr>
				</thead>
				<tbody>
					{#each log.entries as entry (entry.id)}
						<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
							<td class="px-4 py-3 whitespace-nowrap text-muted-foreground">
								{new Date(entry.createdAt).toLocaleString('de-DE')}
							</td>
							<td class="px-4 py-3">{entry.user.name || entry.user.email}</td>
							<td class="px-4 py-3">{actionLabels[entry.action] ?? entry.action}</td>
							<td class="px-4 py-3 font-medium">{subject(entry)}</td>
							<td class="px-4 py-3 text-muted-foreground">
								{entry.organizationId
									? (log.organizations[entry.organizationId] ?? entry.organizationId)
									: '—'}
							</td>
							<td class="max-w-md px-4 py-3 text-muted-foreground">
								<span class="line-clamp-2">{details(entry)}</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
