<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		direction,
		align = 'left',
		onclick,
		children
	}: {
		/** Set when the table is currently sorted by this column. */
		direction: 'asc' | 'desc' | null;
		align?: 'left' | 'right';
		onclick: () => void;
		children: Snippet;
	} = $props();
</script>

<th
	class="px-4 py-3 font-medium text-muted-foreground {align === 'right'
		? 'text-right'
		: 'text-left'}"
	aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}
>
	<!-- The arrow sits on the inner side of a right-aligned header, so the label
	     stays flush with the numbers under it. -->
	<button
		type="button"
		{onclick}
		class="group inline-flex items-center gap-1 transition-colors hover:text-foreground {align ===
		'right'
			? 'flex-row-reverse'
			: ''}"
	>
		{@render children()}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="12"
			height="12"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="shrink-0 transition {direction
				? 'text-foreground'
				: 'opacity-0 group-hover:opacity-50'} {direction === 'desc' ? 'rotate-180' : ''}"
		>
			<path d="m18 15-6-6-6 6" />
		</svg>
	</button>
</th>
