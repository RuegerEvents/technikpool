<script lang="ts">
	import { cn } from '$lib/utils';

	type Props = {
		src?: string | null;
		alt?: string;
		/** Edge length in px. 28 is the table default — dense enough to leave row height alone. */
		size?: number;
		class?: string;
	};

	let { src, alt = '', size = 28, class: className }: Props = $props();
</script>

<!--
  The placeholder is the same box as the image, not an absence: a product without
  a photo would otherwise shift its name left and break the column's alignment
  down a long list. `object-contain` because product shots are rarely square and
  cropping a connector out of a cable photo makes it unidentifiable.
-->
{#if src}
	<img
		{src}
		{alt}
		loading="lazy"
		class={cn('shrink-0 rounded border bg-background object-contain p-px', className)}
		style="width: {size}px; height: {size}px;"
	/>
{:else}
	<div
		class={cn(
			'flex shrink-0 items-center justify-center rounded border bg-muted/40 text-muted-foreground',
			className
		)}
		style="width: {size}px; height: {size}px;"
		aria-hidden="true"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={Math.round(size * 0.5)}
			height={Math.round(size * 0.5)}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<rect width="18" height="18" x="3" y="3" rx="2" />
			<circle cx="9" cy="9" r="2" />
			<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
		</svg>
	</div>
{/if}
