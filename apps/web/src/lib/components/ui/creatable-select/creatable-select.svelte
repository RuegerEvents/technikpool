<script lang="ts">
	import { cn } from '$lib/utils';

	type Item = { id: string; name: string };
	type Selection = { id: string | null; name: string };

	type Props = {
		items: Item[];
		value?: Selection | null;
		onchange?: (item: Selection | null) => void;
		oncreate?: (name: string) => void;
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
		allowCreate?: boolean;
		class?: string;
	};

	let {
		items,
		value = $bindable(null),
		onchange,
		oncreate,
		placeholder = 'Search…',
		required = false,
		disabled = false,
		allowCreate = true,
		class: className
	}: Props = $props();

	let inputValue = $derived(value?.name ?? '');
	let open = $state(false);
	let highlightedIndex = $state(-1);
	let containerEl: HTMLDivElement;
	let inputEl: HTMLInputElement;

	let filtered = $derived(
		inputValue.trim()
			? items.filter((i) => i.name.toLowerCase().includes(inputValue.toLowerCase().trim()))
			: items
	);

	let exactMatch = $derived(
		items.some((i) => i.name.toLowerCase() === inputValue.toLowerCase().trim())
	);

	let showCreate = $derived(allowCreate && inputValue.trim().length > 0 && !exactMatch);

	let options = $derived<Array<{ type: 'item'; item: Item } | { type: 'create'; name: string }>>([
		...filtered.map((item) => ({ type: 'item' as const, item })),
		...(showCreate ? [{ type: 'create' as const, name: inputValue.trim() }] : [])
	]);

	function selectOption(opt: (typeof options)[number]) {
		if (opt.type === 'item') {
			value = opt.item;
			inputValue = opt.item.name;
			onchange?.(opt.item);
			open = false;
			highlightedIndex = -1;
		} else if (oncreate) {
			open = false;
			highlightedIndex = -1;
			oncreate(opt.name);
		} else {
			value = null;
			inputValue = opt.name;
			onchange?.({ id: null, name: opt.name });
			open = false;
			highlightedIndex = -1;
		}
	}

	function handleInput() {
		open = true;
		highlightedIndex = -1;
		// If user clears input, clear value
		if (!inputValue.trim()) {
			value = null;
			onchange?.(null);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!open) {
			if (e.key === 'ArrowDown' || e.key === 'Enter') {
				open = true;
				return;
			}
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlightedIndex = Math.min(highlightedIndex + 1, options.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlightedIndex = Math.max(highlightedIndex - 1, -1);
		} else if (e.key === 'Enter' || (e.key.toLowerCase() === 'tab' && showCreate && oncreate)) {
			e.preventDefault();
			if (highlightedIndex >= 0 && options[highlightedIndex]) {
				selectOption(options[highlightedIndex]);
			} else if (showCreate) {
				selectOption({ type: 'create', name: inputValue.trim() });
			} else if (filtered.length === 1) {
				selectOption({ type: 'item', item: filtered[0] });
			}
		} else if (e.key === 'Escape') {
			open = false;
			inputEl?.blur();
		}
	}

	function handleFocus() {
		open = true;
	}

	function handleBlur(e: FocusEvent) {
		// Close if focus moves outside the container
		if (!containerEl?.contains(e.relatedTarget as Node)) {
			open = false;
			highlightedIndex = -1;
			// Reset input to last confirmed value name
			inputValue = value?.name ?? '';
		}
	}
</script>

<div bind:this={containerEl} class={cn('relative', className)}>
	<input
		bind:this={inputEl}
		bind:value={inputValue}
		oninput={handleInput}
		onkeydown={handleKeydown}
		onfocus={handleFocus}
		onblur={handleBlur}
		{placeholder}
		{required}
		{disabled}
		autocomplete="off"
		class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
	/>

	{#if open && options.length > 0}
		<div
			class="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md"
		>
			<ul class="max-h-60 overflow-y-auto py-1">
				{#each options as opt, i (opt.type === 'item' ? opt.item.id : `create-${opt.name}`)}
					<li>
						<!-- svelte-ignore a11y_interactive_supports_focus -->
						<div
							role="option"
							aria-selected={highlightedIndex === i}
							onmousedown={(e) => {
								e.preventDefault();
								selectOption(opt);
							}}
							onmouseenter={() => (highlightedIndex = i)}
							class="cursor-pointer px-3 py-2 text-sm {highlightedIndex === i
								? 'bg-accent text-accent-foreground'
								: ''}"
						>
							{#if opt.type === 'item'}
								{opt.item.name}
							{:else}
								<span class="flex items-center gap-1.5">
									<span class="text-muted-foreground">Create</span>
									<span class="font-medium">"{opt.name}"</span>
								</span>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if open && options.length === 0}
		<div
			class="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md"
		>
			<div class="px-3 py-4 text-center text-sm text-muted-foreground">No results</div>
		</div>
	{/if}
</div>
