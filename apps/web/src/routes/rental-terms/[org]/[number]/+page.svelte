<script lang="ts">
	import { resolve } from '$app/paths';
	import { imageSrc } from '#lib/images.js';

	let { data } = $props();
</script>

<svelte:head><title>{data.orgName} | Rental terms</title></svelte:head>

<div class="mx-auto max-w-3xl space-y-6 px-4 py-10">
	<header class="flex items-start justify-between gap-6">
		<div>
			<p class="text-sm text-muted-foreground">{data.orgName}</p>
			<p class="text-xs text-muted-foreground">Version {data.number} of {data.date}</p>
		</div>
		{#if data.logoPath}
			<img src={imageSrc(data.logoPath)} alt={data.orgName} class="max-h-12 max-w-40" />
		{/if}
	</header>

	{#if data.newerNumber}
		<p
			class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
		>
			{data.orgName} has published newer terms since this version. Documents that link here were issued
			under this one.
			<a
				href={resolve(`rental-terms/${data.orgSlug}/${data.newerNumber}`)}
				class="font-medium underline underline-offset-2">Current version</a
			>
		</p>
	{/if}

	<!-- Rendered by src/lib/server/markdown.ts, which escapes raw HTML and filters links. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	<article class="legal-text">{@html data.html}</article>
</div>
