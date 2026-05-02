<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { getLocations } from '$lib/remote/assets.remote';
	import { getAllProductions, checkoutAssets } from '$lib/remote/checkout.remote';
	import { toast } from 'svelte-sonner';

	type Props = {
		selectedIds: Set<string>;
		onClear: () => void;
	};

	let { selectedIds, onClear }: Props = $props();

	let targetType = $state<'location' | 'production'>('location');
	let targetId = $state('');
	let working = $state(false);

	let locations = $derived(await getLocations());
	let productions = $derived(await getAllProductions());

	let targets = $derived(
		targetType === 'location'
			? locations.map((l) => {
					const city = l.address?.city?.trim();
					const country = l.address?.country?.trim();
					const addr = [city, country].filter(Boolean).join(', ');
					const detail = [l.organization.name, addr].filter(Boolean).join(' · ');
					return { id: l.id, label: detail ? `${l.name} (${detail})` : l.name };
				})
			: productions.map((p) => ({ id: p.id, label: `${p.name} (${p.organization.name})` }))
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
			toast.error((err as Error).message);
		} finally {
			working = false;
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
			</div>
		</div>
	</div>
{/if}
