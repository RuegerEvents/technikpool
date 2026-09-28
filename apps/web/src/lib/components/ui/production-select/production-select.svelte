<script lang="ts" module>
	export type ProductionOption = {
		id: string;
		name: string;
		startDate: Date | null;
		endDate: Date | null;
		organization: { name: string; shortName: string | null };
		/** `lender`: only the user's own units go to it — shown as a hint. */
		checkoutRole?: 'production' | 'lender' | null;
	};
</script>

<script lang="ts">
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import { ChevronDown, Search } from '@lucide/svelte';
	import { cn, orgLabel, plural } from '$lib/utils';
	import { naturalCompare } from '$lib/sort';

	// Picking a production to scan to. A native select could show one line of
	// text per production, which is not enough to tell this week's job from
	// last year's of the same name: this one shows when it runs, sorts running
	// ones first and past ones last, and filters as you type.

	type Props = {
		productions: ProductionOption[];
		value?: string;
		placeholder?: string;
		id?: string;
		class?: string;
	};

	let {
		productions,
		value = $bindable(''),
		placeholder = 'Select a production…',
		id,
		class: className
	}: Props = $props();

	/** Past productions shown without a search — the rest are one keystroke away. */
	const PAST_LIMIT = 8;

	let open = $state(false);
	let query = $state('');
	let active = $state(0);
	let rootEl: HTMLDivElement;
	let searchEl = $state<HTMLInputElement | null>(null);
	let listEl = $state<HTMLDivElement | null>(null);

	let selected = $derived(productions.find((p) => p.id === value));

	// Calendar days, not 24-hour spans: something at 9:00 tomorrow is
	// "tomorrow" all of today.
	function dayNumber(d: Date) {
		const x = new Date(d);
		return Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86_400_000;
	}

	type Phase = 'running' | 'upcoming' | 'past';

	function phaseOf(p: ProductionOption): Phase {
		const today = dayNumber(new Date());
		if (!p.startDate) return 'upcoming';
		const start = dayNumber(p.startDate);
		const end = p.endDate ? dayNumber(p.endDate) : start;
		if (end < today) return 'past';
		if (start > today) return 'upcoming';
		return 'running';
	}

	let sections = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const matches = productions.filter(
			(p) =>
				!q ||
				p.name.toLowerCase().includes(q) ||
				orgLabel(p.organization).toLowerCase().includes(q) ||
				p.organization.name.toLowerCase().includes(q)
		);
		const time = (d: Date | null) => (d ? new Date(d).getTime() : Infinity);
		const running = matches
			.filter((p) => phaseOf(p) === 'running')
			.sort((a, b) => time(a.endDate) - time(b.endDate) || naturalCompare(a.name, b.name));
		const upcoming = matches
			.filter((p) => phaseOf(p) === 'upcoming')
			.sort((a, b) => time(a.startDate) - time(b.startDate) || naturalCompare(a.name, b.name));
		const allPast = matches
			.filter((p) => phaseOf(p) === 'past')
			.sort((a, b) => time(b.endDate) - time(a.endDate));
		const past = q ? allPast : allPast.slice(0, PAST_LIMIT);
		return [
			{ phase: 'running' as const, items: running, hidden: 0 },
			{ phase: 'upcoming' as const, items: upcoming, hidden: 0 },
			{ phase: 'past' as const, items: past, hidden: allPast.length - past.length }
		].filter((s) => s.items.length > 0);
	});

	let flat = $derived(sections.flatMap((s) => s.items));

	function dateLocale() {
		return page.data.locale === 'en' ? 'en-GB' : 'de-DE';
	}

	function formatRange(p: ProductionOption) {
		if (!p.startDate) return null;
		const fmt = (d: Date) =>
			new Date(d).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });
		const start = fmt(p.startDate);
		const end = p.endDate ? fmt(p.endDate) : null;
		return end && end !== start ? `${start} – ${end}` : start;
	}

	function relative(p: ProductionOption) {
		const today = dayNumber(new Date());
		switch (phaseOf(p)) {
			case 'running':
				return 'Running now';
			case 'upcoming': {
				if (!p.startDate) return 'No date';
				const days = dayNumber(p.startDate) - today;
				if (days === 1) return 'Tomorrow';
				return plural(days, ['In # day', 'In # days']);
			}
			case 'past': {
				const days = today - dayNumber(p.endDate ?? p.startDate!);
				if (days === 1) return 'Yesterday';
				return plural(days, ['# day ago', '# days ago']);
			}
		}
	}

	async function toggle() {
		open = !open;
		if (open) {
			query = '';
			active = Math.max(
				0,
				flat.findIndex((p) => p.id === value)
			);
			await tick();
			searchEl?.focus();
		}
	}

	function choose(p: ProductionOption) {
		value = p.id;
		open = false;
	}

	async function scrollActive() {
		await tick();
		listEl?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = Math.min(flat.length - 1, active + 1);
			scrollActive();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = Math.max(0, active - 1);
			scrollActive();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (flat[active]) choose(flat[active]);
		}
	}

	$effect(() => {
		// A new search starts at the top of what it found.
		void query;
		active = 0;
	});

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
		onclick={toggle}
		class="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-left text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
		aria-haspopup="listbox"
		aria-expanded={open}
	>
		{#if selected}
			<span class="min-w-0">
				<span class="block truncate font-medium">{selected.name}</span>
				<span class="block truncate text-xs text-muted-foreground">
					{[orgLabel(selected.organization), formatRange(selected)].filter(Boolean).join(' · ')}
				</span>
			</span>
		{:else}
			<span class="text-muted-foreground">{placeholder}</span>
		{/if}
		<ChevronDown aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" />
	</button>

	{#if open}
		<div
			class="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
		>
			<div class="flex items-center gap-2 border-b px-3">
				<Search aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" />
				<input
					bind:this={searchEl}
					bind:value={query}
					onkeydown={handleKeydown}
					placeholder="Search productions…"
					aria-label="Search productions"
					class="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
				/>
			</div>
			<div bind:this={listEl} class="max-h-80 overflow-y-auto p-1" role="listbox">
				{#if flat.length === 0}
					<p class="px-2 py-6 text-center text-sm text-muted-foreground">No productions found.</p>
				{/if}
				{#each sections as section (section.phase)}
					<p
						class="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
					>
						{#if section.phase === 'running'}
							Running
						{:else if section.phase === 'upcoming'}
							Upcoming
						{:else}
							Past
						{/if}
					</p>
					{#each section.items as p (p.id)}
						{@const index = flat.indexOf(p)}
						{@const range = formatRange(p)}
						<button
							type="button"
							role="option"
							aria-selected={p.id === value}
							data-active={index === active}
							onclick={() => choose(p)}
							onmousemove={() => (active = index)}
							class="flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left {index ===
							active
								? 'bg-accent text-accent-foreground'
								: ''} {p.id === value ? 'font-medium' : ''}"
						>
							<span class="min-w-0 flex-1">
								<span class="flex items-center gap-2">
									<span class="truncate text-sm">{p.name}</span>
									{#if p.checkoutRole === 'lender'}
										<span
											class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
											>Your units only</span
										>
									{/if}
								</span>
								<span class="block truncate text-xs text-muted-foreground">
									{[orgLabel(p.organization), range].filter(Boolean).join(' · ')}
								</span>
							</span>
							<span
								class="shrink-0 text-xs {section.phase === 'running'
									? 'font-medium text-emerald-600 dark:text-emerald-400'
									: 'text-muted-foreground'}">{relative(p)}</span
							>
						</button>
					{/each}
					{#if section.hidden > 0}
						<p class="px-2 py-1 text-xs text-muted-foreground">
							{plural(section.hidden, [
								'1 older one — search to find it',
								'# older ones — search to find them'
							])}
						</p>
					{/if}
				{/each}
			</div>
		</div>
	{/if}
</div>
