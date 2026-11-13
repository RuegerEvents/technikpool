<script lang="ts">
	// The kit's inventory list for the lid of its case: a PDF in a new tab, on
	// A4 or A5, as tiles or as a list. The route is a plain URL, so a choice
	// here is also a bookmark (see inventory-list/+server.ts).
	import { DropdownMenu } from 'bits-ui';
	import { resolve } from '$app/paths';
	import { Button } from '#lib/components/ui/button/index.js';

	let { bundleId }: { bundleId: string } = $props();

	const itemClass =
		'flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent data-[highlighted]:bg-accent';

	function open(size: 'a4' | 'a5', layout: 'grid' | 'list') {
		const url = `${resolve(`assets/bundles/${bundleId}/inventory-list`)}?size=${size}&layout=${layout}`;
		window.open(url, '_blank', 'noopener');
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} icon="print" variant="outline">Inventory list</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<DropdownMenu.Content
			align="end"
			sideOffset={4}
			class="z-50 min-w-[200px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
		>
			<DropdownMenu.Item class={itemClass} onSelect={() => open('a4', 'grid')}>
				A4, tiles
			</DropdownMenu.Item>
			<DropdownMenu.Item class={itemClass} onSelect={() => open('a4', 'list')}>
				A4, list
			</DropdownMenu.Item>
			<DropdownMenu.Separator class="my-1 h-px bg-border" />
			<DropdownMenu.Item class={itemClass} onSelect={() => open('a5', 'grid')}>
				A5, tiles
			</DropdownMenu.Item>
			<DropdownMenu.Item class={itemClass} onSelect={() => open('a5', 'list')}>
				A5, list
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>
