<!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->
<script lang="ts" generics="T extends Record<string, any>">
	import type { Snippet } from 'svelte';
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import type { Column } from './types';

	// DataView accepts dynamic routes from callers; cast to satisfy resolve()'s strict route union.
	function resolveHref(href: string): string {
		// @ts-expect-error — caller-provided href is a valid app route
		return resolve(href);
	}

	type Props = {
		rows: T[];
		columns: Column<T>[];
		/** Return true if row matches the search query */
		searchFn?: (row: T, query: string) => boolean;
		searchPlaceholder?: string;
		/** Makes rows clickable; return the href for a row */
		href?: (row: T) => string;
		/** localStorage key to persist view mode */
		storageKey?: string;
		defaultView?: 'table' | 'cards';
		/** Required for card view — renders one card */
		card: Snippet<[T]>;
		/** Optional — custom cell renderer; receives (row, columnKey) */
		cell?: Snippet<[T, string]>;
		/** Optional — extra classes applied to each card wrapper and table row */
		rowClass?: (row: T) => string;
		emptyTitle?: string;
		emptyDescription?: string;
		addHref?: string;
		addLabel?: string;
	};

	let {
		rows,
		columns,
		searchFn,
		searchPlaceholder = 'Search…',
		href,
		storageKey,
		defaultView = 'table',
		card,
		cell,
		rowClass,
		emptyTitle = 'Nothing here yet',
		emptyDescription,
		addHref,
		addLabel = 'Add'
	}: Props = $props();

	let search = $state('');
	let sortKey = $state<string | null>(null);
	let sortDir = $state<'asc' | 'desc'>('asc');

	let viewMode = $state<'table' | 'cards'>(
		untrack(() =>
			browser && storageKey
				? ((localStorage.getItem(storageKey) as 'table' | 'cards') ?? defaultView)
				: defaultView
		)
	);

	$effect(() => {
		const key = storageKey;
		if (browser && key) localStorage.setItem(key, viewMode);
	});

	function toggleSort(key: string) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = 'asc';
		}
	}

	let displayed = $derived.by(() => {
		let result = rows;

		if (search.trim() && searchFn) {
			const q = search.trim().toLowerCase();
			result = result.filter((r) => searchFn(r, q));
		}

		if (sortKey) {
			const col = columns.find((c) => c.key === sortKey);
			const get = col?.accessor ?? ((r: T) => r[sortKey!]);
			result = [...result].sort((a, b) => {
				const av = get(a);
				const bv = get(b);
				if (av == null && bv == null) return 0;
				if (av == null) return sortDir === 'asc' ? 1 : -1;
				if (bv == null) return sortDir === 'asc' ? -1 : 1;
				if (typeof av === 'string' && typeof bv === 'string') {
					return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
				}
				return sortDir === 'asc'
					? (av as number) - (bv as number)
					: (bv as number) - (av as number);
			});
		}

		return result;
	});

	function defaultCell(row: T, key: string): string {
		const col = columns.find((c) => c.key === key);
		const val = col?.accessor ? col.accessor(row) : row[key];
		return val == null ? '—' : String(val);
	}
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<div class="space-y-4">
	<!-- Toolbar -->
	<div class="flex flex-wrap items-center gap-2">
		{#if searchFn}
			<input
				type="search"
				bind:value={search}
				placeholder={searchPlaceholder}
				class="h-9 max-w-sm min-w-48 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
			/>
		{/if}
		<div class="ml-auto flex items-center gap-2">
			<!-- View toggle -->
			<div class="flex overflow-hidden rounded-md border border-input">
				<button
					type="button"
					onclick={() => (viewMode = 'cards')}
					title="Card view"
					class="flex h-9 w-9 items-center justify-center transition-colors {viewMode === 'cards'
						? 'bg-primary text-primary-foreground'
						: 'bg-background text-muted-foreground hover:bg-muted'}"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
						<rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
					</svg>
				</button>
				<button
					type="button"
					onclick={() => (viewMode = 'table')}
					title="Table view"
					class="flex h-9 w-9 items-center justify-center transition-colors {viewMode === 'table'
						? 'bg-primary text-primary-foreground'
						: 'bg-background text-muted-foreground hover:bg-muted'}"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
					</svg>
				</button>
			</div>

			{#if addHref}
				<a
					href={resolveHref(addHref)}
					class="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
					</svg>
					{addLabel}
				</a>
			{/if}
		</div>
	</div>

	{#if displayed.length === 0}
		<div class="rounded-lg border bg-card px-6 py-12 text-center">
			<p class="text-base font-medium">{emptyTitle}</p>
			{#if emptyDescription}
				<p class="mt-1 text-sm text-muted-foreground">{emptyDescription}</p>
			{/if}
			{#if addHref}
				<a
					href={resolveHref(addHref)}
					class="mt-4 inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent"
				>
					{addLabel}
				</a>
			{/if}
		</div>
	{:else if viewMode === 'cards'}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{#each displayed as row (row['id'])}
				{#if href}
					<a href={resolveHref(href(row))} class="group block h-full {rowClass?.(row) ?? ''}">
						{@render card(row)}
					</a>
				{:else}
					<div class={rowClass?.(row) ?? ''}>
						{@render card(row)}
					</div>
				{/if}
			{/each}
		</div>
	{:else}
		<div class="overflow-x-auto rounded-lg border bg-card">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b text-left">
						{#each columns as col (col.key)}
							<th
								class="px-4 py-3 font-medium whitespace-nowrap text-muted-foreground {col.headerClass ??
									''} {col.sortable ? 'cursor-pointer select-none hover:text-foreground' : ''}"
								onclick={col.sortable ? () => toggleSort(col.key) : undefined}
							>
								<span class="inline-flex items-center gap-1">
									{col.label}
									{#if col.sortable}
										<span class="text-xs opacity-40">
											{#if sortKey === col.key}
												{sortDir === 'asc' ? '↑' : '↓'}
											{:else}
												↕
											{/if}
										</span>
									{/if}
								</span>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each displayed as row (row['id'])}
						{#if href}
							<tr
								class="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/50 {rowClass?.(
									row
								) ?? ''}"
								onclick={() => goto(resolveHref(href!(row)))}
							>
								{#each columns as col (col.key)}
									<td class="px-4 py-3 {col.class ?? ''}">
										{#if cell}
											{@render cell(row, col.key)}
										{:else}
											{defaultCell(row, col.key)}
										{/if}
									</td>
								{/each}
							</tr>
						{:else}
							<tr class="border-b last:border-0 {rowClass?.(row) ?? ''}">
								{#each columns as col (col.key)}
									<td class="px-4 py-3 {col.class ?? ''}">
										{#if cell}
											{@render cell(row, col.key)}
										{:else}
											{defaultCell(row, col.key)}
										{/if}
									</td>
								{/each}
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if search && displayed.length === 0 && rows.length > 0}
		<p class="text-center text-sm text-muted-foreground">No results for "{search}"</p>
	{/if}
</div>
