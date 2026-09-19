<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	type Props = {
		label: string;
		/** A lucide icon, drawn in a tile beside the value. */
		icon?: Component<{ class?: string }>;
		/** Small print under the value. */
		hint?: string;
		class?: string;
		children: Snippet;
	};

	let { label, icon: Icon, hint, class: className, children }: Props = $props();
</script>

<!--
  One read-only value on a detail page: the label small above, the value in
  body text. It replaces the disabled inputs those pages used to be built from,
  which looked editable and weren't. Goes inside a <dl>.
-->
<div class={cn('flex min-w-0 gap-3', className)}>
	{#if Icon}
		<div
			class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
		>
			<Icon class="size-4" />
		</div>
	{/if}
	<div class="min-w-0 flex-1">
		<dt class="text-xs text-muted-foreground">{label}</dt>
		<dd class="mt-0.5 text-sm font-medium break-words">{@render children()}</dd>
		{#if hint}
			<p class="mt-1 text-xs text-muted-foreground">{hint}</p>
		{/if}
	</div>
</div>
