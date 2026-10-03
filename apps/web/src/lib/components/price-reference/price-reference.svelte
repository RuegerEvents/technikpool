<script lang="ts">
	import type { getPriceReferences } from '#lib/remote/assets.remote.js';

	type Reference = Awaited<ReturnType<typeof getPriceReferences>>[string];

	let {
		reference,
		onApply
	}: {
		reference: Reference | undefined;
		onApply: (price: number) => void;
	} = $props();

	function money(n: number) {
		return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}
</script>

{#if reference && (reference.peers || reference.lenders.length > 0)}
	<div class="space-y-1 text-xs text-muted-foreground">
		{#each reference.lenders as lender (lender.organizationId)}
			<p class="flex flex-wrap items-center gap-x-1.5">
				<span>Lender {lender.name}:</span>
				<button
					type="button"
					class="rounded border px-1.5 py-0.5 text-foreground tabular-nums transition-colors hover:bg-muted"
					title="Use this price"
					onclick={() => onApply(lender.price)}>{money(lender.price)}</button
				>
			</p>
		{/each}
		{#if reference.peers}
			{@const peers = reference.peers}
			<p class="flex flex-wrap items-center gap-x-1.5">
				{#if peers.count === 1}
					<span>Your other organization:</span>
				{:else}
					<span
						>Your {peers.count} other organizations: {money(peers.min)} – {money(peers.max)}, median</span
					>
				{/if}
				<button
					type="button"
					class="rounded border px-1.5 py-0.5 text-foreground tabular-nums transition-colors hover:bg-muted"
					title="Use this price"
					onclick={() => onApply(peers.median)}>{money(peers.median)}</button
				>
			</p>
		{/if}
	</div>
{/if}
