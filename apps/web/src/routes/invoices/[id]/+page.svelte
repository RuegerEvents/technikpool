<script lang="ts">
	import { page } from '$app/state';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import InvoiceDetail from './invoice-detail.svelte';

	const invoiceId = $derived(page.params.id as string);
</script>

<!--
  The invoice itself is one `await` away, and an `await` in a component holds
  back everything that component renders — so it lives next door, inside a
  boundary that puts a skeleton up in the meantime. Keyed on the id because a
  boundary shows its pending snippet when it is created and never again: without
  it, opening a second invoice would sit on the first one until the new one
  arrived. See CLAUDE.md, "Loading states".
-->
{#key invoiceId}
	<svelte:boundary>
		<InvoiceDetail {invoiceId} />

		{#snippet pending()}
			<ContentSkeleton shape="form" count={6} />
		{/snippet}
	</svelte:boundary>
{/key}
