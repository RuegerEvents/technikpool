<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { tick as nextTick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Modal } from '$lib/components/ui/modal';
	import { OrgBadge } from '$lib/components/ui/org-badge';
	import { CategoryPill } from '$lib/components/ui/category-pill';
	import { AssetStatusBadge } from '$lib/components/ui/asset-status';
	import StocktakeProgress from '$lib/components/stocktake-progress.svelte';
	import { categoryLabel } from '$lib/category';
	import { getErrorMessage, orgLabel, plural } from '$lib/utils';
	import { errorCodeOf } from '$lib/errors';
	import {
		foundViaLabel,
		stocktakeStateClass,
		stocktakeStateLabel,
		unexpectedReasonLabel,
		type StocktakeItemState
	} from '$lib/stocktake-labels.svelte';
	import {
		applyStocktakeAction,
		cancelStocktake,
		closeStocktake,
		getStocktake,
		recountStocktake,
		scanStocktakeCode,
		setStocktakeCount,
		setStocktakeNote,
		tickStocktake,
		untickStocktake
	} from '$lib/remote/stocktakes.remote';
	import { CircleAlert, MessageSquare, TriangleAlert } from '@lucide/svelte';

	let { stocktakeId }: { stocktakeId: string } = $props();

	let stocktake = $derived(await getStocktake(stocktakeId));
	let isOpen = $derived(stocktake.status === 'OPEN');

	// Others are counting at the same time, on handhelds and in other tabs, and
	// nothing tells this page when they do. So an open stocktake is reloaded
	// every few seconds while the tab is in front, and at once when it comes
	// back to it. A refresh keeps the rows on screen until the new ones are in.
	$effect(() => {
		if (!isOpen) return;
		const reload = () => {
			if (document.visibilityState === 'visible') getStocktake(stocktakeId).refresh();
		};
		const timer = setInterval(reload, 10_000);
		document.addEventListener('visibilitychange', reload);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', reload);
		};
	});
	type Item = (typeof stocktake.items)[number];
	type Confirm = {
		assetId: string;
		assetTag: string | null;
		productName: string;
		manufacturerName: string | null;
		foundByName: string | null;
	};

	// -------------------------------------------------------------------------
	// Where this counter is. Remembered per stocktake in this browser only: the
	// next person at this desk may be somewhere else, but the same person
	// coming back tomorrow is usually where they left off.

	const storageKey = $derived(`stocktake-location:${stocktakeId}`);
	let chosenLocationId = $state<string | null>(null);
	let locationId = $derived.by(() => {
		const ids = stocktake.countingLocations.map((l) => l.id);
		if (chosenLocationId && ids.includes(chosenLocationId)) return chosenLocationId;
		try {
			const stored = localStorage.getItem(storageKey);
			if (stored && ids.includes(stored)) return stored;
		} catch {
			// Storage may be blocked; the first location is a fine default.
		}
		return ids.length === 1 ? ids[0] : null;
	});

	function pickLocation(id: string) {
		chosenLocationId = id;
		try {
			localStorage.setItem(storageKey, id);
		} catch {
			// Only a convenience.
		}
	}

	// -------------------------------------------------------------------------
	// Scanning

	let code = $state('');
	let scanning = $state(false);
	let scanInput = $state<HTMLInputElement | null>(null);
	type Feedback = { tone: 'good' | 'warn' | 'bad' | 'info'; title: string; detail?: string };
	let feedback = $state<Feedback | null>(null);

	function label(p: { productName: string; manufacturerName: string | null }) {
		return p.manufacturerName ? `${p.manufacturerName} ${p.productName}` : p.productName;
	}

	async function handleScan(e: SubmitEvent) {
		e.preventDefault();
		const value = code.trim();
		if (!value || !locationId || scanning) return;
		scanning = true;
		try {
			const result = await scanStocktakeCode({ stocktakeId, code: value, locationId });
			code = '';
			if (result.outcome === 'bundle') {
				feedback = { tone: 'info', title: `Bundle ${result.bundle.name}`, detail: value };
				openConfirm(`Bundle ${result.bundle.name}`, result.confirm, 'bundle');
			} else {
				const a = result.item.asset;
				const name = label({
					productName: a.product.name,
					manufacturerName: a.product.manufacturer?.name ?? null
				});
				if (result.outcome === 'already') {
					feedback = {
						tone: 'info',
						title: result.byMe
							? 'You counted this already'
							: `Already counted by ${result.foundByName}`,
						detail: `${name} · ${a.assetTag ?? value}`
					};
				} else if (result.outcome === 'unexpected') {
					feedback = {
						tone: 'warn',
						title: `Unexpected: ${name}`,
						detail: unexpectedReasonLabel(result.item.unexpectedReason)
					};
				} else {
					feedback = {
						tone: 'good',
						title: `Found: ${name}`,
						detail: result.wasOutAt ? `Checked out to ${result.wasOutAt}` : (a.assetTag ?? value)
					};
				}
				if (result.outcome !== 'already' && result.confirm.length > 0) {
					// A unit found on its own is offered what it belongs with: the
					// rest of its kit, or the unit it hangs off.
					const group = result.confirmGroup;
					if (group?.kind === 'bundle') {
						openConfirm(`Bundle ${group.name}`, result.confirm, 'bundle', 'group');
					} else if (group?.kind === 'parent') {
						openConfirm(`Belongs with ${group.name}`, result.confirm, 'parent', 'group');
					} else {
						openConfirm(`Accessories of ${name}`, result.confirm, 'parent');
					}
				}
			}
		} catch (err) {
			feedback = { tone: 'bad', title: getErrorMessage(err), detail: value };
			code = '';
		} finally {
			scanning = false;
			await nextTick();
			if (!confirmOpen) scanInput?.focus();
		}
	}

	// -------------------------------------------------------------------------
	// Confirming a unit's accessories or a bundle's members

	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmEntries = $state<Confirm[]>([]);
	let confirmVia = $state<'parent' | 'bundle'>('parent');
	/**
	 * `accessories`: the scanned unit's own. `group`: what a unit found on its
	 * own belongs with — asked as "this one only, or the rest too".
	 */
	let confirmKind = $state<'accessories' | 'members' | 'group'>('accessories');
	let confirmChecked = new SvelteSet<string>();
	let confirming = $state(false);

	function openConfirm(
		title: string,
		entries: Confirm[],
		via: 'parent' | 'bundle',
		kind: 'accessories' | 'members' | 'group' = via === 'parent' ? 'accessories' : 'members'
	) {
		confirmTitle = title;
		confirmEntries = entries;
		confirmVia = via;
		confirmKind = kind;
		confirmChecked.clear();
		// Pre-checked: the operator unchecks what is not there, which is the rare case.
		for (const entry of entries) if (!entry.foundByName) confirmChecked.add(entry.assetId);
		confirmOpen = true;
	}

	async function submitConfirm() {
		if (!locationId) return;
		confirming = true;
		try {
			if (confirmChecked.size > 0) {
				await tickStocktake({
					stocktakeId,
					assetIds: [...confirmChecked],
					locationId,
					via: confirmVia
				});
			}
			confirmOpen = false;
			scanInput?.focus();
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			confirming = false;
		}
	}

	// -------------------------------------------------------------------------
	// Ticking by hand

	let busy = new SvelteSet<string>();

	async function toggleItem(item: Item) {
		if (!locationId && !item.foundAt) {
			toast.error('Choose where you are counting first.');
			return;
		}
		busy.add(item.assetId);
		try {
			if (item.foundAt) {
				await untickStocktake({ stocktakeId, assetId: item.assetId });
			} else {
				await tickStocktake({
					stocktakeId,
					assetIds: [item.assetId],
					locationId: locationId!,
					via: 'manual'
				});
				const accessories = stocktake.items.filter(
					(i) => i.asset.parentAssetId === item.assetId && !i.foundAt
				);
				if (accessories.length > 0) {
					openConfirm(
						`Accessories of ${item.asset.product.name}`,
						accessories.map((i) => ({
							assetId: i.assetId,
							assetTag: i.asset.assetTag,
							productName: i.asset.product.name,
							manufacturerName: i.asset.product.manufacturer?.name ?? null,
							foundByName: null
						})),
						'parent'
					);
				}
			}
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			busy.delete(item.assetId);
		}
	}

	// -------------------------------------------------------------------------
	// Notes

	let noteItem = $state<Item | null>(null);
	let noteText = $state('');
	let noteAttention = $state(false);
	let savingNote = $state(false);

	function openNote(item: Item) {
		noteItem = item;
		noteText = item.note ?? '';
		noteAttention = item.needsAttention;
	}

	async function saveNote() {
		if (!noteItem) return;
		savingNote = true;
		try {
			await setStocktakeNote({
				stocktakeId,
				assetId: noteItem.assetId,
				note: noteText.trim() || null,
				needsAttention: noteAttention
			});
			noteItem = null;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			savingNote = false;
		}
	}

	// -------------------------------------------------------------------------
	// Loose counts

	/** `previous` is the count the field showed — see `setStocktakeCount`. */
	async function saveCount(productId: string, value: string, previous: number) {
		if (!locationId) {
			toast.error('Choose where you are counting first.');
			return;
		}
		const count = Number(value);
		if (value.trim() === '' || !Number.isInteger(count) || count < 0) return;
		try {
			await setStocktakeCount({ stocktakeId, productId, locationId, count, previous });
		} catch (err) {
			toast.error(getErrorMessage(err));
			// The field has to show what is actually stored before anyone types
			// into it again.
			if (errorCodeOf(err) === 'stocktake_count_changed') getStocktake(stocktakeId).refresh();
		}
	}

	// -------------------------------------------------------------------------
	// Filters

	type StateFilter = 'all' | StocktakeItemState | 'attention';
	let stateFilter = $state<StateFilter | null>(null);
	// A closed report opens on what needs answering.
	let effectiveState = $derived<StateFilter>(stateFilter ?? (isOpen ? 'all' : 'missing'));
	let categoryFilter = $state('');
	let locationFilter = $state('');
	let search = $state('');

	let counts = $derived.by(() => {
		const c: Record<StocktakeItemState, number> = {
			open: 0,
			found: 0,
			out: 0,
			missing: 0,
			unexpected: 0
		};
		for (const i of stocktake.items) c[i.state] += 1;
		return c;
	});
	let attentionCount = $derived(stocktake.items.filter((i) => i.needsAttention).length);

	let categories = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local to this derivation
		const seen = new Map<string, Item['asset']['product']['category']>();
		for (const i of stocktake.items)
			seen.set(i.asset.product.category.id, i.asset.product.category);
		for (const p of stocktake.products) seen.set(p.product.category.id, p.product.category);
		return [...seen.values()].sort((a, b) => a.sortOrder - b.sortOrder);
	});

	// Where a row belongs: where it was expected, or where it turned up.
	function placeOf(i: Item) {
		return i.expectedLocation ?? i.foundLocation ?? null;
	}

	let visibleItems = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return stocktake.items.filter((i) => {
			if (
				effectiveState === 'attention'
					? !i.needsAttention
					: effectiveState !== 'all' && i.state !== effectiveState
			)
				return false;
			if (categoryFilter && i.asset.product.category.id !== categoryFilter) return false;
			if (
				locationFilter &&
				placeOf(i)?.id !== locationFilter &&
				i.foundLocation?.id !== locationFilter
			)
				return false;
			if (q) {
				const hay = [
					i.asset.assetTag,
					i.asset.serialNumber,
					i.asset.product.name,
					i.asset.product.manufacturer?.name,
					i.asset.bundle?.template.name,
					i.asset.bundle?.tag
				]
					.filter(Boolean)
					.join(' ')
					.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		});
	});

	// Grouped by place, then ordered by category and product, with each
	// accessory right under the unit it belongs to.
	let groups = $derived.by(() => {
		const byId = new Map(stocktake.items.map((i) => [i.assetId, i]));
		const sortKey = (i: Item): string => {
			const own = `${String(i.asset.product.category.sortOrder).padStart(4, '0')}|${i.asset.product.name}|${i.asset.assetTag ?? ''}|${i.assetId}`;
			const parent = i.asset.parentAssetId ? byId.get(i.asset.parentAssetId) : undefined;
			return parent && placeOf(parent)?.id === placeOf(i)?.id
				? `${sortKey(parent)}\u0001${own}`
				: own;
		};
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local to this derivation
		const map = new Map<string, { id: string; name: string; items: Item[] }>();
		for (const i of visibleItems) {
			const place = placeOf(i);
			const key = place?.id ?? '';
			const group = map.get(key) ?? { id: key, name: place?.name ?? '—', items: [] };
			group.items.push(i);
			map.set(key, group);
		}
		return [...map.values()]
			.map((g) => ({ ...g, items: g.items.sort((a, b) => sortKey(a).localeCompare(sortKey(b))) }))
			.sort((a, b) => a.name.localeCompare(b.name));
	});

	let visibleProducts = $derived.by(() => {
		if (!['all', 'open', 'missing'].includes(effectiveState)) return [];
		const q = search.trim().toLowerCase();
		return stocktake.products
			.filter((p) => !categoryFilter || p.product.category.id === categoryFilter)
			.filter((p) => !locationFilter || p.locations.some((l) => l.location.id === locationFilter))
			.filter(
				(p) =>
					!q || `${p.product.manufacturer?.name ?? ''} ${p.product.name}`.toLowerCase().includes(q)
			)
			.filter((p) => effectiveState === 'all' || p.counted < p.expected)
			.sort(
				(a, b) =>
					a.product.category.sortOrder - b.product.category.sortOrder ||
					a.product.name.localeCompare(b.product.name)
			);
	});

	// -------------------------------------------------------------------------
	// Closing, cancelling, the report's actions

	let closeOpen = $state(false);
	let cancelOpen = $state(false);
	let working = $state(false);

	async function handleClose() {
		working = true;
		try {
			await closeStocktake(stocktakeId);
			closeOpen = false;
			stateFilter = null;
			toast.success('Stocktake closed');
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			working = false;
		}
	}

	async function handleCancel() {
		working = true;
		try {
			await cancelStocktake(stocktakeId);
			goto(resolve('/stocktakes'));
		} catch (err) {
			toast.error(getErrorMessage(err));
			working = false;
		}
	}

	async function handleRecount() {
		working = true;
		try {
			const { id } = await recountStocktake(stocktakeId);
			goto(resolve(`/stocktakes/${id}`));
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			working = false;
		}
	}

	type Action =
		| 'mark_missing_unavailable'
		| 'restore_found_available'
		| 'move_found'
		| 'flag_maintenance'
		| 'flag_broken';
	let pendingAction = $state<Action | null>(null);

	let actionRows = $derived.by(() => {
		const c = stocktake.candidates;
		if (!c) return [];
		const applied = stocktake.appliedActions;
		const flagged = applied.includes('flag_maintenance') || applied.includes('flag_broken');
		return [
			{
				action: 'mark_missing_unavailable' as const,
				title: 'Mark missing units unavailable',
				detail: 'They stay in the pool but can no longer be booked until they turn up.',
				count: c.mark_missing_unavailable.length,
				applied: applied.includes('mark_missing_unavailable')
			},
			{
				action: 'restore_found_available' as const,
				title: 'Make found units available again',
				detail: 'Units marked unavailable that were counted after all.',
				count: c.restore_found_available.length,
				applied: applied.includes('restore_found_available')
			},
			{
				action: 'move_found' as const,
				title: 'Move units to where they were found',
				detail: 'Units counted at a different location than they are booked to.',
				count: c.move_found.length,
				applied: applied.includes('move_found')
			},
			{
				action: 'flag_maintenance' as const,
				title: 'Set flagged units to maintenance',
				detail: 'Units a counter marked as needing attention.',
				count: c.flag_maintenance.length,
				applied: flagged
			},
			{
				action: 'flag_broken' as const,
				title: 'Set flagged units to broken',
				detail: 'The same units, if they are beyond maintenance.',
				count: c.flag_broken.length,
				applied: flagged
			}
		];
	});
	let pendingRow = $derived(actionRows.find((r) => r.action === pendingAction) ?? null);

	async function handleAction() {
		if (!pendingAction) return;
		working = true;
		try {
			const { changed } = await applyStocktakeAction({ stocktakeId, action: pendingAction });
			toast.success(plural(changed, ['# unit changed', '# units changed']));
			pendingAction = null;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			working = false;
		}
	}

	function formatDateTime(d: Date) {
		return new Date(d).toLocaleString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	const selectClass =
		'flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:ring-2 focus:ring-ring focus:outline-none';
</script>

<svelte:head><title>{stocktake.name} | Technikpool</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0 space-y-1">
			<Button variant="ghost" size="sm" icon="back" href={resolve('/stocktakes')}>Stocktakes</Button
			>
			<h1 class="text-3xl font-bold tracking-tight">{stocktake.name}</h1>
			<p class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
				<OrgBadge
					name={orgLabel(stocktake.organization)}
					color={stocktake.organization.color}
					avatarLabel={stocktake.organization.avatarLabel}
				/>
				<span>
					Started {formatDateTime(stocktake.createdAt)} by {stocktake.createdBy.name ||
						stocktake.createdBy.email}
				</span>
				{#if stocktake.closedAt}
					<span>
						· Closed {formatDateTime(stocktake.closedAt)} by {stocktake.closedBy?.name ||
							stocktake.closedBy?.email}
					</span>
				{/if}
			</p>
			<p class="text-sm text-muted-foreground">
				{#if stocktake.recountOf}
					Recount of
					<a
						href={resolve(`/stocktakes/${stocktake.recountOf.id}`)}
						class="underline underline-offset-2">{stocktake.recountOf.name}</a
					>
				{:else}
					{stocktake.scope.locationIds.length === 0
						? 'All locations'
						: stocktake.countingLocations.map((l) => l.name).join(', ')}
					·
					{stocktake.scopeNames.categories.length === 0
						? 'All categories'
						: stocktake.scopeNames.categories.map((c) => categoryLabel(c)).join(', ')}
					{#if stocktake.scopeNames.products.length > 0}
						· {stocktake.scopeNames.products.map((p) => p.name).join(', ')}
					{/if}
				{/if}
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button
				variant="outline"
				icon="print"
				href={resolve(`/stocktakes/${stocktakeId}/print`)}
				target="_blank">Print</Button
			>
			<Button
				variant="outline"
				icon="download"
				href={resolve(`/stocktakes/${stocktakeId}/export.csv`)}
				data-sveltekit-reload>CSV</Button
			>
			{#if isOpen}
				<Button variant="destructive" icon="delete" onclick={() => (cancelOpen = true)}
					>Cancel</Button
				>
				<Button icon="confirm" onclick={() => (closeOpen = true)}>Close stocktake</Button>
			{:else if stocktake.progress.found < stocktake.progress.expected}
				<Button icon="refresh" onclick={handleRecount} disabled={working}>Recount missing</Button>
			{/if}
		</div>
	</div>

	<Card.Root>
		<Card.Content class="space-y-4">
			<StocktakeProgress progress={stocktake.progress} />
			{#if stocktake.recounts.length > 0}
				<p class="text-sm text-muted-foreground">
					Recounted in
					{#each stocktake.recounts as r, idx (r.id)}
						{idx > 0 ? ', ' : ''}<a
							href={resolve(`/stocktakes/${r.id}`)}
							class="underline underline-offset-2">{r.name}</a
						>
					{/each}
				</p>
			{/if}

			{#if isOpen}
				<div class="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
					<div class="space-y-2">
						<Label for="counting-location">I am counting at</Label>
						<select
							id="counting-location"
							value={locationId ?? ''}
							onchange={(e) => pickLocation(e.currentTarget.value)}
							class="{selectClass} w-full"
						>
							{#if !locationId}
								<option value="" disabled>Choose a location…</option>
							{/if}
							{#each stocktake.countingLocations as l (l.id)}
								<option value={l.id}>{l.name}</option>
							{/each}
						</select>
					</div>
					<form class="space-y-2" onsubmit={handleScan}>
						<Label for="scan-code">Scan or type a tag</Label>
						<div class="flex gap-2">
							<Input
								id="scan-code"
								bind:ref={scanInput}
								bind:value={code}
								autocomplete="off"
								placeholder="Asset tag, bundle tag or serial number"
								disabled={!locationId}
							/>
							<Button type="submit" disabled={!locationId || scanning || !code.trim()}
								>Count it</Button
							>
						</div>
					</form>
				</div>
				{#if feedback}
					<div
						class="rounded-md border px-3 py-2 text-sm {feedback.tone === 'good'
							? 'border-emerald-500/40 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
							: feedback.tone === 'warn'
								? 'border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
								: feedback.tone === 'bad'
									? 'border-destructive/40 bg-destructive/10 text-destructive'
									: 'bg-muted/50'}"
						role="status"
					>
						<p class="font-medium">{feedback.title}</p>
						{#if feedback.detail}<p class="text-xs opacity-80">{feedback.detail}</p>{/if}
					</div>
				{/if}
			{/if}
		</Card.Content>
	</Card.Root>

	{#if !isOpen && actionRows.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title>Corrections</Card.Title>
				<Card.Description>
					Each can be applied once. Worked out from the units as they are now, so anything that has
					moved or been retired since the count is left alone.
				</Card.Description>
			</Card.Header>
			<Card.Content class="divide-y">
				{#each actionRows as row (row.action)}
					<div class="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
						<div class="min-w-0">
							<p class="font-medium">{row.title}</p>
							<p class="text-xs text-muted-foreground">{row.detail}</p>
						</div>
						{#if row.applied}
							<span class="text-sm text-muted-foreground">Applied</span>
						{:else}
							<Button
								size="sm"
								variant="outline"
								disabled={row.count === 0 || working}
								onclick={() => (pendingAction = row.action)}
								>{plural(row.count, ['Apply to # unit', 'Apply to # units'])}</Button
							>
						{/if}
					</div>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}

	<div class="flex flex-wrap items-center gap-2">
		<select
			aria-label="State"
			value={effectiveState}
			onchange={(e) => (stateFilter = e.currentTarget.value as StateFilter)}
			class={selectClass}
		>
			<option value="all">All ({stocktake.items.length})</option>
			{#if isOpen}
				<option value="open">Not counted yet ({counts.open})</option>
			{:else}
				<option value="missing">Missing ({counts.missing})</option>
			{/if}
			<option value="found">Found ({counts.found})</option>
			<option value="out">Out on a production ({counts.out})</option>
			<option value="unexpected">Unexpected ({counts.unexpected})</option>
			<option value="attention">Needs attention ({attentionCount})</option>
		</select>
		<select aria-label="Category" bind:value={categoryFilter} class={selectClass}>
			<option value="">All categories</option>
			{#each categories as c (c.id)}
				<option value={c.id}>{categoryLabel(c)}</option>
			{/each}
		</select>
		{#if stocktake.countingLocations.length > 1}
			<select aria-label="Location" bind:value={locationFilter} class={selectClass}>
				<option value="">All locations</option>
				{#each stocktake.countingLocations as l (l.id)}
					<option value={l.id}>{l.name}</option>
				{/each}
			</select>
		{/if}
		<Input bind:value={search} placeholder="Search…" class="h-9 w-full sm:w-56" />
	</div>

	{#if visibleProducts.length > 0}
		<section class="space-y-2">
			<h2 class="text-lg font-semibold">Untagged units</h2>
			<p class="text-sm text-muted-foreground">
				Counted per product. Everyone enters what they counted where they are; the counts add up.
			</p>
			<div class="overflow-x-auto rounded-md border">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b bg-muted/30">
							<th class="px-4 py-2 text-left font-medium text-muted-foreground">Product</th>
							<th class="px-4 py-2 text-left font-medium text-muted-foreground">Where</th>
							<th class="px-4 py-2 text-right font-medium text-muted-foreground">Counted</th>
							{#if isOpen}
								<th class="w-32 px-4 py-2 text-right font-medium text-muted-foreground">My count</th
								>
							{/if}
						</tr>
					</thead>
					<tbody>
						{#each visibleProducts as p (p.product.id)}
							{@const here = p.locations.find((l) => l.location.id === locationId)}
							<tr class="border-b align-top last:border-0">
								<td class="px-4 py-2">
									<p class="font-medium">
										{#if p.product.manufacturer}<span class="font-normal text-muted-foreground"
												>{p.product.manufacturer.name}</span
											>{/if}
										{p.product.name}
									</p>
									<CategoryPill
										name={categoryLabel(p.product.category)}
										color={p.product.category.color}
										class="mt-1"
									/>
								</td>
								<td class="px-4 py-2 text-xs text-muted-foreground">
									{#each p.locations as l (l.location.id)}
										<p>
											{l.location.name}: {l.counted} / {l.expected}
											{#if l.out > 0}· {l.out} out{/if}
											{#if l.counters.length > 0}
												<span class="opacity-80"
													>({l.counters.map((c) => `${c.name} ${c.count}`).join(', ')})</span
												>
											{/if}
										</p>
									{/each}
								</td>
								<td
									class="px-4 py-2 text-right font-medium tabular-nums {p.counted < p.expected
										? isOpen
											? ''
											: 'text-destructive'
										: 'text-emerald-600 dark:text-emerald-400'}"
								>
									{p.counted} / {p.expected}
								</td>
								{#if isOpen}
									<td class="px-4 py-2 text-right">
										<Input
											type="number"
											min="0"
											inputmode="numeric"
											class="ml-auto h-8 w-20 text-right"
											value={here?.myCount ?? ''}
											disabled={!locationId}
											onchange={(e) =>
												saveCount(p.product.id, e.currentTarget.value, here?.myCount ?? 0)}
										/>
									</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}

	{#if groups.length === 0 && visibleProducts.length === 0}
		<Card.Root>
			<Card.Content class="py-10 text-center text-sm text-muted-foreground">
				Nothing matches these filters.
			</Card.Content>
		</Card.Root>
	{/if}

	{#each groups as group (group.id)}
		<section class="space-y-2">
			<h2 class="text-lg font-semibold">
				{group.name}
				<span class="text-sm font-normal text-muted-foreground">({group.items.length})</span>
			</h2>
			<div class="overflow-x-auto rounded-md border">
				<table class="w-full text-sm">
					<tbody>
						{#each group.items as item (item.assetId)}
							{@const mine = item.foundBy?.id === stocktake.me}
							{@const canToggle = isOpen && !busy.has(item.assetId) && (!item.foundAt || mine)}
							{@const elsewhere =
								item.foundLocation &&
								item.expectedLocation &&
								item.foundLocation.id !== item.expectedLocation.id}
							<tr class="border-b align-top transition-colors last:border-0 hover:bg-muted/30">
								<td class="w-10 py-2 pl-4">
									<input
										type="checkbox"
										class="mt-1 size-4 accent-emerald-600"
										checked={!!item.foundAt}
										disabled={!canToggle}
										title={item.foundAt && !mine
											? `Counted by ${item.foundBy?.name || item.foundBy?.email}`
											: undefined}
										onchange={() => toggleItem(item)}
									/>
								</td>
								<td class="px-3 py-2 {item.asset.parentAssetId ? 'pl-8' : ''}">
									<p class="font-medium">
										{#if item.asset.product.manufacturer}<span
												class="font-normal text-muted-foreground"
												>{item.asset.product.manufacturer.name}</span
											>{/if}
										{item.asset.product.name}
									</p>
									<p class="text-xs text-muted-foreground">
										{item.asset.assetTag ?? item.asset.serialNumber ?? 'No tag'}
										{#if item.asset.parentAssetId}· Accessory{/if}
										{#if item.asset.bundle}
											· {item.asset.bundle.template.name}{item.asset.bundle.tag
												? ` (${item.asset.bundle.tag})`
												: ''}
										{/if}
										{#if item.asset.organizationId !== stocktake.organizationId}
											· {orgLabel(item.asset.organization)}
										{/if}
									</p>
								</td>
								<td class="hidden px-3 py-2 md:table-cell">
									<CategoryPill
										name={categoryLabel(item.asset.product.category)}
										color={item.asset.product.category.color}
									/>
								</td>
								<td class="px-3 py-2">
									<span
										class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold {stocktakeStateClass(
											item.state
										)}">{stocktakeStateLabel(item.state)}</span
									>
									{#if item.asset.status !== 'AVAILABLE'}
										<AssetStatusBadge status={item.asset.status} class="ml-1" />
									{/if}
									<p class="mt-1 text-xs text-muted-foreground">
										{#if item.state === 'unexpected'}
											{unexpectedReasonLabel(item.unexpectedReason)}
										{:else if item.state === 'out'}
											{item.outProductionName}
										{/if}
										{#if item.foundAt}
											{item.foundBy?.name || item.foundBy?.email} · {item.foundLocation?.name}
											· {foundViaLabel(item.foundVia)}
										{/if}
										{#if item.foundAt && item.outProductionName}
											· Checked out to {item.outProductionName}
										{/if}
									</p>
									{#if elsewhere}
										<p
											class="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300"
										>
											<TriangleAlert class="size-3.5" aria-hidden="true" />
											Booked to {item.expectedLocation?.name}
										</p>
									{/if}
									{#if item.note || item.needsAttention}
										<p class="mt-1 flex items-center gap-1 text-xs">
											{#if item.needsAttention}
												<CircleAlert class="size-3.5 text-destructive" aria-hidden="true" />
												<span class="font-medium text-destructive">Needs attention</span>
											{/if}
											{#if item.note}<span class="text-muted-foreground">{item.note}</span>{/if}
										</p>
									{/if}
								</td>
								<td class="w-12 py-2 pr-3 text-right">
									{#if isOpen && item.foundAt && mine}
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label="Note"
											title="Note"
											onclick={() => openNote(item)}
										>
											<MessageSquare class="size-4" />
										</Button>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/each}
</div>

<Modal bind:open={confirmOpen} title={confirmTitle} size="md" dismissible={!confirming}>
	{#snippet children()}
		<div class="space-y-1">
			{#each confirmEntries as entry (entry.assetId)}
				<label
					class="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50 {entry.foundByName
						? 'opacity-60'
						: ''}"
				>
					<input
						type="checkbox"
						class="size-4 accent-emerald-600"
						checked={!!entry.foundByName || confirmChecked.has(entry.assetId)}
						disabled={!!entry.foundByName}
						onchange={(e) =>
							e.currentTarget.checked
								? confirmChecked.add(entry.assetId)
								: confirmChecked.delete(entry.assetId)}
					/>
					<span class="min-w-0 flex-1">
						<span class="block text-sm font-medium">{label(entry)}</span>
						<span class="block text-xs text-muted-foreground">
							{entry.assetTag ?? 'No tag'}
							{#if entry.foundByName}· Counted by {entry.foundByName}{/if}
						</span>
					</span>
				</label>
			{/each}
		</div>
	{/snippet}
	{#snippet description()}
		Uncheck anything that is not there.
	{/snippet}
	{#snippet footer()}
		<Button icon="confirm" onclick={submitConfirm} disabled={confirming}>
			{confirmKind === 'accessories'
				? plural(confirmChecked.size, ['Count # accessory', 'Count # accessories'])
				: plural(confirmChecked.size, ['Count # unit', 'Count # units'])}
		</Button>
		<Button
			variant="outline"
			icon="close"
			onclick={() => (confirmOpen = false)}
			disabled={confirming}
		>
			{confirmKind === 'group' ? 'Only this one' : 'Skip'}
		</Button>
	{/snippet}
</Modal>

{#if noteItem}
	{@const target = noteItem}
	<Modal
		open={true}
		onclose={() => (noteItem = null)}
		title={target.asset.product.name}
		dismissible={!savingNote}
	>
		{#snippet children()}
			<form
				id="stocktake-note-form"
				class="space-y-4"
				onsubmit={(e) => {
					e.preventDefault();
					saveNote();
				}}
			>
				<div class="space-y-2">
					<Label for="stocktake-note">Note</Label>
					<Input
						id="stocktake-note"
						bind:value={noteText}
						placeholder="Case cracked, cable frayed…"
					/>
				</div>
				<label class="flex items-center gap-2 text-sm">
					<input type="checkbox" class="size-4" bind:checked={noteAttention} />
					Needs attention
				</label>
			</form>
		{/snippet}
		{#snippet description()}
			{target.asset.assetTag ?? target.asset.serialNumber ?? ''}
		{/snippet}
		{#snippet footer()}
			<Button icon="save" type="submit" form="stocktake-note-form" disabled={savingNote}
				>{savingNote ? 'Saving…' : 'Save'}</Button
			>
			<Button variant="outline" icon="close" onclick={() => (noteItem = null)} disabled={savingNote}
				>Cancel</Button
			>
		{/snippet}
	</Modal>
{/if}

<Modal bind:open={closeOpen} title="Close this stocktake?" dismissible={!working}>
	{#snippet children()}
		<p class="text-sm">
			{#if counts.open > 0}
				{plural(counts.open, [
					'# unit has not been counted and will be reported missing.',
					'# units have not been counted and will be reported missing.'
				])}
			{:else}
				Every unit has been counted.
			{/if}
		</p>
		<p class="mt-2 text-sm text-muted-foreground">
			Closing is final: nobody can count into it any more. Corrections such as marking missing units
			unavailable are offered on the report afterwards.
		</p>
	{/snippet}
	{#snippet footer()}
		<Button icon="confirm" onclick={handleClose} disabled={working}>Close stocktake</Button>
		<Button variant="outline" icon="close" onclick={() => (closeOpen = false)} disabled={working}
			>Keep counting</Button
		>
	{/snippet}
</Modal>

<Modal bind:open={cancelOpen} title="Cancel this stocktake?" dismissible={!working}>
	{#snippet children()}
		<p class="text-sm">
			It is deleted together with everything counted so far. Nothing is written into the history of
			any unit.
		</p>
	{/snippet}
	{#snippet footer()}
		<Button variant="destructive" icon="delete" onclick={handleCancel} disabled={working}
			>Delete stocktake</Button
		>
		<Button variant="outline" icon="close" onclick={() => (cancelOpen = false)} disabled={working}
			>Keep it</Button
		>
	{/snippet}
</Modal>

{#if pendingRow}
	{@const row = pendingRow}
	<Modal
		open={true}
		onclose={() => (pendingAction = null)}
		title={row.title}
		dismissible={!working}
	>
		{#snippet children()}
			<p class="text-sm">
				{plural(row.count, ['This changes # unit.', 'This changes # units.'])}
				{row.detail}
			</p>
		{/snippet}
		{#snippet footer()}
			<Button icon="confirm" onclick={handleAction} disabled={working}>Apply</Button>
			<Button
				variant="outline"
				icon="close"
				onclick={() => (pendingAction = null)}
				disabled={working}>Cancel</Button
			>
		{/snippet}
	</Modal>
{/if}
