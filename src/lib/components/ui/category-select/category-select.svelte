<script lang="ts">
	import { cn } from '$lib/utils';
	import { CategoryPill } from '$lib/components/ui/category-pill';

	type Category = { id: string; name: string; color: string };

	type Props = {
		categories: Category[];
		value?: string;
		allowEmpty?: boolean;
		placeholder?: string;
		allLabel?: string;
		disabled?: boolean;
		id?: string;
		class?: string;
	};

	let {
		categories,
		value = $bindable(''),
		allowEmpty = false,
		placeholder = 'Select a category',
		allLabel = 'All Categories',
		disabled = false,
		id,
		class: className
	}: Props = $props();

	let open = $state(false);
	let rootEl: HTMLDivElement;

	let selected = $derived(categories.find((c) => c.id === value));

	function select(id: string) {
		value = id;
		open = false;
	}

	function toggle() {
		if (disabled) return;
		open = !open;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}

	$effect(() => {
		if (!open) return;

		function onDocMouseDown(e: MouseEvent) {
			if (!rootEl?.contains(e.target as Node)) open = false;
		}

		document.addEventListener('mousedown', onDocMouseDown);
		return () => document.removeEventListener('mousedown', onDocMouseDown);
	});
</script>

<div bind:this={rootEl} class={cn('relative', className)}>
	<button
		type="button"
		{id}
		{disabled}
		onclick={toggle}
		onkeydown={handleKeydown}
		class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
		aria-haspopup="listbox"
		aria-expanded={open}
	>
		{#if allowEmpty && !value}
			<span class="text-sm text-muted-foreground">{allLabel}</span>
		{:else if selected}
			<CategoryPill name={selected.name} color={selected.color} />
		{:else}
			<span class="text-sm text-muted-foreground">{placeholder}</span>
		{/if}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="ml-2 shrink-0 text-muted-foreground"
		>
			<path d="m6 9 6 6 6-6" />
		</svg>
	</button>

	{#if open && !disabled}
		<div
			class="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-background p-1 shadow-sm"
			role="listbox"
		>
			{#if allowEmpty}
				<button
					type="button"
					onclick={() => select('')}
					class="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-muted/60"
				>
					<span class="text-sm">{allLabel}</span>
				</button>
			{/if}
			{#each categories as c (c.id)}
				<button
					type="button"
					onclick={() => select(c.id)}
					class="flex w-full items-center rounded-sm px-2 py-1.5 hover:bg-muted/60"
				>
					<CategoryPill name={c.name} color={c.color} />
				</button>
			{/each}
		</div>
	{/if}
</div>
