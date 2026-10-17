<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { ProductThumb } from '#lib/components/ui/product-thumb/index.js';
	import { makerAndName } from '#lib/product-label.js';
	import { getErrorMessage, plural } from '#lib/utils.js';
	import {
		handOutAdditions,
		searchHandoutAdditions
	} from '#lib/remote/production-handout.remote.js';

	// Handing out what the list does not have. A tagged unit is scanned onto the
	// production; a cable without a tag has nothing to scan, so it is found here
	// by name and handed out by number. See `searchHandoutCandidates`.

	let { productionId, organizationId }: { productionId: string; organizationId: string } = $props();

	let text = $state('');
	let term = $state('');
	// Asked once typing pauses, not on every key.
	$effect(() => {
		const value = text.trim();
		const timer = setTimeout(() => (term = value), 250);
		return () => clearTimeout(timer);
	});

	let resultsQuery = $derived(
		term.length >= 2 ? searchHandoutAdditions({ productionId, text: term }) : null
	);
	let results = $derived(resultsQuery?.current ?? []);
	const counts = new SvelteMap<string, number>();
	let working = $state<string | null>(null);

	async function handOut(result: (typeof results)[number]) {
		const count = Math.min(counts.get(result.key) ?? 1, result.available);
		working = result.key;
		try {
			const done = await handOutAdditions({
				productionId,
				organizationId,
				productId: result.productId,
				ownerId: result.organizationId,
				locationId: result.locationId,
				count
			});
			toast.success(
				`${plural(done.count, ['Handed out: 1×', 'Handed out: #×'])} ${makerAndName(result.manufacturerName, result.productName)}`
			);
			counts.delete(result.key);
			await searchHandoutAdditions({ productionId, text: term }).refresh();
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			working = null;
		}
	}
</script>

<div class="mt-4 space-y-2 border-t pt-4">
	<Label for="handout-search">Not on the list and no tag to scan? Find it by name</Label>
	<Input
		id="handout-search"
		bind:value={text}
		autocomplete="off"
		placeholder="Product name, maker or tag"
	/>
	{#if resultsQuery && resultsQuery.ready && results.length === 0}
		<p class="text-sm text-muted-foreground">Nothing free under that name.</p>
	{:else if results.length > 0}
		<ul class="divide-y rounded-md border">
			{#each results as result (result.key)}
				<li class="flex flex-wrap items-center gap-3 px-3 py-2">
					<ProductThumb path={result.productImagePath} alt={result.productName} size={36} />
					<span class="min-w-0 flex-1">
						<span class="block truncate font-medium"
							>{makerAndName(result.manufacturerName, result.productName)}</span
						>
						<span class="block truncate text-xs text-muted-foreground">
							{result.locationName} · {result.organizationName} · {plural(result.available, [
								'1 free',
								'# free'
							])}{result.untagged < result.available
								? ` (${plural(result.untagged, ['1 without a tag', '# without a tag'])})`
								: ''}
						</span>
					</span>
					<Input
						type="number"
						min={1}
						max={result.available}
						value={counts.get(result.key) ?? 1}
						oninput={(e) => counts.set(result.key, Number(e.currentTarget.value) || 1)}
						class="h-8 w-20"
						aria-label="How many"
					/>
					<Button
						size="sm"
						variant="secondary"
						disabled={working !== null}
						onclick={() => handOut(result)}
					>
						{working === result.key ? 'Handing out…' : 'Hand out'}
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
