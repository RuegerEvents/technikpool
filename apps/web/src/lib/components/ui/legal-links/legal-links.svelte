<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { legalTitle, type LegalLink } from '#lib/legal.svelte.js';
	import { cn } from '#lib/utils.js';

	// The operator's imprint, privacy policy and terms, as far as they are set up
	// (/admin/legal). Renders nothing on an install that has none.
	let { class: className = '' }: { class?: string } = $props();

	let links = $derived((page.data.legalLinks ?? []) as LegalLink[]);
</script>

{#if links.length > 0}
	<nav
		class={cn(
			'flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground',
			className
		)}
	>
		{#each links as link (link.slug)}
			{#if link.external}
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={link.href}
					target="_blank"
					rel="noopener noreferrer"
					class="hover:text-foreground hover:underline">{legalTitle(link.slug)}</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{:else}
				<a href={resolve(`legal/${link.slug}`)} class="hover:text-foreground hover:underline"
					>{legalTitle(link.slug)}</a
				>
			{/if}
		{/each}
	</nav>
{/if}
