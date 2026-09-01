<script lang="ts" module>
	export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

	const SIZES: Record<ModalSize, string> = {
		sm: 'max-w-md',
		md: 'max-w-lg',
		lg: 'max-w-xl',
		xl: 'max-w-2xl',
		full: 'max-w-4xl'
	};

	// Modals can stack (a form dialog opened from inside another dialog), and
	// every open instance hears the same window keydown — without this, one
	// Escape would close all of them at once. Only the top of the stack reacts.
	const openStack: symbol[] = [];
</script>

<script lang="ts">
	// The one modal in the app. Every dialog used to repeat the overlay, the
	// Escape handler, the stopPropagation and the pair of svelte-ignore comments
	// it takes to keep the compiler quiet — eight copies, each slightly
	// different, and none of them doing focus or scroll properly.
	//
	// Layout is header / body / footer in a column capped at 90vh, so a short
	// dialog is its natural height and a long one scrolls its body while the
	// title and the buttons stay put. That is the only layout any of the eight
	// needed.
	import type { Snippet } from 'svelte';
	import { tick } from 'svelte';

	type Props = {
		open: boolean;
		title?: string;
		size?: ModalSize;
		/**
		 * Escape and a click on the backdrop close it. Turn off for a dialog in
		 * the middle of something it can't abandon halfway.
		 */
		dismissible?: boolean;
		description?: Snippet;
		/** Extra controls beside the title — a Close button, a step counter. */
		headerActions?: Snippet;
		/** Optional: a confirm dialog is a title, a description and two buttons. */
		children?: Snippet;
		footer?: Snippet;
		onclose?: () => void;
	};

	let {
		open = $bindable(false),
		title,
		size = 'sm',
		dismissible = true,
		description,
		headerActions,
		children,
		footer,
		onclose
	}: Props = $props();

	const titleId = `modal-title-${Math.random().toString(36).slice(2, 9)}`;
	const stackKey = Symbol();

	let panel = $state<HTMLDivElement | null>(null);

	function close() {
		if (!dismissible) return;
		open = false;
		onclose?.();
	}

	// Focus moves into the dialog so Escape and Tab land here rather than on the
	// page behind, and returns to whatever opened it on the way out. The page
	// behind is also frozen: a modal that scrolls the list underneath it loses
	// the reader's place.
	$effect(() => {
		if (!open) return;
		openStack.push(stackKey);
		const previous = document.activeElement as HTMLElement | null;
		const { overflow } = document.body.style;
		document.body.style.overflow = 'hidden';
		tick().then(() => panel?.focus());
		return () => {
			const at = openStack.indexOf(stackKey);
			if (at >= 0) openStack.splice(at, 1);
			document.body.style.overflow = overflow;
			previous?.focus?.();
		};
	});
</script>

<svelte:window
	onkeydown={(e) => {
		if (open && e.key === 'Escape' && openStack[openStack.length - 1] === stackKey) close();
	}}
/>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) close();
		}}
	>
		<div
			bind:this={panel}
			class="flex max-h-[90vh] w-full {SIZES[
				size
			]} flex-col overflow-hidden rounded-lg border bg-background shadow-lg"
			role="dialog"
			aria-modal="true"
			aria-labelledby={title ? titleId : undefined}
			tabindex="-1"
		>
			{#if title || headerActions || description}
				<div class="flex items-start justify-between gap-4 px-6 pt-6">
					<div>
						{#if title}
							<h2 id={titleId} class="text-lg font-semibold">{title}</h2>
						{/if}
						{#if description}
							<p class="mt-1 text-sm text-muted-foreground">{@render description()}</p>
						{/if}
					</div>
					{#if headerActions}
						<div class="flex shrink-0 items-center gap-2">{@render headerActions()}</div>
					{/if}
				</div>
			{/if}

			{#if children}
				<div class="overflow-y-auto px-6 py-5">{@render children()}</div>
			{:else}
				<div class="pb-6"></div>
			{/if}

			{#if footer}
				<div class="flex justify-end gap-3 border-t px-6 py-4">{@render footer()}</div>
			{/if}
		</div>
	</div>
{/if}
