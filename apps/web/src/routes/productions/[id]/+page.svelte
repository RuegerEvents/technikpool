<script lang="ts">
	import { page } from '$app/state';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import ProductionDetail from './production-detail.svelte';

	const productionId = $derived(page.params.id as string);
</script>

<!--
  The production is one `await` away, and an `await` in a component holds back
  everything that component renders — so it lives next door, inside a boundary
  that puts a skeleton up in the meantime. Keyed on the id because a boundary
  shows its pending snippet when it is created and never again: without it,
  opening a second production would sit on the first one until the new one arrived.
  See CLAUDE.md, "Loading states".
-->
{#key productionId}
	<svelte:boundary>
		<ProductionDetail {productionId} />

		{#snippet pending()}
			<ContentSkeleton shape="table" count={8} />
		{/snippet}
	</svelte:boundary>
{/key}
