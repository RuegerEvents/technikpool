<script lang="ts">
	// The dot itself. A ring around it, because white tape on a white page and
	// black tape in dark mode would otherwise be no dot at all.
	let { hex, name, size = 'sm' }: { hex: string; name: string; size?: 'sm' | 'md' } = $props();
</script>

<span
	class="inline-block shrink-0 rounded-full ring-1 ring-foreground/25 {size === 'md'
		? 'h-3.5 w-3.5'
		: 'h-2.5 w-2.5'}"
	style:background-color={hex}
	title={name}
	aria-label={name}
	role="img"
></span>
