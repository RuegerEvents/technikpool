<script lang="ts" module>
	export type PickerUnit = {
		id: string;
		productId: string;
		productName: string;
		productCaption: string | null;
		manufacturerName: string | null;
		imagePath: string | null;
		assetTag: string | null;
		serialNumber: string | null;
		locationName: string | null;
	};
</script>

<script lang="ts">
	import { CameraScanButton } from '$lib/components/ui/camera-scan';
	// Picking loose units for a kit the way a production books them: one row per
	// product and place, a count, and "all" — because "4 of the CAT cables" is
	// the question, not which four. A row opens into its units, tag by tag, for
	// the times it is exactly that one; and the search finds a unit by its tag or
	// serial number as well as by what it is.
	import { SvelteSet } from 'svelte/reactivity';
	import { ProductThumb } from '$lib/components/ui/product-thumb';
	import { CountStepper } from '$lib/components/ui/count-stepper';
	import { naturalCompare } from '$lib/sort';

	let {
		units,
		selected = $bindable([]),
		search = $bindable(''),
		limitFor = () => Infinity
	}: {
		/** Units that may be picked: loose, bookable, not an accessory. */
		units: PickerUnit[];
		/** The ids picked so far. */
		selected?: string[];
		search?: string;
		/**
		 * How many units of a product this kit can take in all, across rows —
		 * a bundle type that is already on the shelf holds a fixed number.
		 */
		limitFor?: (productId: string) => number;
	} = $props();

	type Group = {
		key: string;
		productId: string;
		productName: string;
		productCaption: string | null;
		manufacturerName: string | null;
		imagePath: string | null;
		locationName: string | null;
		units: PickerUnit[];
	};

	// Tagged units first and in tag order, so "+1" takes the lowest free tag —
	// the one someone reading the shelf would reach for.
	function unitOrder(a: PickerUnit, b: PickerUnit) {
		if (!!a.assetTag !== !!b.assetTag) return a.assetTag ? -1 : 1;
		return (
			naturalCompare(a.assetTag ?? '', b.assetTag ?? '') ||
			naturalCompare(a.serialNumber ?? '', b.serialNumber ?? '')
		);
	}

	let groups = $derived.by(() => {
		const byKey: Record<string, Group> = {};
		for (const unit of units) {
			const key = `${unit.productId}|${unit.locationName ?? ''}`;
			byKey[key] ??= {
				key,
				productId: unit.productId,
				productName: unit.productName,
				productCaption: unit.productCaption,
				manufacturerName: unit.manufacturerName,
				imagePath: unit.imagePath,
				locationName: unit.locationName,
				units: []
			};
			byKey[key].units.push(unit);
		}
		return Object.values(byKey)
			.map((g) => ({ ...g, units: g.units.sort(unitOrder) }))
			.sort(
				(a, b) =>
					naturalCompare(a.productName, b.productName) ||
					naturalCompare(a.locationName ?? '', b.locationName ?? '')
			);
	});

	let picked = $derived(new Set(selected));
	let q = $derived(search.toLowerCase().trim());

	// A row is shown when it is what was searched for, or when one of its units
	// is — and then only that unit, opened, since a tag names exactly one.
	let shown = $derived.by(() =>
		groups.flatMap((g) => {
			if (!q) return [{ group: g, units: g.units, byUnit: false }];
			const byProduct = [g.productName, g.productCaption, g.manufacturerName].some((v) =>
				v?.toLowerCase().includes(q)
			);
			if (byProduct) return [{ group: g, units: g.units, byUnit: false }];
			const hits = g.units.filter((u) =>
				[u.assetTag, u.serialNumber].some((v) => v?.toLowerCase().includes(q))
			);
			return hits.length > 0 ? [{ group: g, units: hits, byUnit: true }] : [];
		})
	);

	const expanded = new SvelteSet<string>();

	function pickedIn(g: Group) {
		return g.units.filter((u) => picked.has(u.id)).length;
	}

	/** How far this row's count can go: its own units, and what the kit still takes. */
	function limitOf(g: Group) {
		const elsewhere = units.filter(
			(u) => u.productId === g.productId && picked.has(u.id) && !g.units.includes(u)
		).length;
		return Math.max(0, Math.min(g.units.length, limitFor(g.productId) - elsewhere));
	}

	function setCount(g: Group, n: number) {
		const current = g.units.filter((u) => picked.has(u.id));
		if (n > current.length) {
			const more = g.units.filter((u) => !picked.has(u.id)).slice(0, n - current.length);
			selected = [...selected, ...more.map((u) => u.id)];
		} else if (n < current.length) {
			// The most recently picked go back first, so a unit chosen by hand
			// survives a "−" that was meant for the count.
			const drop = new Set(selected.filter((id) => current.some((u) => u.id === id)).slice(n));
			selected = selected.filter((id) => !drop.has(id));
		}
	}

	function toggle(g: Group, unit: PickerUnit) {
		if (picked.has(unit.id)) selected = selected.filter((id) => id !== unit.id);
		else if (pickedIn(g) < limitOf(g)) selected = [...selected, unit.id];
	}
