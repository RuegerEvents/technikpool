<script lang="ts">
	// The kit's inventory list for the lid of its case: a PDF in a new tab, on
	// A4 or A5, as tiles or as a list, chosen in a small dialog. The last choice
	// is remembered in this browser. The route is a plain URL, so the opened
	// tab is also a bookmark (see inventory-list/+server.ts).
	import { resolve } from '$app/paths';
	import { browser } from '$app/env';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';

	let { bundleId }: { bundleId: string } = $props();

	type Size = 'a4' | 'a5';
	type Layout = 'grid' | 'list';
	const KEY = 'inventory_list_options';

	function remembered(): { size: Size; layout: Layout } {
		try {
			const saved = browser ? JSON.parse(localStorage.getItem(KEY) ?? 'null') : null;
			return {
				size: saved?.size === 'a5' ? 'a5' : 'a4',
				layout: saved?.layout === 'list' ? 'list' : 'grid'
			};
		} catch {
			return { size: 'a4', layout: 'grid' };
		}
	}

	let open = $state(false);
	let size = $state<Size>(remembered().size);
	let layout = $state<Layout>(remembered().layout);

	function openPdf() {
		try {
			localStorage.setItem(KEY, JSON.stringify({ size, layout }));
		} catch {
			// A private window: the dialog simply starts on A4 tiles next time.
		}
		const url = `${resolve(`assets/bundles/${bundleId}/inventory-list`)}?size=${size}&layout=${layout}`;
		window.open(url, '_blank', 'noopener');
		open = false;
	}

	const choice = (active: boolean) =>
		`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
			active
				? 'border-primary bg-primary text-primary-foreground'
				: 'border-input bg-background hover:bg-muted'
		}`;
</script>

<Button icon="print" variant="outline" onclick={() => (open = true)}>Inventory list</Button>

<Modal bind:open title="Inventory list">
	{#snippet children()}
		<div class="space-y-4">
			<p class="text-sm text-muted-foreground">
				For the lid of the case, always landscape: what belongs in it, with pictures.
			</p>
			<div class="space-y-2">
				<p class="text-sm font-medium">Page size</p>
				<div class="flex gap-2">
					<button type="button" class={choice(size === 'a4')} onclick={() => (size = 'a4')}
						>A4</button
					>
					<button type="button" class={choice(size === 'a5')} onclick={() => (size = 'a5')}
						>A5</button
					>
				</div>
			</div>
			<div class="space-y-2">
				<p class="text-sm font-medium">Layout</p>
				<div class="flex gap-2">
					<button type="button" class={choice(layout === 'grid')} onclick={() => (layout = 'grid')}
						>Tiles</button
					>
					<button type="button" class={choice(layout === 'list')} onclick={() => (layout = 'list')}
						>List</button
					>
				</div>
			</div>
		</div>
	{/snippet}
	{#snippet footer()}
		<Button icon="print" onclick={openPdf}>Open PDF</Button>
		<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
	{/snippet}
</Modal>
