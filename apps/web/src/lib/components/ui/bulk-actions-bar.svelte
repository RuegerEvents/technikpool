<script lang="ts">
	import { getErrorMessage, orgLabel } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import { bulkUpdateAssetStatus, getLocations } from '$lib/remote/assets.remote';
	import { getAllProductions, checkoutAssets } from '$lib/remote/checkout.remote';
	import { ASSET_STATUSES, isRetiredStatus, type AssetStatus } from '$lib/asset-status';
	import { assetStatusLabel } from '$lib/components/ui/asset-status';
	import { toast } from 'svelte-sonner';

	type Props = {
		selectedIds: Set<string>;
		onClear: () => void;
		/** Off for a selection that can't be booked — a list of retired units. */
		canCheckout?: boolean;
		/** Off where the selection isn't a set of assets to administer. */
		canSetStatus?: boolean;
	};

	let { selectedIds, onClear, canCheckout = true, canSetStatus = false }: Props = $props();

	let targetType = $state<'location' | 'production'>('location');
	let targetId = $state('');
	let working = $state(false);

	let locations = $derived(await getLocations());
	let productions = $derived(await getAllProductions());

	let targets = $derived(
		targetType === 'location'
			? locations.map((l) => {
					const addr = [l.address?.postalCode?.trim(), l.address?.city?.trim()]
						.filter(Boolean)
						.join(' ');
					const detail = [orgLabel(l.organization), addr].filter(Boolean).join(' · ');
					return { id: l.id, label: detail ? `${l.name} (${detail})` : l.name };
				})
			: productions.map((p) => ({ id: p.id, label: `${p.name} (${orgLabel(p.organization)})` }))
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
				{#if canCheckout}
					<select
						bind:value={targetType}
						onchange={() => (targetId = '')}
						class="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
					>
						<option value="location">Location</option>
						<option value="production">Production</option>
					</select>
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
					<Button onclick={handleCheckout} disabled={!targetId || working} size="sm">
						{working ? 'Checking out…' : 'Checkout'}
					</Button>
				{/if}
			</div>
		</div>
	</div>
{/if}

{#if confirmingRetire && newStatus}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		onkeydown={(e) => e.key === 'Escape' && (confirmingRetire = false)}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="mx-4 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg"
			onkeydown={(e) => e.stopPropagation()}
		>
			<h2 class="mb-1 text-lg font-semibold">
				Mark {selectedIds.size} asset{selectedIds.size !== 1 ? 's' : ''} as {assetStatusLabel(
					newStatus
				)}?
			</h2>
			<p class="mb-5 text-sm text-muted-foreground">
				They leave the pool: no longer bookable, scannable or listed, and removed from any bundle
				they are in. The status can be set back, but the bundle membership can't — that has to be
				rebuilt.
			</p>
			<div class="flex justify-end gap-3">
				<Button
					type="button"
					variant="outline"
					onclick={() => (confirmingRetire = false)}
					disabled={settingStatus}
				>
					Cancel
				</Button>
				<Button
					type="button"
					class="bg-destructive text-white hover:bg-destructive/90"
					onclick={applyStatus}
					disabled={settingStatus}
				>
					{settingStatus ? 'Applying…' : 'Confirm'}
				</Button>
			</div>
		</div>
	</div>
{/if}
