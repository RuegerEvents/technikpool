<script lang="ts">
	import { cn } from '$lib/utils';
	import { imageSrc } from '$lib/images';

	type Props = {
		/** The stored object key, not an address — resolved here. See $lib/images. */
		path?: string | null;
		alt?: string;
		/** Edge length in px. 28 is the table default — dense enough to leave row height alone. */
		size?: number;
		/** Fill the parent instead of a fixed square — for the grid view's card image. */
		fill?: boolean;
		class?: string;
	};

	let { path, alt = '', size = 28, fill = false, class: className }: Props = $props();

	let src = $derived(imageSrc(path));
	let box = $derived(fill ? undefined : `width: ${size}px; height: ${size}px;`);
	let boxClass = $derived(fill ? 'h-full w-full' : '');
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
		class={cn('shrink-0 rounded border bg-background object-contain p-px', boxClass, className)}
		style={box}
	/>
{:else}
	<div
		class={cn(
			'flex shrink-0 items-center justify-center rounded border bg-muted/40 text-muted-foreground',
			boxClass,
			className
		)}
		style={box}
		aria-hidden="true"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={fill ? 40 : Math.round(size * 0.5)}
			height={fill ? 40 : Math.round(size * 0.5)}
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
