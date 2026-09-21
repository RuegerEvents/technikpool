<script lang="ts">
	import { categoryLabel } from '$lib/category';
	import { getErrorMessage, plural, orgLabel } from '$lib/utils';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import { OrgBadge } from '$lib/components/ui/org-badge';
	import { FilterPopover } from '$lib/components/ui/filter-popover';
	import { ProductThumb } from '$lib/components/ui/product-thumb';
	import { getEquipmentEditorData, setProductionQuantity } from '$lib/remote/equipment.remote';
	import {
		addBundleToProduction,
		removeBundleFromProduction
	} from '$lib/remote/productions.remote';
	import { toast } from 'svelte-sonner';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { onDestroy } from 'svelte';
	import CopyEquipmentModal from '../copy-equipment-modal.svelte';

	let { productionId }: { productionId: string } = $props();
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
		imagePath: string | null;
		instances: Bundle[];
		/** Instances with assets booked into this production */
		booked: Bundle[];
		/** Instances that could still be added */
		addable: Bundle[];
	};

	let activeCat = $state<string | null>(null);
	let search = $state('');
	let selectedOrgs = new SvelteSet<string>();
	let locMode = $state<'locations' | 'city'>('locations');
	let selectedLocs = new SvelteSet<string>();
	let selectedCities = new SvelteSet<string>();
	let showBundledItems = $state(false);
	let copyEquipmentOpen = $state(false);

	// ── Optimistic editing ──────────────────────────────────────────────────
	// A click changes the number on screen at once; the server hears about it
	// after SAVE_DELAY of quiet, so five clicks on + are one request, and no
	// click ever waits for the previous one to come back. The wanted values
	// stay laid over the server's until the server agrees with them.
	const SAVE_DELAY = 600;
	/** Individually booked units the user asked for, by group key */
	const wantedQty = new SvelteMap<string, number>();
	/** Booked kits the user asked for, by bundle template */
	const wantedKits = new SvelteMap<string, number>();
	/** Rows whose change is still inside the debounce window */
	const scheduled = new SvelteSet<string>();
	/** Rows with a request in flight */
	const saving = new SvelteSet<string>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping, never rendered
	const timers = new Map<string, ReturnType<typeof setTimeout>>();
	/** The last quantity sent per group, so a save loop knows when it has caught up */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping, never rendered
	const lastSent = new Map<string, number>();

	let dirty = $derived(scheduled.size + saving.size > 0);
	let justSaved = $state(false);
	let justSavedTimer: ReturnType<typeof setTimeout> | undefined;

	let groups = $derived(
		data.groups.map((g) => {
			const want = wantedQty.get(g.key);
			return want === undefined ? g : { ...g, bookedHere: g.bookedFromBundle + want };
		})
	);

	let categories = $derived.by(() => {
		const seen = new SvelteMap<
			string,
			{ id: string; name: string; color: string; sortOrder: number }
		>();
		for (const g of groups) {
			if (!seen.has(g.categoryId)) {
				seen.set(g.categoryId, {
					id: g.categoryId,
					name: categoryLabel({ name: g.categoryName, nameDe: g.categoryNameDe }),
					color: g.categoryColor,
					sortOrder: g.categorySortOrder
				});
			}
		}
		for (const b of data.bundles) {
			if (!seen.has(b.categoryId)) {
				seen.set(b.categoryId, {
					id: b.categoryId,
					name: categoryLabel({ name: b.categoryName, nameDe: b.categoryNameDe }),
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
		for (const g of groups) {
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
		for (const g of groups) {
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

	// What the product row's stepper shows and changes: units booked on their
	// own. Units booked through a bundle live on the bundle's row.
	function groupBookedIndividually(g: Group): number {
		return g.bookedHere - g.bookedFromBundle;
	}

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
			!(
				g.productName.toLowerCase().includes(q) ||
				(g.manufacturerName?.toLowerCase().includes(q) ?? false)
			)
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
		for (const g of groups) {
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
		groups.filter(matchesFilters).sort((a, b) => a.productName.localeCompare(b.productName))
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
					imagePath: b.imagePath,
					instances: [],
					booked: [],
					addable: []
				};
				rows.set(b.templateId, row);
			}
			if (!row.imagePath && b.imagePath) row.imagePath = b.imagePath;
			row.instances.push(b);
			if (b.bookedHere > 0) row.booked.push(b);
			else if (b.availableCount > 0) row.addable.push(b);
		}
		return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
	}

	// Lays a pending kit count over the server's: kits are added from the front
	// of `addable` and released from the end of `booked`, the same order
	// saveKits works through them in, so the tags on screen are the ones booked.
	function withWantedKits(row: BundleTemplateRow): BundleTemplateRow {
		const want = wantedKits.get(row.templateId);
		if (want === undefined) return row;
		const all = [...row.booked, ...row.addable];
		const n = Math.min(Math.max(want, 0), all.length);
		return { ...row, booked: all.slice(0, n), addable: all.slice(n) };
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

	let availableBundles = $derived(
		groupByTemplate(data.bundles.filter(matchesBundleFilters)).map(withWantedKits)
	);

	// Never filtered by the center pane's search/category/org/location — always
	// shows everything booked for this production.
	let bookedGroups = $derived(groups.filter((g) => g.bookedHere > 0));
	// Grouped from every instance, not just the booked ones, so the stepper here
	// can still add a second kit of a type that's already in the production.
	let bookedBundles = $derived(
		groupByTemplate(data.bundles)
			.map(withWantedKits)
			.filter((r) => r.booked.length > 0)
	);
	let bookedSummary = $derived.by(() => {
		const orgNames = [...new SvelteSet(bookedGroups.map((g) => g.organizationName))].sort();
		const locNames = [...new SvelteSet(bookedGroups.map((g) => g.locationName))].sort();
		return { orgNames, locNames };
	});
	let totalBooked = $derived(bookedGroups.reduce((sum, g) => sum + g.bookedHere, 0));

	function schedule(key: string, save: () => Promise<void>) {
		clearTimeout(timers.get(key));
		scheduled.add(key);
		timers.set(
			key,
			setTimeout(() => {
				timers.delete(key);
				scheduled.delete(key);
				void save();
			}, SAVE_DELAY)
		);
	}

	function setQty(g: Group, quantity: number) {
		const max = groupMaxQty(g) - g.bookedFromBundle;
		wantedQty.set(g.key, Math.min(Math.max(0, Math.round(quantity)), max));
		schedule(`g:${g.key}`, () => saveQty(g));
	}

	function setKits(row: BundleTemplateRow, count: number) {
		const max = row.booked.length + row.addable.length;
		wantedKits.set(row.templateId, Math.min(Math.max(0, Math.round(count)), max));
		schedule(`b:${row.templateId}`, () => saveKits(row.templateId));
	}

	// Sends the wanted quantity, and again if it moved while the request was
	// out. The command sets an absolute count, so resending is harmless.
	async function saveQty(g: Group) {
		const key = `g:${g.key}`;
		if (saving.has(key)) return; // the running loop picks the new value up
		saving.add(key);
		try {
			let want = wantedQty.get(g.key);
			while (want !== undefined && want !== lastSent.get(g.key)) {
				await setProductionQuantity({
					productionId,
					productId: g.productId,
					organizationId: g.organizationId,
					locationId: g.locationId,
					quantity: want,
					includeBundled: showBundledItems
				});
				lastSent.set(g.key, want);
				want = wantedQty.get(g.key);
			}
			// The command answers with the refreshed data; if it still disagrees,
			// someone else moved the same units meanwhile and theirs is the truth.
			const fresh = getEquipmentEditorData(productionId).current;
			const fg = fresh?.groups.find((x) => x.key === g.key);
			if (want !== undefined && fg && groupBookedIndividually(fg) !== want) wantedQty.delete(g.key);
		} catch (err) {
			toast.error(`${g.productName}: ${getErrorMessage(err)}`);
			wantedQty.delete(g.key);
		} finally {
			lastSent.delete(g.key);
			saving.delete(key);
			settled();
		}
	}

	// Kits are booked one instance at a time, so this walks from what the
	// server has towards what was asked for, rereading the server's answer
	// after every step rather than trusting a plan made before the first one.
	async function saveKits(templateId: string) {
		const key = `b:${templateId}`;
		if (saving.has(key)) return;
		saving.add(key);
		try {
			for (;;) {
				const want = wantedKits.get(templateId);
				const fresh = getEquipmentEditorData(productionId).current ?? data;
				const row = groupByTemplate(fresh.bundles).find((r) => r.templateId === templateId);
				if (want === undefined || !row) break;
				if (row.booked.length < want && row.addable.length > 0) {
					const b = row.addable[0];
					const result = await addBundleToProduction({ productionId, bundleId: b.id });
					reportAdded(b, result);
				} else if (row.booked.length > want && row.booked.length > 0) {
					const b = row.booked[row.booked.length - 1];
					await removeBundleFromProduction({ productionId, bundleId: b.id });
				} else {
					// Out of kits to add (someone else booked the last one): show what is.
					if (row.booked.length !== want) wantedKits.delete(templateId);
					break;
				}
				await getEquipmentEditorData(productionId).refresh();
			}
		} catch (err) {
			toast.error(getErrorMessage(err));
			wantedKits.delete(templateId);
		} finally {
			saving.delete(key);
			settled();
		}
	}

	// A plain add needs no word: the row already shows it. Adopting units or
	// skipping ones that are booked elsewhere does, since the count alone hides it.
	function reportAdded(
		b: Bundle,
		result: { added: number; adopted: number; skippedConflicts: number }
	) {
		if (result.adopted === 0 && result.skippedConflicts === 0) return;
		const parts: string[] = [plural(result.added, ['# asset added', '# assets added'])];
		if (result.adopted > 0)
			parts.push(
				plural(result.adopted, [
					'# was already booked individually and moved into the bundle',
					'# were already booked individually and moved into the bundle'
				])
			);
		if (result.skippedConflicts > 0)
			parts.push(
				plural(result.skippedConflicts, [
					'# skipped, already booked elsewhere',
					'# skipped, already booked elsewhere'
				])
			);
		toast.info(`${parts.join(' · ')} — "${b.name}"`);
	}

	function settled() {
		if (dirty) return;
		justSaved = true;
		clearTimeout(justSavedTimer);
		justSavedTimer = setTimeout(() => (justSaved = false), 2000);
	}

	// Drop an overlay once the server's own numbers have caught up with it —
	// not the moment the request returns, because the refreshed data can land
	// a tick later and the row would flick back to the old count in between.
	$effect(() => {
		for (const [key, want] of wantedQty) {
			if (scheduled.has(`g:${key}`) || saving.has(`g:${key}`)) continue;
			const g = data.groups.find((x) => x.key === key);
			if (!g || groupBookedIndividually(g) === want) wantedQty.delete(key);
		}
		for (const [templateId, want] of wantedKits) {
			if (scheduled.has(`b:${templateId}`) || saving.has(`b:${templateId}`)) continue;
			// Counted by hand: groupByTemplate builds a SvelteMap, and one created,
			// read and written inside an effect reschedules it for ever.
			const booked = data.bundles.filter(
				(b) => b.templateId === templateId && b.bookedHere > 0
			).length;
			if (booked === want) wantedKits.delete(templateId);
		}
	});

	// Leaving the page inside the debounce window saves right away instead of
	// dropping the change; the requests outlive the component.
	onDestroy(() => {
		clearTimeout(justSavedTimer);
		for (const [key, timer] of timers) {
			clearTimeout(timer);
			if (key.startsWith('g:')) {
				const g = data.groups.find((x) => `g:${x.key}` === key);
				if (g) void saveQty(g);
			} else void saveKits(key.slice(2));
		}
		timers.clear();
	});

	function onBeforeUnload(e: BeforeUnloadEvent) {
		if (dirty) e.preventDefault();
	}

	function commitTyped(e: Event, max: number, apply: (n: number) => void, current: number) {
		const input = e.currentTarget as HTMLInputElement;
		const n = Number(input.value);
		const next = Number.isFinite(n) ? Math.min(Math.max(0, Math.round(n)), max) : current;
		// Clamping to the value already shown changes no state, so nothing would
		// redraw the input — put the number back by hand.
		input.value = String(next);
		if (next !== current) apply(next);
	}
</script>

<!--
  `limit` is what this row can reach on its own; `shownMax` is the "of n" beside
  it, which for a product also counts units that came in through a bundle.
-->
{#snippet countStepper(current: number, limit: number, shownMax: number, set: (n: number) => void)}
	<!-- None and All only appear when they would do something, but keep their
	     width either way, so the steppers line up down the list. -->
	<div class="flex items-center gap-1.5">
		<button
			type="button"
			disabled={current <= 0}
			title="Remove all"
			onclick={(e) => {
				e.stopPropagation();
				set(0);
			}}
			class="h-6 w-12 rounded-md border text-xs font-medium hover:bg-muted {current <= 0
				? 'invisible'
				: ''}"
		>
			None
		</button>
		<button
			type="button"
			disabled={current <= 0}
			onclick={(e) => {
				e.stopPropagation();
				set(current - 1);
			}}
			class="flex h-6 w-6 items-center justify-center rounded-md border text-base disabled:cursor-not-allowed disabled:opacity-40"
		>
			−
		</button>
		<input
			type="number"
			inputmode="numeric"
			min="0"
			max={limit}
			value={current}
			aria-label="Quantity"
			onclick={(e) => e.stopPropagation()}
			onfocus={(e) => e.currentTarget.select()}
			onkeydown={(e) => {
				if (e.key === 'Enter') e.currentTarget.blur();
			}}
			onchange={(e) => commitTyped(e, limit, set, current)}
			class="h-6 w-9 [appearance:textfield] rounded-md border border-transparent bg-transparent text-center text-sm font-semibold tabular-nums hover:border-input focus:border-input focus:bg-background focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
		/>
		<button
			type="button"
			disabled={current >= limit}
			onclick={(e) => {
				e.stopPropagation();
				set(current + 1);
			}}
			class="flex h-6 w-6 items-center justify-center rounded-md border text-base disabled:cursor-not-allowed disabled:opacity-40"
		>
			+
		</button>
		<button
			type="button"
			disabled={current >= limit}
			title="Add all available"
			onclick={(e) => {
				e.stopPropagation();
				set(limit);
			}}
			class="h-6 w-14 rounded-md border text-xs font-medium whitespace-nowrap tabular-nums hover:bg-muted {current >=
			limit
				? 'invisible'
				: ''}"
		>
			All {limit}
		</button>
	</div>
	<div class="w-10 shrink-0 text-right text-[10px] text-muted-foreground">of {shownMax}</div>
{/snippet}

{#snippet stepper(g: Group)}
	{@const maxQty = groupMaxQty(g)}
	{@render countStepper(groupBookedIndividually(g), maxQty - g.bookedFromBundle, maxQty, (n) =>
		setQty(g, n)
	)}
{/snippet}

{#snippet bundleStepper(row: BundleTemplateRow)}
	{@const kits = row.booked.length + row.addable.length}
	{@render countStepper(row.booked.length, kits, kits, (n) => setKits(row, n))}
{/snippet}

<svelte:window onbeforeunload={onBeforeUnload} />

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
		<div class="flex items-center gap-3">
			{#if !data.production.cancelledAt}
				<Button variant="outline" size="sm" onclick={() => (copyEquipmentOpen = true)}
					>Copy equipment from…</Button
				>
			{/if}
			<span class="rounded-full bg-muted px-3 py-1 text-sm font-semibold text-muted-foreground">
				{totalBooked} device{totalBooked !== 1 ? 's' : ''} booked
			</span>
		</div>
	</div>

	{#if data.production.cancelledAt}
		<!-- The server refuses every booking onto it; say so before the first try. -->
		<p
			class="shrink-0 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
		>
			This production has been cancelled. Reopen it before booking equipment onto it.
		</p>
	{/if}

	<div
		class="grid min-w-0 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[210px_minmax(0,1fr)_minmax(0,1fr)]"
	>
		<!-- Categories -->
		<div class="flex min-w-0 flex-col rounded-lg border lg:min-h-0">
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
		<div class="flex min-w-0 flex-col rounded-lg border lg:min-h-0">
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
									if (selectedOrgs.has(org.id)) selectedOrgs.delete(org.id);
									else selectedOrgs.add(org.id);
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
					{#snippet children()}
						<div class="mb-1.5 flex gap-1">
							<button
								type="button"
								onclick={() => (locMode = 'locations')}
								class="flex-1 rounded-md border px-2 py-1 text-xs font-medium {locMode ===
								'locations'
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
								<label
									class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
								>
									<input
										type="checkbox"
										checked={selectedLocs.has(loc.id)}
										onchange={() => {
											if (selectedLocs.has(loc.id)) selectedLocs.delete(loc.id);
											else selectedLocs.add(loc.id);
										}}
										class="h-4 w-4 rounded border-input"
									/>
									{loc.name}
								</label>
							{/each}
						{:else}
							{#each cities as city (city)}
								<label
									class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
								>
									<input
										type="checkbox"
										checked={selectedCities.has(city)}
										onchange={() => {
											if (selectedCities.has(city)) selectedCities.delete(city);
											else selectedCities.add(city);
										}}
										class="h-4 w-4 rounded border-input"
									/>
									{city}
								</label>
							{/each}
						{/if}
					{/snippet}
				</FilterPopover>
			</div>
			<div class="max-h-96 overflow-y-auto lg:max-h-none lg:flex-1">
				{#if availableBundles.length === 0 && availableGroups.length === 0}
					<p class="p-6 text-center text-sm text-muted-foreground">No matching devices.</p>
				{:else}
					{#each availableBundles as row (row.templateId)}
						{@const bundleAddDisabled = row.addable.length === 0}
						{@const locationName = sharedLocationName(row)}
						<div
							class="flex items-center gap-2 border-b bg-muted/20 px-3 py-2 last:border-0 {bundleAddDisabled
								? 'opacity-50'
								: 'cursor-pointer hover:bg-muted/40'}"
							onclick={() => !bundleAddDisabled && setKits(row, row.booked.length + 1)}
						>
							<ProductThumb path={row.imagePath} alt={row.name} />
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
						{@const groupAddDisabled = g.bookedHere >= groupMaxQty(g)}
						<!-- the centre pane's + always adds one more individually booked unit -->
						<div
							class="flex items-center gap-2 border-b px-3 py-2 last:border-0 {groupAddDisabled
								? 'opacity-50'
								: 'cursor-pointer hover:bg-muted/40'}"
							onclick={() => !groupAddDisabled && setQty(g, groupBookedIndividually(g) + 1)}
						>
							<ProductThumb path={g.imagePath} alt={g.productName} />
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium">
									<span
										class="mr-1 inline-block h-1.5 w-1.5 rounded-full"
										style="background-color: {g.categoryColor}"
									></span>
									{g.productName}
								</p>
								<p class="truncate text-xs text-muted-foreground">
									{[g.manufacturerName, g.organizationName, g.locationName]
										.filter(Boolean)
										.join(' · ')}
								</p>
							</div>
							{@render stepper(g)}
						</div>
					{/each}
				{/if}
			</div>
		</div>

		<!-- Booked -->
		<div class="flex min-w-0 flex-col rounded-lg border lg:min-h-0">
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
									<ProductThumb path={row.imagePath} alt={row.name} />
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
									<ProductThumb path={g.imagePath} alt={g.productName} />
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium">{g.productName}</p>
										<p class="truncate text-xs text-muted-foreground">
											{[g.manufacturerName, g.organizationName].filter(Boolean).join(' · ')}
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

<!-- Bottom-left, because toasts own the bottom-right corner. -->
{#if dirty || justSaved}
	<div
		role="status"
		class="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm text-muted-foreground shadow-md"
	>
		{#if dirty}
			<span
				class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"
			></span>
			Saving…
		{:else}
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
				<path d="M20 6 9 17l-5-5" />
			</svg>
			All changes saved
		{/if}
	</div>
{/if}

<CopyEquipmentModal
	{productionId}
	organizationId={data.production.organizationId}
	bind:open={copyEquipmentOpen}
/>