</script>

<div class="space-y-2">
	<div class="flex gap-2">
		<input
			type="search"
			bind:value={search}
			placeholder="Search by product, asset tag or serial number…"
			class="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
		/>
		<CameraScanButton onscan={(code) => (search = code)} />
	</div>
	{#if shown.length > 0}
		<div class="max-h-96 overflow-y-auto rounded-md border">
			{#each shown as { group, units: listed, byUnit } (group.key)}
				{@const open = byUnit || expanded.has(group.key)}
				{@const count = pickedIn(group)}
				{@const limit = limitOf(group)}
				<div class="border-b last:border-0">
					<div class="flex items-center gap-3 px-3 py-2 {count > 0 ? 'bg-muted/40' : ''}">
						<button
							type="button"
							class="flex min-w-0 flex-1 items-center gap-2 text-left"
							aria-expanded={open}
							onclick={() =>
								expanded.has(group.key) ? expanded.delete(group.key) : expanded.add(group.key)}
						>
							<svg
								class="size-3.5 shrink-0 text-muted-foreground transition-transform {open
									? 'rotate-90'
									: ''}"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg
							>
							<ProductThumb path={group.imagePath} alt={group.productName} size={28} />
							<span class="min-w-0">
								<span class="block truncate text-sm font-medium">
									{group.productName}{#if group.productCaption}<span
											class="ml-1.5 font-normal text-muted-foreground"
											>— {group.productCaption}</span
										>{/if}
								</span>
								<span class="block truncate text-xs text-muted-foreground">
									{[group.manufacturerName, group.locationName].filter(Boolean).join(' · ')}
								</span>
							</span>
						</button>
						<CountStepper
							current={count}
							{limit}
							shownMax={group.units.length}
							onchange={(n) => setCount(group, n)}
						/>
					</div>
					{#if open}
						<ul class="bg-muted/20 pb-1">
							{#each listed as unit (unit.id)}
								{@const checked = picked.has(unit.id)}
								<li>
									<label
										class="flex cursor-pointer items-center gap-3 py-1.5 pr-3 pl-12 text-sm hover:bg-muted/40 {!checked &&
										count >= limit
											? 'cursor-not-allowed opacity-50'
											: ''}"
									>
										<input
											type="checkbox"
											{checked}
											disabled={!checked && count >= limit}
											onchange={() => toggle(group, unit)}
										/>
										<span class="w-28 shrink-0 font-mono text-xs">{unit.assetTag ?? '—'}</span>
										<span class="truncate font-mono text-xs text-muted-foreground">
											{unit.serialNumber ? `S/N ${unit.serialNumber}` : ''}
										</span>
									</label>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/each}
		</div>
	{:else if units.length > 0}
		<p class="text-sm text-muted-foreground">Nothing here matches "{search.trim()}".</p>
	{:else}
		<p class="text-sm text-muted-foreground">No loose units to add.</p>
	{/if}
</div>
