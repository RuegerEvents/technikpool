<script lang="ts">
	import { page } from '$app/state';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import StocktakeDetail from './stocktake-detail.svelte';

	const stocktakeId = $derived(page.params.id as string);
</script>

<!--
  The stocktake is its own heading, so it is awaited next door inside a
  boundary — keyed on the id so a second one shows the skeleton again instead
  of the first one's contents. See CLAUDE.md, "Loading states".
-->
{#key stocktakeId}
	<svelte:boundary>
		<StocktakeDetail {stocktakeId} />

		{#snippet pending()}
			<ContentSkeleton shape="table" count={8} />
		{/snippet}
	</svelte:boundary>
{/key}
