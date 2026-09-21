<script lang="ts">
	import { cn } from '$lib/utils';
	import { ProductThumb } from '$lib/components/ui/product-thumb';

	type Item = {
		id: string;
		name: string;
		/** Stored object key. Only rendered when `showImages` is on. */
		imagePath?: string | null;
		/** A short tag shown after the name — IN/OUT on a connector, say. */
		hint?: string | null;
		/** Listed but not choosable: the wrong end of a cable, say. */
		disabled?: boolean;
		/**
		 * A heading drawn above the first item of a run with this group. Items are
		 * shown in the order given, so a caller groups by sorting.
		 */
		group?: string | null;
		/** Greyed but still choosable: an option that is usually not the answer. */
		muted?: boolean;
	};
	type Selection = { id: string | null; name: string };

	type Props = {
		items: Item[];
		value?: Selection | null;
		onchange?: (item: Selection | null) => void;
		oncreate?: (name: string) => void;
		/**
		 * A second, labelled list under the real options — entries that are not a
		 * selection but a shortcut somewhere else. Picking one calls `onselect`
		 * and leaves `value` untouched.
		 *
		 * The accessory picker uses it for the product catalogue: what you want to
		 * attach is very often a thing the pool has none of yet, and the honest
		 * answer to "not in the list" is not always "type its name in" — usually
		 * the product is already known and only the unit is missing.
		 */
		suggestions?: { label: string; items: Item[]; onselect: (item: Item) => void };
		/** For a `<Label for>` — lands on the text input. */
		id?: string;
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
		allowCreate?: boolean;
		/**
		 * Show each option's picture beside its name, and the chosen one's inside
		 * the field. For a list where the name is a part number — a connector is
		 * far quicker to recognise than to read.
		 */
		showImages?: boolean;
		/**
		 * Typing lands on what exists: the best match is highlighted as you type,
		 * and Enter, Tab or leaving the field picks it. Creating takes a click on
		 * "Create" (or arrowing down to it) — except when nothing matches, where
		 * there is nothing else Enter could mean.
		 *
		 * For a closed vocabulary that is nearly always the answer — a connector,
		 * a cable spec — where "schu" is Schuko and not a new connector called
		 * "schu". Off by default: in an open list such as manufacturers, a new
		 * name that merely contains an old one must not be swallowed by it.
		 */
		preferExisting?: boolean;
		class?: string;
	};

	let {
		items,
		value = $bindable(null),
		onchange,
		oncreate,
		suggestions,
		id,
		placeholder = 'Search…',
		required = false,
		disabled = false,
		allowCreate = true,
		showImages = false,
		preferExisting = false,
		class: className
	}: Props = $props();

	let inputValue = $derived(value?.name ?? '');
	// Matched by name, not id: a caller may hold a selection it typed rather than
	// picked, and that still names a real option most of the time.
	let selectedImage = $derived(
		showImages
			? (items.find((i) => i.name.toLowerCase() === (value?.name ?? '').toLowerCase())?.imagePath ??
					null)
			: null
	);
	let open = $state(false);
	let highlightedIndex = $state(-1);
	let containerEl: HTMLDivElement;
	let inputEl: HTMLInputElement;

	let query = $derived(inputValue.toLowerCase().trim());
	const matching = (list: Item[]) =>
		query ? list.filter((i) => i.name.toLowerCase().includes(query)) : list;

	let filtered = $derived(matching(items));
	let selectableFiltered = $derived(filtered.filter((i) => !i.disabled));
	let filteredSuggestions = $derived(suggestions ? matching(suggestions.items) : []);

	// A suggestion counts: if the catalogue already has that exact name, offering
	// to create a second product called the same thing is how duplicates happen.
	let exactMatch = $derived(
		[...items, ...(suggestions?.items ?? [])].some((i) => i.name.toLowerCase() === query)
	);

	let showCreate = $derived(allowCreate && inputValue.trim().length > 0 && !exactMatch);

	type Option =
		| { type: 'item'; item: Item }
		| { type: 'suggestion'; item: Item }
		| { type: 'create'; name: string };

	// Suggestions sit between the real options and "create a new one": a product
	// that already exists is a better answer than naming a second one like it,
	// and naming one from scratch is the last resort it looks like.
	let options = $derived<Option[]>([
		...filtered.map((item) => ({ type: 'item' as const, item })),
		...filteredSuggestions.map((item) => ({ type: 'suggestion' as const, item })),
		...(showCreate ? [{ type: 'create' as const, name: inputValue.trim() }] : [])
	]);

	// The option Enter picks when nothing has been arrowed to: under
	// `preferExisting`, the first enabled item whose name starts with what was
	// typed, else the first that contains it.
	let bestIndex = $derived.by(() => {
		if (!preferExisting || !query) return -1;
		const enabledItem = (o: Option) => o.type === 'item' && !o.item.disabled;
		const prefix = options.findIndex(
			(o) => enabledItem(o) && (o as { item: Item }).item.name.toLowerCase().startsWith(query)
		);
		return prefix >= 0 ? prefix : options.findIndex(enabledItem);
	});
	let activeIndex = $derived(highlightedIndex >= 0 ? highlightedIndex : bestIndex);

	/** Where the suggestion heading goes — the divider is drawn before this row. */
	let firstSuggestionIndex = $derived(options.findIndex((o) => o.type === 'suggestion'));

	function selectOption(opt: Option) {
		// A disabled option is shown for context, not offered — clicking it does
		// nothing rather than silently picking the wrong end.
		if (opt.type !== 'create' && opt.item.disabled) return;
		if (opt.type === 'suggestion') {
			open = false;
			highlightedIndex = -1;
			// Deliberately not written into `value`: this is a shortcut out of the
			// picker, and the caller decides what the form becomes next.
			inputValue = value?.name ?? '';
			suggestions?.onselect(opt.item);
		} else if (opt.type === 'item') {
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
			// No oncreate handler: report the new entry as a selection with no id
			// yet. It has to land in `value` too — a consumer that binds has
			// nothing else to read, and clearing it here loses what was typed.
			value = { id: null, name: opt.name };
			inputValue = opt.name;
			onchange?.(value);
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
			highlightedIndex = nextEnabled(highlightedIndex, 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlightedIndex = nextEnabled(highlightedIndex, -1);
		} else if (e.key.toLowerCase() === 'tab' && preferExisting) {
			// Tab moves on as usual, taking the match along. Never a create.
			if (activeIndex >= 0 && options[activeIndex]?.type === 'item') {
				selectOption(options[activeIndex]);
			}
		} else if (e.key === 'Enter' || (e.key.toLowerCase() === 'tab' && showCreate && oncreate)) {
			e.preventDefault();
			if (activeIndex >= 0 && options[activeIndex]) {
				selectOption(options[activeIndex]);
			} else if (showCreate) {
				selectOption({ type: 'create', name: inputValue.trim() });
			} else if (selectableFiltered.length === 1) {
				selectOption({ type: 'item', item: selectableFiltered[0] });
			}
		} else if (e.key === 'Escape') {
			open = false;
			inputEl?.blur();
		}
	}

	/** The next option arrow keys should land on, stepping over disabled rows. */
	function nextEnabled(from: number, direction: 1 | -1): number {
		let at = from;
		for (;;) {
			at += direction;
			if (at < 0) return -1;
			if (at > options.length - 1) return from;
			const opt = options[at];
			if (opt.type === 'create' || !opt.item.disabled) return at;
		}
	}

	// The list is `fixed`, placed from the field's position on screen, rather
	// than `absolute` under it: inside a Modal the field sits in a scrolling
	// body, and an absolute list was clipped by it — the body scrolled instead,
	// through a window as tall as the field. Fixed escapes any scroll container
	// (none of the ancestors this is used in carries a transform, which would
	// capture it again). It opens upwards when the room below is short.
	const LIST_MAX = 240;
	let placement = $state({ top: 0, left: 0, width: 0, up: false, maxHeight: LIST_MAX });

	function place() {
		if (!inputEl) return;
		const rect = inputEl.getBoundingClientRect();
		const below = window.innerHeight - rect.bottom - 12;
		const above = rect.top - 12;
		const up = below < LIST_MAX && above > below;
		placement = {
			top: up ? rect.top - 4 : rect.bottom + 4,
			left: rect.left,
			width: rect.width,
			up,
			maxHeight: Math.max(96, Math.min(LIST_MAX, up ? above : below))
		};
	}

	$effect(() => {
		if (!open) return;
		place();
		// Capture: a scroll inside any container moves the field too.
		window.addEventListener('scroll', place, true);
		window.addEventListener('resize', place);
		return () => {
			window.removeEventListener('scroll', place, true);
			window.removeEventListener('resize', place);
		};
	});

	let listStyle = $derived(
		`left:${placement.left}px;width:${placement.width}px;top:${placement.top}px;` +
			(placement.up ? 'transform:translateY(-100%);' : '')
	);

	function handleFocus() {
		open = true;
	}

	function handleBlur(e: FocusEvent) {
		// Close if focus moves outside the container
		if (!containerEl?.contains(e.relatedTarget as Node)) {
			// Leaving a half-typed name behind picks what it matches, the same as
			// Enter would.
			const typed = inputValue.trim();
			if (
				preferExisting &&
				typed &&
				typed !== (value?.name ?? '') &&
				options[activeIndex]?.type === 'item'
			) {
				selectOption(options[activeIndex]);
				return;
			}
			open = false;
			highlightedIndex = -1;
			// Reset input to last confirmed value name
			inputValue = value?.name ?? '';
		}
	}
</script>

<div bind:this={containerEl} class={cn('relative', className)}>
	{#if showImages && selectedImage}
		<!-- Sits on top of the field's own left padding rather than in the flow:
		     the input has to stay a plain input for the caret and the keyboard
		     handling to behave. -->
		<span class="pointer-events-none absolute top-1/2 left-2 z-10 -translate-y-1/2">
			<ProductThumb path={selectedImage} size={22} />
		</span>
	{/if}
	<input
		bind:this={inputEl}
		{id}
		bind:value={inputValue}
		oninput={handleInput}
		onkeydown={handleKeydown}
		onfocus={handleFocus}
		onblur={handleBlur}
		{placeholder}
		{required}
		{disabled}
		autocomplete="off"
		class="flex h-10 w-full rounded-md border border-input bg-background py-2 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 {showImages &&
		selectedImage
			? 'pl-9'
			: 'pl-3'}"
	/>

	{#if open && options.length > 0}
		<div
			class="fixed z-50 rounded-md border bg-popover text-popover-foreground shadow-md"
			style={listStyle}
		>
			<ul class="overflow-y-auto py-1" style="max-height:{placement.maxHeight}px">
				{#each options as opt, i (opt.type === 'create' ? `create-${opt.name}` : `${opt.type}-${opt.item.id}`)}
					{@const disabled = opt.type !== 'create' && !!opt.item.disabled}
					{#if opt.type === 'item' && opt.item.group && (i === 0 || options[i - 1].type !== 'item' || (options[i - 1] as { item: Item }).item.group !== opt.item.group)}
						<li
							class="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground {i > 0
								? 'mt-1 border-t'
								: ''}"
							aria-hidden="true"
						>
							{opt.item.group}
						</li>
					{/if}
					{#if i === firstSuggestionIndex && suggestions}
						<li
							class="mt-1 border-t px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground"
							aria-hidden="true"
						>
							{suggestions.label}
						</li>
					{/if}
					<li>
						<!-- svelte-ignore a11y_interactive_supports_focus -->
						<div
							role="option"
							aria-selected={activeIndex === i}
							aria-disabled={disabled}
							onmousedown={(e) => {
								e.preventDefault();
								selectOption(opt);
							}}
							onmouseenter={() => {
								if (!disabled) highlightedIndex = i;
							}}
							class="px-3 py-2 text-sm {disabled
								? 'cursor-not-allowed opacity-45'
								: 'cursor-pointer'} {opt.type === 'item' && opt.item.muted && !disabled
								? 'text-muted-foreground opacity-70'
								: ''} {activeIndex === i && !disabled ? 'bg-accent text-accent-foreground' : ''}"
						>
							{#if opt.type === 'item' || opt.type === 'suggestion'}
								<span class="flex items-center gap-2">
									{#if showImages}
										<ProductThumb path={opt.item.imagePath} alt="" size={22} />
									{/if}
									<span class="min-w-0 truncate">{opt.item.name}</span>
									{#if opt.item.hint}
										<span class="ml-auto shrink-0 font-mono text-xs text-muted-foreground"
											>{opt.item.hint}</span
										>
									{/if}
								</span>
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
			class="fixed z-50 rounded-md border bg-popover text-popover-foreground shadow-md"
			style={listStyle}
		>
			<div class="px-3 py-4 text-center text-sm text-muted-foreground">No results</div>
		</div>
	{/if}
</div>
