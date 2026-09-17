<script lang="ts">
	import { page } from '$app/state';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import BundleDetail from './bundle-detail.svelte';

	const bundleId = $derived(page.params.id as string);
</script>

<!--
  The bundle is one `await` away, and an `await` in a component holds back
  everything that component renders — so it lives next door, inside a boundary
  that puts a skeleton up in the meantime. Keyed on the id because a boundary
  shows its pending snippet when it is created and never again: without it,
  opening a second bundle would sit on the first one until the new one arrived.
  See CLAUDE.md, "Loading states".
-->
{#key bundleId}
	<svelte:boundary>
		<BundleDetail {bundleId} />

		{#snippet pending()}
			<ContentSkeleton shape="form" count={6} />
		{/snippet}
	</svelte:boundary>
{/key}
