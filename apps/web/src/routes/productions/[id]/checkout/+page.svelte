<script lang="ts">
	import { page } from '$app/state';
	import { ContentSkeleton } from '#lib/components/ui/skeleton/index.js';
	import HandoutDetail from '../handout-detail.svelte';

	const productionId = $derived(page.params.id as string);
	// Whose units: a lending org's side, or the default — see HandoutSide.
	const organizationId = $derived(page.url.searchParams.get('org') ?? '');
</script>

<!-- The list is its own heading, so it is awaited next door inside a boundary.
     See CLAUDE.md, "Loading states". -->
{#key `${productionId}|${organizationId}`}
	<svelte:boundary>
		<HandoutDetail {productionId} {organizationId} mode="checkout" />

		{#snippet pending()}
			<ContentSkeleton shape="rows" count={8} />
		{/snippet}
	</svelte:boundary>
{/key}
