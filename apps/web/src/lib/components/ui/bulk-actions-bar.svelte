<script lang="ts">
	import { LocationSelect } from '#lib/components/ui/location-select/index.js';
	import { getErrorMessage, orgLabel } from '#lib/utils.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { bulkUpdateAssetStatus, getPlaceableLocations } from '#lib/remote/assets.remote.js';
	import { getAllProductions, checkoutAssets } from '#lib/remote/checkout.remote.js';
	import { ASSET_STATUSES, isRetiredStatus, type AssetStatus } from '#lib/asset-status.js';
	import {
		assetStatusDescription,
		assetStatusLabel
	} from '#lib/components/ui/asset-status/index.js';
	import { toast } from 'svelte-sonner';
	import type { Snippet } from 'svelte';

	type Props = {
		selectedIds: Set<string>;
		onClear: () => void;
		/** Off for a selection that can't be booked — a list of retired units. */
		canCheckout?: boolean;
		/** Off where the selection isn't a set of assets to administer. */
		canSetStatus?: boolean;
		/**
		 * Off where the page is a production already: booking onto another one from
		 * there is not what anyone means, and `actions` offers what they do mean.
		 */
		productionTarget?: boolean;
		/** Actions of the page's own, drawn ahead of the move. */
		actions?: Snippet;
	};

	let {
		selectedIds,
		onClear,
		canCheckout = true,
		canSetStatus = false,
		productionTarget = true,
		actions
	}: Props = $props();

	let targetType = $state<'location' | 'production'>('location');
	let targetId = $state('');
	let working = $state(false);

	// Locations are every one a unit may go to, a friend's included — the server
	// decides per unit whether its org may be kept there. Productions are only
	// those this user may check out to. Read through the queries rather than
	// awaited: this bar sits on the Devices page, and an `await` here would hold
	// that whole page back until they answered. See CLAUDE.md, "Loading states".
	let locationsQuery = $derived(getPlaceableLocations());
	let productionsQuery = $derived(getAllProductions());
	let locations = $derived(locationsQuery.current ?? []);
	let productions = $derived(
		(productionsQuery.current ?? []).filter((prod) => prod.checkoutRole !== null)
	);

	let targets = $derived(
		productions.map((p) => ({ id: p.id, label: `${p.name} (${orgLabel(p.organization)})` }))
	);

	async function handleCheckout() {
		if (!targetId || selectedIds.size === 0) return;
		working = true;
		try {
			const result = await checkoutAssets({
				assetIds: [...selectedIds],
				targetType,
				targetId
			});
			toast.success(
				`${result.count} asset${result.count !== 1 ? 's' : ''} checked out to ${result.targetName}`
			);
			onClear();
			targetId = '';
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			working = false;
		}
	}

	let newStatus = $state<AssetStatus | ''>('');
	let settingStatus = $state(false);
	let confirmingRetire = $state(false);

	function handleSetStatus() {
		if (!newStatus || selectedIds.size === 0) return;
		// Retiring takes the whole selection out of every listing and out of its
		// bundles. One unit at a time that's a visible decision; a batch of them
		// is worth confirming.
		if (isRetiredStatus(newStatus)) confirmingRetire = true;
		else applyStatus();
	}

	async function applyStatus() {
		if (!newStatus || selectedIds.size === 0) return;
		settingStatus = true;
		try {
			const result = await bulkUpdateAssetStatus({
				assetIds: [...selectedIds],
				status: newStatus
			});
			const label = assetStatusLabel(result.status);
			toast.success(
				result.updated === 0
					? `Already set to ${label} — nothing changed`
					: result.unchanged > 0
						? `${result.updated} asset${result.updated !== 1 ? 's' : ''} set to ${label} · ${result.unchanged} already were`
						: `${result.updated} asset${result.updated !== 1 ? 's' : ''} set to ${label}`
			);
			confirmingRetire = false;
			newStatus = '';
			onClear();
		} catch (err) {
			// The command names what stands in the way — a production the unit is
			// still booked for — and that reason is the useful part.
			toast.error(getErrorMessage(err));
			confirmingRetire = false;
		} finally {
			settingStatus = false;
		}
	}
