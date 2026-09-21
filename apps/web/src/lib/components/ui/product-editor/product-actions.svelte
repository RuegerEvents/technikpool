<script lang="ts">
	// What can happen to a product as a whole: Duplicate in plain sight, because
	// making the next variant is routine; merging and deleting behind the menu,
	// because they are clean-up and one of them cannot be undone.
	//
	// Used by the editor's own header and by a product's page, which puts it up
	// by the product's name instead.
	import { DropdownMenu } from 'bits-ui';
	import { Ellipsis, Merge, Trash2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import type { ProductEditorActions } from './product-editor.svelte';

	type Props = {
		actions: ProductEditorActions;
		size?: 'sm' | 'default';
		onDuplicate: () => void;
		onMerge: () => void;
		onDelete: () => void;
	};

	let { actions, size = 'default', onDuplicate, onMerge, onDelete }: Props = $props();
</script>

{#if actions.canDuplicate}
	<Button icon="copy" variant="outline" {size} onclick={onDuplicate}>Duplicate</Button>
{/if}
{#if actions.canEdit}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					type="button"
					class="flex items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground {size ===
					'sm'
						? 'size-8'
						: 'size-10'}"
					aria-label="More actions"
				>
					<Ellipsis aria-hidden="true" class="size-4" />
				</button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Portal>
			<DropdownMenu.Content
				align="end"
				sideOffset={4}
				class="z-50 w-64 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
			>
				<DropdownMenu.Item
					onSelect={onMerge}
					class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent data-[highlighted]:bg-accent"
				>
					<Merge aria-hidden="true" class="size-4" />
					Merge duplicate…
				</DropdownMenu.Item>
				<DropdownMenu.Separator class="my-1 h-px bg-border" />
				<!-- Disabled rather than missing, with the reason underneath: a tooltip
				     never opens on a touch screen, and "why can't I" is the one thing
				     worth saying here. -->
				<DropdownMenu.Item
					disabled={!!actions.deleteBlockedReason}
					onSelect={onDelete}
					class="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive transition-colors outline-none hover:bg-destructive/10 data-[disabled]:cursor-default data-[disabled]:hover:bg-transparent data-[highlighted]:bg-destructive/10"
				>
					<Trash2 aria-hidden="true" class="mt-0.5 size-4 shrink-0" />
					<span class="min-w-0">
						<span class="block {actions.deleteBlockedReason ? 'opacity-50' : ''}"
							>Delete product</span
						>
						{#if actions.deleteBlockedReason}
							<span class="block text-xs text-muted-foreground">{actions.deleteBlockedReason}</span>
						{/if}
					</span>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Portal>
	</DropdownMenu.Root>
{/if}
