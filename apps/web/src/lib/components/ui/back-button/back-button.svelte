<script lang="ts">
	import { page } from '$app/state';
	import { backDelta } from '#lib/back-navigation.js';
	import { Button, type ButtonProps } from '#lib/components/ui/button/index.js';

	// Goes back to wherever the user came from; `fallback` is for when they did
	// not come from inside the app. `scope` is the record this page belongs to,
	// so its own sub-pages are skipped — defaults to the current path.
	let {
		fallback,
		scope = undefined,
		children,
		...restProps
	}: ButtonProps & { fallback: string; scope?: string } = $props();

	function onclick(event: MouseEvent) {
		// A modified click means "open the list in a new tab", which the link does.
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
		const delta = backDelta(scope ?? page.url.pathname);
		if (delta === null) return;
		event.preventDefault();
		history.go(delta);
	}
</script>

<Button icon="back" variant="outline" {...restProps} href={fallback} {onclick}>
	{#if children}{@render children()}{:else}Back{/if}
</Button>