</script>

{#if selectedIds.size > 0}
	<div
		class="fixed right-0 bottom-0 left-0 z-40 border-t bg-background/95 px-4 py-3 shadow-lg backdrop-blur-sm"
	>
		<div class="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
			<span class="text-sm font-medium"
				>{selectedIds.size} asset{selectedIds.size !== 1 ? 's' : ''} selected</span
			>
			<button
				type="button"
				onclick={onClear}
				class="text-sm text-muted-foreground transition-colors hover:text-foreground"
			>
				Clear
			</button>
			<div class="ml-auto flex flex-wrap items-center gap-2">
				{#if canSetStatus}
					<select
						bind:value={newStatus}
						class="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
					>
						<option value="">Set status…</option>
						{#each ASSET_STATUSES as s (s)}
							<option value={s}>{assetStatusLabel(s)}</option>
						{/each}
					</select>
					<Button
						variant="outline"
						onclick={handleSetStatus}
						disabled={!newStatus || settingStatus}
						size="sm"
					>
						{settingStatus ? 'Applying…' : 'Apply'}
					</Button>
					{#if canCheckout}
						<span class="mx-1 hidden h-6 w-px bg-border sm:block"></span>
					{/if}
				{/if}
				{#if actions}
					{@render actions()}
					{#if canCheckout}
						<span class="mx-1 text-sm text-muted-foreground">or</span>
					{/if}
				{/if}
				{#if canCheckout && !productionTarget}
					<LocationSelect
						{locations}
						bind:value={targetId}
						disabled={locations.length === 0}
						placeholder="Move to location…"
						placement="above"
						size="sm"
						class="min-w-56"
					/>
					<Button
						variant="outline"
						onclick={handleCheckout}
						disabled={!targetId || working}
						size="sm"
					>
						{working ? 'Moving…' : 'Move'}
					</Button>
				{:else if canCheckout}
					<select
						bind:value={targetType}
						onchange={() => (targetId = '')}
						class="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
					>
						<option value="location">Location</option>
						<option value="production">Production</option>
					</select>
					{#if targetType === 'location'}
						<LocationSelect
							{locations}
							bind:value={targetId}
							disabled={locations.length === 0}
							placeholder="Select target…"
							placement="above"
							size="sm"
							class="min-w-56"
						/>
					{:else}
						<select
							bind:value={targetId}
							disabled={targets.length === 0}
							class="h-9 min-w-44 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
						>
							<option value="">Select target…</option>
							{#each targets as t (t.id)}
								<option value={t.id}>{t.label}</option>
							{/each}
						</select>
					{/if}
					<Button onclick={handleCheckout} disabled={!targetId || working} size="sm">
						{working ? 'Checking out…' : 'Checkout'}
					</Button>
				{/if}
			</div>
			{#if canSetStatus && newStatus}
				<!-- Its own line, and only once a status is picked: what a status does to a
				     whole selection is worth spelling out, but not at the cost of the bar's height. -->
				<p class="w-full text-xs text-muted-foreground">
					{assetStatusDescription(newStatus)}
				</p>
			{/if}
		</div>
	</div>
{/if}

{#if newStatus}
	<Modal
		bind:open={confirmingRetire}
		title="Mark {selectedIds.size} asset{selectedIds.size !== 1 ? 's' : ''} as {assetStatusLabel(
			newStatus
		)}?"
		dismissible={!settingStatus}
	>
		{#snippet description()}
			They leave the pool: no longer bookable, scannable or listed, and removed from any bundle they
			are in. The status can be set back, but the bundle membership can't — that has to be rebuilt.
		{/snippet}

		{#snippet footer()}
			<Button
				type="button"
				class="bg-destructive text-white hover:bg-destructive/90"
				onclick={applyStatus}
				disabled={settingStatus}
			>
				{settingStatus ? 'Applying…' : 'Confirm'}
			</Button>
			<Button
				icon="close"
				type="button"
				variant="outline"
				onclick={() => (confirmingRetire = false)}
				disabled={settingStatus}
			>
				Cancel
			</Button>
		{/snippet}
	</Modal>
{/if}
