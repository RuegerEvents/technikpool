<script lang="ts">
	import { getErrorMessage, plural, orgLabel } from '$lib/utils';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { OrgBadge } from '$lib/components/ui/org-badge';
	import { FilterPopover } from '$lib/components/ui/filter-popover';
	import { getEquipmentEditorData, setProductionQuantity } from '$lib/remote/equipment.remote';
	import {
		addBundleToProduction,
		removeBundleFromProduction
	} from '$lib/remote/productions.remote';
	import { toast } from 'svelte-sonner';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';

	const productionId = $derived(page.params.id as string);
	let data = $derived(await getEquipmentEditorData(productionId));

	type Group = (typeof data)['groups'][number];
	type Bundle = (typeof data)['bundles'][number];

	// One picker row per bundle type, holding that type's physical instances.
	type BundleTemplateRow = {
		templateId: string;
		name: string;
		categoryId: string;
		categoryColor: string;
		organizationName: string;
		instances: Bundle[];
		/** Instances with assets booked into this production */
		booked: Bundle[];
		/** Instances that could still be added */
		addable: Bundle[];
	};

	let activeCat = $state<string | null>(null);
	let search = $state('');
	let selectedOrgs = $state(new SvelteSet<string>());
	let locMode = $state<'locations' | 'city'>('locations');
	let selectedLocs = $state(new SvelteSet<string>());
	let selectedCities = $state(new SvelteSet<string>());
	let showBundledItems = $state(false);

	let categories = $derived.by(() => {
		const seen = new SvelteMap<
			string,
			{ id: string; name: string; color: string; sortOrder: number }
		>();
		for (const g of data.groups) {
			if (!seen.has(g.categoryId)) {
				seen.set(g.categoryId, {
					id: g.categoryId,
					name: g.categoryName,
					color: g.categoryColor,
					sortOrder: g.categorySortOrder
				});
			}
		}
		for (const b of data.bundles) {
			if (!seen.has(b.categoryId)) {
				seen.set(b.categoryId, {
					id: b.categoryId,
					name: b.categoryName,
					color: b.categoryColor,
					sortOrder: b.categorySortOrder
				});
			}
		}
		return [...seen.values()].sort(
			(a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
		);
	});

	let orgs = $derived.by(() => {
		const seen = new SvelteMap<
			string,
			{ id: string; name: string; color: string; avatarLabel: string }
		>();
		for (const g of data.groups) {
			if (!seen.has(g.organizationId)) {
				seen.set(g.organizationId, {
					id: g.organizationId,
					name: g.organizationName,
					color: g.organizationColor,
					avatarLabel: g.organizationAvatarLabel
				});
			}
		}
		for (const b of data.bundles) {
			if (!seen.has(b.organizationId)) {
				seen.set(b.organizationId, {
					id: b.organizationId,
					name: b.organizationName,
					color: b.organizationColor,
					avatarLabel: b.organizationAvatarLabel
				});
			}
		}
		return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
	});

	let locations = $derived.by(() => {
		const seen = new SvelteMap<string, { id: string; name: string; city: string }>();
		for (const g of data.groups) {
			if (!seen.has(g.locationId)) {
				seen.set(g.locationId, { id: g.locationId, name: g.locationName, city: g.city });
			}
		}
		for (const b of data.bundles) {
			if (b.locationId && b.city && !seen.has(b.locationId)) {
				seen.set(b.locationId, { id: b.locationId, name: b.locationName ?? '', city: b.city });
			}
		}
		return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
	});

	let cities = $derived([...new SvelteSet(locations.map((l) => l.city))].sort());

	function groupAvailable(g: Group): number {
		const remaining = g.total - g.bookedHere - g.unavailableElsewhere;
		return Math.max(0, showBundledItems ? remaining : remaining - g.bundledAvailable);
	}

	function groupMaxQty(g: Group): number {
		return Math.max(
			g.bookedHere,
			g.total - g.unavailableElsewhere - (showBundledItems ? 0 : g.bundledAvailable)
		);
	}

	function matchesFiltersExceptCategory(g: Group): boolean {
		const q = search.toLowerCase().trim();
		if (
			q &&
			!(g.productName.toLowerCase().includes(q) || g.manufacturerName.toLowerCase().includes(q))
		)
			return false;
		if (selectedOrgs.size > 0 && !selectedOrgs.has(g.organizationId)) return false;
		if (locMode === 'locations') {
			if (selectedLocs.size > 0 && !selectedLocs.has(g.locationId)) return false;
		} else {
			if (selectedCities.size > 0 && !selectedCities.has(g.city)) return false;
		}
		return true;
	}
	function matchesFilters(g: Group): boolean {
		if (activeCat && g.categoryId !== activeCat) return false;
		return matchesFiltersExceptCategory(g);
	}

	function matchesBundleFiltersExceptCategory(b: Bundle): boolean {
		const q = search.toLowerCase().trim();
		if (q && !(b.name.toLowerCase().includes(q) || b.memberSearchText.includes(q))) return false;
		if (selectedOrgs.size > 0 && !selectedOrgs.has(b.organizationId)) return false;
		if (locMode === 'locations') {
			if (selectedLocs.size > 0 && b.locationId && !selectedLocs.has(b.locationId)) return false;
		} else {
			if (selectedCities.size > 0 && b.city && !selectedCities.has(b.city)) return false;
		}
		return true;
	}
	function matchesBundleFilters(b: Bundle): boolean {
		if (activeCat && b.categoryId !== activeCat) return false;
		return matchesBundleFiltersExceptCategory(b);
	}

	let categoryCounts = $derived.by(() => {
		const counts = new SvelteMap<string, number>();
		let total = 0;
		for (const g of data.groups) {
			if (!matchesFiltersExceptCategory(g)) continue;
			const remaining = groupAvailable(g);
			counts.set(g.categoryId, (counts.get(g.categoryId) ?? 0) + remaining);
			total += remaining;
		}
		for (const b of data.bundles) {
			if (!matchesBundleFiltersExceptCategory(b)) continue;
			if (b.availableCount <= 0) continue;
			counts.set(b.categoryId, (counts.get(b.categoryId) ?? 0) + 1);
			total += 1;
		}
		return { counts, total };
	});

	let availableGroups = $derived(
		data.groups.filter(matchesFilters).sort((a, b) => a.productName.localeCompare(b.productName))
	);
	// Bundles are picked by type, not by physical kit: two instances of "Camera A
	// Kit" read as "2 of 2 available", and +/− books or releases one whole kit.
	function groupByTemplate(instances: Bundle[]): BundleTemplateRow[] {
		const rows = new SvelteMap<string, BundleTemplateRow>();
		for (const b of instances) {
			let row = rows.get(b.templateId);
			if (!row) {
				row = {
					templateId: b.templateId,
					name: b.name,
					categoryId: b.categoryId,
					categoryColor: b.categoryColor,
					organizationName: b.organizationName,
					instances: [],
					booked: [],
					addable: []
				};
				rows.set(b.templateId, row);
			}
			row.instances.push(b);
			if (b.bookedHere > 0) row.booked.push(b);
			else if (b.availableCount > 0) row.addable.push(b);
		}
		return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
	}

	// Only when every instance sits in the same place — otherwise the row spans
	// locations and naming one of them would be misleading.
	function sharedLocationName(row: BundleTemplateRow): string | null {
		const names = new SvelteSet(row.instances.map((b) => b.locationName));
		return names.size === 1 ? [...names][0] : null;
	}

	// How many assets one kit of this type holds. Instances of a type hold the
	// same kit, so the largest only differs while one is being filled up.
	function memberCount(row: BundleTemplateRow): number {
		return Math.max(...row.instances.map((b) => b.totalAssets));
	}

	function bookedTags(row: BundleTemplateRow): string | null {
		const tags = row.booked.map((b) => b.tag).filter((t): t is string => !!t);
		return tags.length > 0 ? tags.join(', ') : null;
	}

	let availableBundles = $derived(groupByTemplate(data.bundles.filter(matchesBundleFilters)));

	// Never filtered by the center pane's search/category/org/location — always
	// shows everything booked for this production.
	let bookedGroups = $derived(data.groups.filter((g) => g.bookedHere > 0));
	// Grouped from every instance, not just the booked ones, so the stepper here
	// can still add a second kit of a type that's already in the production.
	let bookedBundles = $derived(groupByTemplate(data.bundles).filter((r) => r.booked.length > 0));
	let bookedSummary = $derived.by(() => {
		const orgNames = [...new SvelteSet(bookedGroups.map((g) => g.organizationName))].sort();
		const locNames = [...new SvelteSet(bookedGroups.map((g) => g.locationName))].sort();
		return { orgNames, locNames };
	});
	let totalBooked = $derived(bookedGroups.reduce((sum, g) => sum + g.bookedHere, 0));

	let pending = new SvelteSet<string>();

	async function setQty(g: Group, quantity: number) {
		pending.add(g.key);
		try {
			await setProductionQuantity({
				productionId,
				productId: g.productId,
				organizationId: g.organizationId,
				locationId: g.locationId,
				quantity,
				includeBundled: showBundledItems
			});
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			pending.delete(g.key);
		}
	}

	let bundlePending = new SvelteSet<string>();

	async function handleAddBundle(b: Bundle) {
		bundlePending.add(b.id);
		try {
			const result = await addBundleToProduction({ productionId, bundleId: b.id });
			await getEquipmentEditorData(productionId).refresh();
			toast.success(
				result.skippedConflicts > 0
					? `Added ${result.added} asset${result.added !== 1 ? 's' : ''} (${result.skippedConflicts} skipped — already booked elsewhere)`
					: `Added ${result.added} asset${result.added !== 1 ? 's' : ''} from "${b.name}"`
			);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			bundlePending.delete(b.id);
		}
	}

	async function handleRemoveBundle(b: Bundle) {
		bundlePending.add(b.id);
		try {
			await removeBundleFromProduction({ productionId, bundleId: b.id });
			await getEquipmentEditorData(productionId).refresh();
			toast.success(`Removed "${b.name}" from production`);
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			bundlePending.delete(b.id);
		}
	}
</script>

{#snippet countStepper(
	current: number,
	max: number,
	decDisabled: boolean,
	incDisabled: boolean,
	onDec: () => void,
	onInc: () => void
)}
	<div class="flex items-center gap-2">
		<button
			type="button"
			disabled={decDisabled}
			onclick={(e) => {
				e.stopPropagation();
				onDec();
			}}
			class="flex h-6 w-6 items-center justify-center rounded-md border text-base disabled:cursor-not-allowed disabled:opacity-40"
		>
			−
		</button>
		<span class="w-4 text-center text-sm font-semibold tabular-nums">{current}</span>
		<button
			type="button"
			disabled={incDisabled}
			onclick={(e) => {
				e.stopPropagation();
				onInc();
			}}
			class="flex h-6 w-6 items-center justify-center rounded-md border text-base disabled:cursor-not-allowed disabled:opacity-40"
		>
			+
		</button>
	</div>
	<div class="w-14 shrink-0 text-right text-[10px] text-muted-foreground">of {max}</div>
{/snippet}

