<script lang="ts">
	import { cn } from '$lib/utils';

	type Props = {
		/** Tailwind sizing for this block — it has no size of its own. */
		class?: string;
	};

	let { class: className }: Props = $props();
</script>

<!--
  One grey block standing in for something that is still loading. Decorative on
  purpose: what is announced is the page's own "loading" line, once, rather than
  a screen reader reading out a dozen nameless boxes.
-->
<div aria-hidden="true" class={cn('animate-pulse rounded-md bg-muted', className)}></div>
