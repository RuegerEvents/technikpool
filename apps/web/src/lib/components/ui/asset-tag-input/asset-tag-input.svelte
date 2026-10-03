<script lang="ts">
	import { Popover } from 'bits-ui';
	import { WandSparkles } from '@lucide/svelte';
	import { Input } from '#lib/components/ui/input/index.js';
	import { cn } from '#lib/utils.js';

	// An asset tag field that, left blank, shows the number the org will give
	// the unit — in the field itself, as if it were already typed, with a wand
	// that explains where it came from. It stays a placeholder underneath: typing or
	// scanning replaces it, and a blank field is still what is submitted.

	type Props = {
		value: string;
		id?: string;
		disabled?: boolean;
		placeholder?: string;
		class?: string;
		/** The tag this row will get if left blank, from `previewAutoTags`; null where nothing numbers it. */
		auto: string | null;
	};

	let { value = $bindable(), auto, id, disabled, placeholder, class: className }: Props = $props();

	let showsAuto = $derived(auto !== null && !value.trim());
</script>

<div class="relative w-full">
	<Input
		bind:value
		placeholder={auto ?? placeholder}
		class={cn('font-mono', auto && 'pr-8 placeholder:text-foreground', className)}
		{id}
		{disabled}
	/>
	{#if showsAuto}
		<!-- A button, not a hover title: a tap has to open it on a phone too. -->
		<Popover.Root>
			<Popover.Trigger
				type="button"
				aria-label="Numbered automatically"
				class="absolute inset-y-0 right-1 my-auto flex size-7 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			>
				<WandSparkles class="size-4" aria-hidden="true" />
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Content
					side="top"
					align="end"
					sideOffset={6}
					class="z-50 w-72 space-y-1.5 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-md"
				>
					<p class="flex items-center gap-1.5 font-medium">
						<WandSparkles class="size-4" aria-hidden="true" />
						Numbered automatically
					</p>
					<p class="text-muted-foreground">
						Left blank, this unit gets <span class="font-mono text-foreground">{auto}</span>, the
						organisation's next free number. It is assigned when you save, so if someone else
						registers units in the meantime it moves up.
					</p>
					<p class="text-muted-foreground">
						Type or scan to use a different tag instead — a sticker that is already on the unit, for
						example.
					</p>
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	{/if}
</div>
