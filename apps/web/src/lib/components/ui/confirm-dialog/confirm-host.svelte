<script lang="ts">
	// Draws whatever `confirmAction()` is asking. Mounted once, in the root layout.
	import { Button } from '#lib/components/ui/button/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { confirmState } from '#lib/confirm.svelte.js';

	let pending = $derived(confirmState.pending);
</script>

{#if pending}
	<Modal open title={pending.title} onclose={() => pending.answer(false)}>
		{#snippet description()}
			{pending.description ?? ''}
		{/snippet}

		{#snippet footer()}
			<Button
				type="button"
				class={pending.destructive ? 'bg-destructive text-white hover:bg-destructive/90' : ''}
				onclick={() => pending.answer(true)}
			>
				{pending.confirmLabel}
			</Button>
			<Button icon="close" type="button" variant="outline" onclick={() => pending.answer(false)}>
				Cancel
			</Button>
		{/snippet}
	</Modal>
{/if}
