<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { getCatalogTransactions, revertCatalogChange } from '$lib/remote/assets.remote';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import { Button } from '$lib/components/ui/button';
	import { getErrorMessage } from '$lib/utils';
	import { toast } from 'svelte-sonner';

	// The empty log the page renders before the first answer arrives. Spelled out
	// rather than left undefined so nothing below has to ask twice whether the
	// data is here — the skeleton in the template is the one place that asks.
	const EMPTY_LOG: Awaited<ReturnType<typeof getCatalogTransactions>> = {
		entries: [],
		products: {},
		manufacturers: {},
		categories: {},
		organizations: {}
	};

	let logQuery = $derived(getCatalogTransactions());
	let log = $derived(logQuery.current ?? EMPTY_LOG);

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

	type Payload = {
		changes?: { field: string; from: unknown; to: unknown }[];
		revertOf?: string;
	} | null;

	// Entries some later entry has already put back. Only as far as the page
	// reaches — for anything older the server still refuses a second revert,
	// because no field holds the value that entry wrote any more.
	let revertedIds = $derived(
		new Set(
			log.entries
				.map((entry) => (entry.data as Payload)?.revertOf)
				.filter((id): id is string => !!id)
		)
	);

	// Field edits to a product that still exists: the one kind of entry that says
	// what was there before. A merge or a delete does not, so neither can be undone.
	function canRevert(entry: Entry): boolean {
		return (
			entry.action === 'PRODUCT_UPDATED' &&
			!!entry.productId &&
			entry.productId in log.products &&
			((entry.data as Payload)?.changes?.length ?? 0) > 0 &&
			!revertedIds.has(entry.id)
		);
	}

	let revertingId = $state<string | null>(null);

	async function revert(entry: Entry) {
		revertingId = entry.id;
		try {
			await revertCatalogChange(entry.id);
			toast.success('Change reverted');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			revertingId = null;
		}
	}

	// A device's connectors and a loom's ways are both logged as the whole list on
	// both sides — see `setProductPorts` and `writeWays`. They are told apart by
	// what a row carries: a port names a connector, a way has two ends.
	type LoggedPort = { connector: string; count: number; label: string | null };
	type LoggedWay = {
		count: number;
		cableType: string | null;
		connectorA: string | null;
		connectorB: string | null;
	};
	function logValue(value: unknown): string {
		if (!Array.isArray(value)) return String(value ?? '—');
		if (value.length === 0) return '—';
		if ('connector' in (value[0] ?? {})) {
			return (value as LoggedPort[])
				.map((p) => `${p.count}× ${p.connector}${p.label ? ` (${p.label})` : ''}`)
				.join(', ');
		}
		return (value as LoggedWay[])
			.map((w) =>
				[`${w.count}×`, [w.connectorA ?? '—', w.connectorB ?? '—'].join(' → '), w.cableType ?? '']
					.filter(Boolean)
					.join(' ')
			)
			.join(', ');
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
				.map((change) => `${change.field}: ${logValue(change.from)} → ${logValue(change.to)}`)
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
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Catalog Log</h1>
		<p class="text-muted-foreground">
			Every change to the shared catalog — products, manufacturers, categories and per-org prices —
			with who made it.
		</p>
	</div>

	{#if !logQuery.ready}
		<ContentSkeleton shape="table" count={8} error={logQuery.error} />
	{:else if log.entries.length === 0}
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
						<th class="px-4 py-3"></th>
					</tr>
				</thead>
				<tbody>
					{#each log.entries as entry (entry.id)}
						<tr class="border-b transition-colors last:border-0 hover:bg-muted/30">
							<td class="px-4 py-3 whitespace-nowrap text-muted-foreground">
								{new Date(entry.createdAt).toLocaleString('de-DE')}
							</td>
							<td class="px-4 py-3">{entry.user.name || entry.user.email}</td>
							<td class="px-4 py-3">
								{actionLabels[entry.action] ?? entry.action}
								{#if (entry.data as Payload)?.revertOf}
									<span class="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
										>Revert</span
									>
								{/if}
							</td>
							<td class="px-4 py-3 font-medium">{subject(entry)}</td>
							<td class="px-4 py-3 text-muted-foreground">
								{entry.organizationId
									? (log.organizations[entry.organizationId] ?? entry.organizationId)
									: '—'}
							</td>
							<td class="max-w-md px-4 py-3 text-muted-foreground">
								<span class="line-clamp-2">{details(entry)}</span>
							</td>
							<td class="px-4 py-3 text-right whitespace-nowrap">
								{#if revertedIds.has(entry.id)}
									<span class="text-xs text-muted-foreground">Reverted</span>
								{:else if canRevert(entry)}
									<Button
										variant="outline"
										size="sm"
										disabled={revertingId === entry.id}
										onclick={() => revert(entry)}
									>
										Revert
									</Button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
