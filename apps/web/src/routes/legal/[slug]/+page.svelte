<script lang="ts">
	import { legalTitle } from '$lib/legal.svelte';

	let { data } = $props();
	let title = $derived(legalTitle(data.slug));
</script>

<svelte:head><title>{title} | Technikpool</title></svelte:head>

<article class="mx-auto max-w-3xl space-y-6">
	<h1 class="text-3xl font-bold tracking-tight">{title}</h1>
	<!-- Rendered by src/lib/server/markdown.ts, which escapes raw HTML and filters links. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	<div class="legal-text">{@html data.html}</div>
	<p class="text-xs text-muted-foreground">
		Last updated {new Date(data.updatedAt).toLocaleDateString()}
	</p>
</article>
