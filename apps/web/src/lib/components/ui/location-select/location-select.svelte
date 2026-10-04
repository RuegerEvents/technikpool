<script lang="ts" module>
	export type LocationOption = {
		id: string;
		name: string;
		organizationId: string;
		organization: { name: string; shortName: string | null };
		address?: { city: string } | null;
		/** One of the orgs whose units the user moves — listed first when no owner is given. */
		own?: boolean;
	};
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import { ChevronDown, MapPin, Search, Star } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { cn, getErrorMessage, orgLabel } from '#lib/utils.js';
	import { naturalCompare } from '#lib/sort.js';
	import { getDefaultLocations, setDefaultLocation } from '#lib/remote/assets.remote.js';

	// Picking where a unit is kept. Locations of other orgs are offered too — a
	// friend may store our things — so the list is grouped by org: the units'
	// own org first, then the rest, and it filters as you type. With an owner
	// org, each row has a star: this user's default for that org's new units,
	// which the forms pre-fill (see `defaultLocationFor`).

	type Props = {
		locations: LocationOption[];
		value?: string;
		/** The org whose units are being placed: its locations come first. */
		ownerOrgId?: string;
		/** What is set now, for when it is not in `locations` (a colleague put it there). */
		current?: { id: string; name: string } | null;
		/** Offer "No location" as a choice, for things that may have none. */
		allowNone?: boolean;
		exclude?: string[];
		placeholder?: string;
		id?: string;
		class?: string;
		disabled?: boolean;
		/** `above` in a bar fixed to the bottom of the screen, where below is off it. */
		placement?: 'below' | 'above';
		size?: 'default' | 'sm';
		/** Offer the star. Needs `ownerOrgId`, whose default it sets. */
		starrable?: boolean;
		onchange?: (value: string) => void;
	};

	let {
		locations,
		value = $bindable(''),
		ownerOrgId,
		current = null,
		allowNone = false,
		exclude = [],
		placeholder = 'Select a location…',
		id,
		class: className,
		disabled = false,
		placement = 'below',
		size = 'default',
		starrable = true,
		onchange
	}: Props = $props();

	let canStar = $derived(starrable && !!ownerOrgId);
	let defaultsQuery = $derived(canStar ? getDefaultLocations() : null);
	let starredId = $derived(ownerOrgId ? (defaultsQuery?.current?.[ownerOrgId] ?? null) : null);
	let starring = $state(false);

	async function toggleStar(l: LocationOption) {
		if (!ownerOrgId || starring) return;
		starring = true;
		try {
			await setDefaultLocation({
				organizationId: ownerOrgId,
				locationId: starredId === l.id ? null : l.id
			});
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			starring = false;
		}
	}

	let open = $state(false);
	let query = $state('');
	let active = $state(0);
	let rootEl: HTMLDivElement;
	let searchEl = $state<HTMLInputElement | null>(null);
	let listEl = $state<HTMLDivElement | null>(null);

	let selectedOption = $derived(locations.find((l) => l.id === value));
	let selected = $derived(selectedOption ?? (current && current.id === value ? current : null));
	// Another org's location says whose it is, so a friend's shelf is not mistaken for ours.
	let selectedOrg = $derived(
		selectedOption && selectedOption.organizationId !== ownerOrgId && !isFirst(selectedOption)
			? orgLabel(selectedOption.organization)
			: null
	);

	function isFirst(l: LocationOption) {
		return ownerOrgId ? l.organizationId === ownerOrgId : !!l.own;
	}

	let sections = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const matches = locations.filter(
			(l) =>
				!exclude.includes(l.id) &&
				(!q ||
					l.name.toLowerCase().includes(q) ||
					orgLabel(l.organization).toLowerCase().includes(q) ||
					l.organization.name.toLowerCase().includes(q) ||
					(l.address?.city ?? '').toLowerCase().includes(q))
		);
		const orgIds = [...new Set(matches.map((l) => l.organizationId))];
		return orgIds
			.map((orgId) => {
				const items = matches.filter((l) => l.organizationId === orgId);
				return {
					orgId,
					label: orgLabel(items[0].organization),
					first: isFirst(items[0]),
					// The starred one heads its section: it is the one usually wanted.
					items: items.sort(
						(a, b) =>
							Number(b.id === starredId) - Number(a.id === starredId) ||
							naturalCompare(a.name, b.name)
					)
				};
			})
			.sort((a, b) =>
				a.first !== b.first ? (a.first ? -1 : 1) : naturalCompare(a.label, b.label)
			);
	});

	let showNone = $derived(allowNone && !query.trim());
	// "No location" is index 0 when offered, so the keyboard reaches it first.
	let flat = $derived<(LocationOption | null)[]>([
		...(showNone ? [null] : []),
		...sections.flatMap((s) => s.items)
	]);

	async function toggle() {
		if (disabled) return;
		open = !open;
		if (open) {
			query = '';
			active = Math.max(
				0,
				flat.findIndex((l) => (l?.id ?? '') === value)
			);
			await tick();
			searchEl?.focus();
		}
	}

	function choose(l: LocationOption | null) {
		value = l?.id ?? '';
		open = false;
		onchange?.(value);
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
			if (active < flat.length) choose(flat[active]);
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
		{disabled}
		onclick={toggle}
		class="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 {size ===
		'sm'
			? 'h-9'
			: 'h-10'}"
		aria-haspopup="listbox"
		aria-expanded={open}
	>
		{#if selected}
			<span class="flex min-w-0 items-center gap-2">
				<MapPin aria-hidden="true" class="size-3.5 shrink-0 text-muted-foreground" />
				<span class="truncate">{selected.name}</span>
				{#if canStar && selected.id === starredId}
					<Star aria-label="Your default" class="size-3 shrink-0 fill-amber-400 text-amber-500" />
				{/if}
				{#if selectedOrg}
					<span class="truncate text-xs text-muted-foreground">{selectedOrg}</span>
				{/if}
			</span>
		{:else if allowNone && !value}
			<span class="text-muted-foreground">No location</span>
		{:else}
			<span class="text-muted-foreground">{placeholder}</span>
		{/if}
		<ChevronDown aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" />
	</button>

	{#if open}
		<div
			class="absolute z-50 w-full min-w-64 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md {placement ===
			'above'
				? 'bottom-full mb-1'
				: 'mt-1'}"
		>
			<div class="flex items-center gap-2 border-b px-3">
				<Search aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" />
				<input
					bind:this={searchEl}
					bind:value={query}
					onkeydown={handleKeydown}
					placeholder="Search locations…"
					aria-label="Search locations"
					class="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
				/>
			</div>
			<div bind:this={listEl} class="max-h-80 overflow-y-auto p-1" role="listbox">
				{#if showNone}
					<button
						type="button"
						role="option"
						aria-selected={!value}
						data-active={active === 0}
						onclick={() => choose(null)}
						onmousemove={() => (active = 0)}
						class="flex w-full rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground {active ===
						0
							? 'bg-accent text-accent-foreground'
							: ''}">No location</button
					>
				{/if}
				{#if sections.length === 0}
					<p class="px-2 py-6 text-center text-sm text-muted-foreground">No locations found.</p>
				{/if}
				{#each sections as section (section.orgId)}
					{#if sections.length > 1 || !section.first}
						<p
							class="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
						>
							{section.label}
						</p>
					{/if}
					{#each section.items as l (l.id)}
						{@const index = flat.indexOf(l)}
						{@const starred = l.id === starredId}
						<div
							role="option"
							aria-selected={l.id === value}
							data-active={index === active}
							tabindex="-1"
							onmousemove={() => (active = index)}
							class="flex w-full items-center rounded-sm {index === active
								? 'bg-accent text-accent-foreground'
								: ''}"
						>
							<button
								type="button"
								tabindex="-1"
								onclick={() => choose(l)}
								class="flex min-w-0 flex-1 items-center gap-3 px-2 py-1.5 text-left {l.id === value
									? 'font-medium'
									: ''}"
							>
								<span class="min-w-0 flex-1 truncate text-sm">{l.name}</span>
								{#if l.address?.city}
									<span class="shrink-0 text-xs text-muted-foreground">{l.address.city}</span>
								{/if}
							</button>
							{#if canStar}
								<button
									type="button"
									tabindex="-1"
									onclick={() => toggleStar(l)}
									disabled={starring}
									title={starred ? 'Your default — click to clear' : 'Make this your default'}
									aria-pressed={starred}
									class="mr-1 rounded p-1 transition-colors hover:bg-muted {starred
										? 'text-amber-500'
										: 'text-muted-foreground/40 hover:text-muted-foreground'}"
								>
									<Star aria-hidden="true" class="size-3.5 {starred ? 'fill-amber-400' : ''}" />
								</button>
							{/if}
						</div>
					{/each}
				{/each}
			</div>
		</div>
	{/if}
</div>
