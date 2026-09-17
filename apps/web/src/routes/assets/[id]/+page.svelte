<script lang="ts">
	import { page } from '$app/state';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import AssetDetail from './asset-detail.svelte';

	const assetId = $derived(page.params.id as string);
</script>

<!--
  The unit is one `await` away, and an `await` in a component holds back
  everything that component renders — so it lives next door, inside a boundary
  that puts a skeleton up in the meantime. Keyed on the id because a boundary
  shows its pending snippet when it is created and never again: without it,
  opening a second unit would sit on the first one until the new one arrived.
  See CLAUDE.md, "Loading states".
-->
{#key assetId}
	<svelte:boundary>
		<AssetDetail {assetId} />

		{#snippet pending()}
			<ContentSkeleton shape="form" count={6} />
		{/snippet}
	</svelte:boundary>
{/key}