{#snippet stepper(g: Group)}
	{@const maxQty = groupMaxQty(g)}
	{@render countStepper(
		g.bookedHere,
		maxQty,
		pending.has(g.key) || g.bookedHere <= 0,
		pending.has(g.key) || g.bookedHere >= maxQty,
		() => setQty(g, g.bookedHere - 1),
		() => setQty(g, g.bookedHere + 1)
	)}
{/snippet}

{#snippet bundleStepper(row: BundleTemplateRow)}
	{@const busy = row.instances.some((b) => bundlePending.has(b.id))}
	{@render countStepper(
		row.booked.length,
		row.booked.length + row.addable.length,
		busy || row.booked.length === 0,
		busy || row.addable.length === 0,
		() => handleRemoveBundle(row.booked[row.booked.length - 1]),
		() => handleAddBundle(row.addable[0])
	)}
{/snippet}

<svelte:head><title>Equipment | {data.production.name} | Technikpool</title></svelte:head>

<div class="flex flex-col gap-4 px-4 py-4 sm:px-6 lg:h-full lg:overflow-hidden lg:px-8">
	<div class="flex shrink-0 flex-wrap items-baseline justify-between gap-3">
		<div>
			<Button
				variant="ghost"
				href={resolve(`/productions/${productionId}`)}
				class="mb-1 flex items-center gap-1 text-muted-foreground"
			>
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
				>
					<path d="m15 18-6-6 6-6" />
				</svg>
				{data.production.name}
			</Button>
			<h1 class="text-2xl font-semibold tracking-tight">Equipment</h1>
		</div>
		<span class="rounded-full bg-muted px-3 py-1 text-sm font-semibold text-muted-foreground">
			{totalBooked} device{totalBooked !== 1 ? 's' : ''} booked
		</span>
	</div>

	<div class="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[210px_1fr_1fr]">
		<!-- Categories -->
		<div class="flex flex-col rounded-lg border lg:min-h-0">
			<div class="shrink-0 border-b px-3 py-2">
				<h2 class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					Categories
				</h2>
			</div>
			<div class="max-h-64 overflow-y-auto lg:max-h-none lg:flex-1">
				<button
					type="button"
					onclick={() => (activeCat = null)}
					class="flex w-full items-center gap-2 border-l-2 px-3 py-2 text-left text-sm {activeCat ===
					null
						? 'border-primary bg-muted font-semibold'
						: 'border-transparent hover:bg-muted/50'}"
				>
					<span class="h-2 w-2 shrink-0 rounded-full bg-muted-foreground"></span>
					<span class="flex-1 truncate">All categories</span>
					<span class="text-xs text-muted-foreground tabular-nums">{categoryCounts.total}</span>
				</button>
				{#each categories as cat (cat.id)}
					<button
						type="button"
						onclick={() => (activeCat = cat.id)}
						class="flex w-full items-center gap-2 border-l-2 px-3 py-2 text-left text-sm {activeCat ===
						cat.id
							? 'border-primary bg-muted font-semibold'
							: 'border-transparent hover:bg-muted/50'}"
					>
						<span class="h-2 w-2 shrink-0 rounded-full" style="background-color: {cat.color}"
						></span>
						<span class="flex-1 truncate">{cat.name}</span>
						<span class="text-xs text-muted-foreground tabular-nums"
							>{categoryCounts.counts.get(cat.id) ?? 0}</span
						>
					</button>
				{/each}
			</div>
		</div>

		<!-- Available -->
		<div class="flex flex-col rounded-lg border lg:min-h-0">
			<div class="shrink-0 border-b px-3 py-2">
				<h2 class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					{activeCat
						? `Available — ${categories.find((c) => c.id === activeCat)?.name}`
						: 'Available devices'}
				</h2>
			</div>
			<div class="flex shrink-0 flex-wrap items-start gap-2 border-b p-2">
				<input
					type="search"
					bind:value={search}
					placeholder="Search…"
					class="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
				/>
				<label
					class="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2 text-sm select-none hover:bg-muted"
				>
					<input
						type="checkbox"
						bind:checked={showBundledItems}
						class="h-4 w-4 rounded border-input"
					/>
					Show items in bundles
				</label>
				<FilterPopover
					align="end"
					triggerClass="flex h-8 cursor-pointer items-center gap-1 rounded-md border bg-background px-2 text-sm hover:bg-muted"
					contentClass="max-h-56 min-w-[190px] overflow-y-auto p-1"
				>
					{#snippet trigger()}
						Org
						{#if selectedOrgs.size > 0}
							<span
								class="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
								>{selectedOrgs.size}</span
							>
						{/if}
					{/snippet}
					{#each orgs as org (org.id)}
						<label class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
							<input
								type="checkbox"
								checked={selectedOrgs.has(org.id)}
								onchange={() => {
									const next = new SvelteSet(selectedOrgs);
									if (next.has(org.id)) next.delete(org.id);
									else next.add(org.id);
									selectedOrgs = next;
								}}
								class="h-4 w-4 rounded border-input"
							/>
							<OrgBadge name={orgLabel(org)} color={org.color} avatarLabel={org.avatarLabel} />
						</label>
					{/each}
				</FilterPopover>
				<FilterPopover
					align="end"
					triggerClass="flex h-8 cursor-pointer items-center gap-1 rounded-md border bg-background px-2 text-sm hover:bg-muted"
					contentClass="max-h-64 min-w-[200px] overflow-y-auto p-2"
				>
					{#snippet trigger()}
						Location
						{#if (locMode === 'locations' ? selectedLocs.size : selectedCities.size) > 0}
							<span
								class="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
								>{locMode === 'locations' ? selectedLocs.size : selectedCities.size}</span
							>
						{/if}
					{/snippet}
					<div class="mb-1.5 flex gap-1">
						<button
							type="button"
							onclick={() => (locMode = 'locations')}
							class="flex-1 rounded-md border px-2 py-1 text-xs font-medium {locMode === 'locations'
								? 'border-primary text-primary'
								: ''}"
						>
							Locations
						</button>
						<button
							type="button"
							onclick={() => (locMode = 'city')}
							class="flex-1 rounded-md border px-2 py-1 text-xs font-medium {locMode === 'city'
								? 'border-primary text-primary'
								: ''}"
						>
							City
						</button>
					</div>
					{#if locMode === 'locations'}
						{#each locations as loc (loc.id)}
							<label class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
								<input
									type="checkbox"
									checked={selectedLocs.has(loc.id)}
									onchange={() => {
										const next = new SvelteSet(selectedLocs);
										if (next.has(loc.id)) next.delete(loc.id);
										else next.add(loc.id);
										selectedLocs = next;
									}}
									class="h-4 w-4 rounded border-input"
								/>
								{loc.name}
							</label>
						{/each}
					{:else}
						{#each cities as city (city)}
							<label class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
								<input
									type="checkbox"
									checked={selectedCities.has(city)}
									onchange={() => {
										const next = new SvelteSet(selectedCities);
										if (next.has(city)) next.delete(city);
										else next.add(city);
										selectedCities = next;
									}}
									class="h-4 w-4 rounded border-input"
								/>
								{city}
							</label>
						{/each}
					{/if}
				</FilterPopover>
			</div>
			<div class="max-h-96 overflow-y-auto lg:max-h-none lg:flex-1">
				{#if availableBundles.length === 0 && availableGroups.length === 0}
					<p class="p-6 text-center text-sm text-muted-foreground">No matching devices.</p>
				{:else}
					{#each availableBundles as row (row.templateId)}
						{@const bundleAddDisabled =
							row.instances.some((b) => bundlePending.has(b.id)) || row.addable.length === 0}
						{@const locationName = sharedLocationName(row)}
						<div
							class="flex items-center gap-2 border-b bg-muted/20 px-3 py-2 last:border-0 {bundleAddDisabled
								? 'opacity-50'
								: 'cursor-pointer hover:bg-muted/40'}"
							onclick={() => !bundleAddDisabled && handleAddBundle(row.addable[0])}
						>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium">
									<span
										class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
										style="background-color: {row.categoryColor}"
									></span>
									Bundle · {row.name}
								</p>
								<p class="truncate text-xs text-muted-foreground">
									{row.organizationName}{locationName ? ` · ${locationName}` : ''} · {plural(
										memberCount(row),
										['# component', '# components']
									)}
								</p>
							</div>
							{@render bundleStepper(row)}
						</div>
					{/each}
					{#each availableGroups as g (g.key)}
						{@const groupAddDisabled = pending.has(g.key) || g.bookedHere >= groupMaxQty(g)}
						<div
							class="flex items-center gap-2 border-b px-3 py-2 last:border-0 {groupAddDisabled
								? 'opacity-50'
								: 'cursor-pointer hover:bg-muted/40'}"
							onclick={() => !groupAddDisabled && setQty(g, g.bookedHere + 1)}
						>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium">
									<span
										class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
										style="background-color: {g.categoryColor}"
									></span>
									{g.productName}
								</p>
								<p class="truncate text-xs text-muted-foreground">
									{g.manufacturerName} · {g.organizationName} · {g.locationName}
								</p>
							</div>
							{@render stepper(g)}
						</div>
					{/each}
				{/if}
			</div>
		</div>

		<!-- Booked -->
		<div class="flex flex-col rounded-lg border lg:min-h-0">
			<div class="shrink-0 border-b px-3 py-2">
				<h2 class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					Booked for this production
				</h2>
			</div>
			{#if bookedGroups.length > 0}
				<div class="flex shrink-0 flex-col gap-1.5 border-b bg-muted/40 px-3 py-2">
					<div class="flex flex-wrap items-baseline gap-1.5">
						<span class="text-[10px] font-semibold text-muted-foreground uppercase">Orgs</span>
						{#each bookedSummary.orgNames as name (name)}
							<span class="rounded-full border bg-background px-2 py-0.5 text-xs">{name}</span>
						{/each}
					</div>
					<div class="flex flex-wrap items-baseline gap-1.5">
						<span class="text-[10px] font-semibold text-muted-foreground uppercase">Locations</span>
						{#each bookedSummary.locNames as name (name)}
							<span class="rounded-full border bg-background px-2 py-0.5 text-xs">{name}</span>
						{/each}
					</div>
				</div>
			{/if}
			<div class="max-h-96 overflow-y-auto lg:max-h-none lg:flex-1">
				{#if bookedGroups.length === 0 && bookedBundles.length === 0}
					<p class="p-6 text-center text-sm text-muted-foreground">Nothing booked yet.</p>
				{:else}
					{#each categories as cat (cat.id)}
						{@const catBundles = bookedBundles.filter((b) => b.categoryId === cat.id)}
						{@const rows = bookedGroups.filter(
							(g) => g.categoryId === cat.id && g.bookedHere - g.bookedFromBundle > 0
						)}
						{@const catTotal = bookedGroups
							.filter((g) => g.categoryId === cat.id)
							.reduce((sum, g) => sum + g.bookedHere, 0)}
						{#if rows.length > 0 || catBundles.length > 0}
							<div
								class="sticky top-0 flex items-center gap-1.5 bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground"
							>
								<span class="h-2 w-2 rounded-full" style="background-color: {cat.color}"></span>
								{cat.name} ({catTotal})
							</div>
							{#each catBundles as row (row.templateId)}
								{@const tags = bookedTags(row)}
								{@const locationName = sharedLocationName(row)}
								<div class="flex items-center gap-2 border-b bg-muted/20 px-3 py-2 last:border-0">
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium">
											Bundle · {row.name}{tags ? ` (${tags})` : ''}
										</p>
										<p class="truncate text-xs text-muted-foreground">
											{row.organizationName}{locationName ? ` · ${locationName}` : ''} · {plural(
												memberCount(row),
												['# component', '# components']
											)}
										</p>
									</div>
									{@render bundleStepper(row)}
								</div>
							{/each}
							{#each rows as g (g.key)}
								<div class="flex items-center gap-2 border-b px-3 py-2 last:border-0">
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium">{g.productName}</p>
										<p class="truncate text-xs text-muted-foreground">
											{g.manufacturerName} · {g.organizationName}
										</p>
									</div>
									{@render stepper(g)}
								</div>
							{/each}
						{/if}
					{/each}
				{/if}
			</div>
		</div>
	</div>
</div>
