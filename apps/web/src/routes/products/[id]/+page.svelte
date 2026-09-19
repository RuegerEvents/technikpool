<script lang="ts">
	import { page } from '$app/state';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import ProductDetail from './product-detail.svelte';

	let { data } = $props();

	const productId = $derived(page.params.id as string);
</script>

<!--
  The product is one `await` away, so it lives next door inside a boundary —
  keyed on the id, because a boundary shows its pending snippet only when it is
  created. See CLAUDE.md, "Loading states", and the asset page beside this one.
-->
{#key productId}
	<svelte:boundary>
		<ProductDetail {productId} isAdmin={data.isAdmin} userId={data.user?.id} />

		{#snippet pending()}
			<ContentSkeleton shape="form" count={6} />
		{/snippet}
	</svelte:boundary>
{/key}
