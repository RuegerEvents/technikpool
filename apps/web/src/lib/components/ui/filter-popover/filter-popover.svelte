<script lang="ts">
	import { Popover } from 'bits-ui';
	import type { Snippet } from 'svelte';

	type Props = {
		align?: 'start' | 'end';
		triggerClass?: string;
		contentClass?: string;
		trigger: Snippet;
		children: Snippet;
	};

	let {
		align = 'start',
		triggerClass = 'flex h-8 cursor-pointer items-center gap-1.5 rounded-md border bg-background px-3 text-sm hover:bg-muted',
		contentClass = 'max-h-64 min-w-[200px] overflow-y-auto p-1',
		trigger,
		children
	}: Props = $props();

	let open = $state(false);
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<button {...props} type="button" class={triggerClass}>
				{@render trigger()}
			</button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content
			{align}
			sideOffset={4}
			class="z-50 rounded-md border bg-popover text-popover-foreground shadow-md {contentClass}"
		>
			{@render children()}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
