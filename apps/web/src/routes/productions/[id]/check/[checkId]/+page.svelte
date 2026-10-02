<script lang="ts">
	import { page } from '$app/state';
	import { ContentSkeleton } from '#lib/components/ui/skeleton/index.js';
	import CheckDetail from './check-detail.svelte';

	const checkId = $derived(page.params.checkId as string);
</script>

<!--
  The check is its own heading, so it is awaited next door inside a boundary —
  keyed on the id so a second one shows the skeleton again instead of the first
  one's contents. See CLAUDE.md, "Loading states".
-->
{#key checkId}
	<svelte:boundary>
		<CheckDetail {checkId} />

		{#snippet pending()}
			<ContentSkeleton shape="rows" count={8} />
		{/snippet}
	</svelte:boundary>
{/key}
