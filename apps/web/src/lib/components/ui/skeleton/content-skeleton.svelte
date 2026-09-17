<script lang="ts" module>
	/**
	 * The shapes data arrives in on this app's pages. A skeleton is a hint about
	 * what is coming, not a promise: close enough that the real thing settles
	 * into it rather than replacing it, and no closer.
	 */
	export type ContentShape = 'rows' | 'table' | 'cards' | 'form' | 'block' | 'inline' | 'text';
</script>

<script lang="ts">
	import { getErrorMessage } from '$lib/utils';
	import Skeleton from './skeleton.svelte';

	type Props = {
		shape?: ContentShape;
		/** Rows, cards or fields to draw. Ignored by `block` and `text`. */
		count?: number;
		/** Height of the `block` shape, as a Tailwind class. */
		class?: string;
		/**
		 * The query's failure, if it had one. It belongs in the same slot as the
		 * skeleton because they answer the same question — what is in this space
		 * until the data is here — and because a query that failed is never going
		 * to be ready, so a skeleton alone would pulse there for ever.
		 */
		error?: unknown;
	};

	let { shape = 'rows', count = 6, class: className = 'h-64', error }: Props = $props();

	// Varying widths, because a column of identical bars reads as a pattern
	// rather than as text about to appear.
	const widths = ['w-2/5', 'w-1/3', 'w-1/2', 'w-2/5', 'w-5/12', 'w-1/3', 'w-2/5', 'w-1/2'];
	let items = $derived(Array.from({ length: count }, (_, i) => widths[i % widths.length]));
</script>

{#if error}
	<p
		class="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
		role="alert"
	>
		{getErrorMessage(error)}
	</p>
{:else}
	<div class="skeleton" aria-busy="true">
		<span class="sr-only">Loading…</span>

		{#if shape === 'rows'}
			<div class="space-y-3">
				{#each items as width, i (i)}
					<div class="flex items-center gap-4">
						<Skeleton class="size-8 shrink-0" />
						<Skeleton class="h-4 {width}" />
						<Skeleton class="ml-auto h-6 w-20 shrink-0" />
					</div>
				{/each}
			</div>
		{:else if shape === 'table'}
			<div class="rounded-lg border bg-card">
				<div class="border-b p-4"><Skeleton class="h-9 w-full max-w-sm" /></div>
				<div class="divide-y">
					{#each items as width, i (i)}
						<div class="flex items-center gap-4 p-4">
							<Skeleton class="size-8 shrink-0" />
							<Skeleton class="h-4 {width}" />
							<Skeleton class="ml-auto h-6 w-20 shrink-0" />
						</div>
					{/each}
				</div>
			</div>
		{:else if shape === 'cards'}
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each items as width, i (i)}
					<div class="space-y-3 rounded-lg border bg-card p-4">
						<Skeleton class="aspect-[4/3] w-full" />
						<Skeleton class="h-5 {width}" />
						<Skeleton class="h-4 w-1/3" />
					</div>
				{/each}
			</div>
		{:else if shape === 'form'}
			<div class="space-y-4">
				{#each items as width, i (i)}
					<div class="space-y-2">
						<Skeleton class="h-4 {width}" />
						<Skeleton class="h-10 w-full" />
					</div>
				{/each}
			</div>
		{:else if shape === 'inline'}
			<div class="flex gap-2">
				{#each items.slice(0, Math.min(count, 3)) as width, i (i)}
					<Skeleton class="h-10 max-w-40 {width}" />
				{/each}
			</div>
		{:else if shape === 'text'}
			<Skeleton class={className} />
		{:else}
			<Skeleton class="w-full {className}" />
		{/if}
	</div>
{/if}

<style>
	/*
	  Held invisible for a moment before fading in. Data that is already in hand
	  settles well inside that window, so a quick navigation goes straight to the
	  real thing instead of flashing a skeleton at it — and a slow one still gets
	  an answer within a fifth of a second.
	*/
	.skeleton {
		animation: skeleton-in 150ms 120ms both;
	}

	@keyframes skeleton-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.skeleton {
			animation-duration: 1ms;
		}
	}
</style>
