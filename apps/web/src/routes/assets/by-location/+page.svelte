<script lang="ts">
	import { EQUIPMENT_VIEWS } from '#lib/equipment-views.js';
	import { CableColorDot } from '#lib/components/ui/cable-color/index.js';
	// The warehouse as a board: one column per location of an org, its kits and
	// its loose units on cards, and a card dragged into another column is moved
	// there — the same booking as scanning it onto that shelf (`checkoutAssets`),
	// history and all. A unit out on a production stays in the column it belongs
	// to, greyed at the bottom: that is where it goes back to, and moving it from
	// here would book it back without anyone having seen it.
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { browser } from '$app/env';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';
	import { CountStepper } from '#lib/components/ui/count-stepper/index.js';
	import { CategorySelect } from '#lib/components/ui/category-select/index.js';
	import { ProductThumb } from '#lib/components/ui/product-thumb/index.js';
	import { ContentSkeleton } from '#lib/components/ui/skeleton/index.js';
	import {
		getAssets,
		getCategories,
		getLocations,
		getPlaceableLocations
	} from '#lib/remote/assets.remote.js';
	import { LocationSelect } from '#lib/components/ui/location-select/index.js';
	import { checkoutAssets } from '#lib/remote/checkout.remote.js';
	import { getMyOrgs } from '#lib/remote/orgs.remote.js';
	import { canWrite } from '#lib/roles.js';
	import { searchMatcher } from '#lib/search.js';
	import { naturalCompare } from '#lib/sort.js';
	import { getErrorMessage, orgLabel, plural } from '#lib/utils.js';

	let orgsQuery = $derived(getMyOrgs());
	let orgs = $derived(orgsQuery.current ?? []);
	// Every filter lives in the URL, so a board can be bookmarked as it is.
	const params = page.url.searchParams;
	let orgId = $state(
		params.get('org') ?? (browser ? (localStorage.getItem('board_org') ?? '') : '')
	);
	let org = $derived(orgs.find((o) => o.id === orgId) ?? orgs[0] ?? null);
	$effect(() => {
		if (!org || !browser) return;
		try {
			localStorage.setItem('board_org', org.id);
		} catch {
			// A private window: the board simply opens on the first org next time.
		}
	});
	let mayMove = $derived(!!org && canWrite(org));

	let assetsQuery = $derived(org ? getAssets(org.id) : null);
	let assets = $derived(assetsQuery?.current ?? []);
	let locationsQuery = $derived(org ? getLocations(org.id) : null);
	let locations = $derived(locationsQuery?.current ?? []);
	let categoriesQuery = $derived(getCategories());
	let categories = $derived(categoriesQuery.current ?? []);

	let search = $state(params.get('q') ?? '');
	let categoryId = $state(params.get('category') ?? '');
	// Units in the warehouse, units out on a production, or both.
	type Show = 'all' | 'here' | 'out';
	const SHOWS: Show[] = ['all', 'here', 'out'];
	let show = $state<Show>(SHOWS.find((v) => v === params.get('show')) ?? 'all');
	// What is out on a production in a column of that production's own, instead
	// of greyed at the bottom of the shelf it goes back to.
	let byProduction = $state(params.get('productions') === '1');

	$effect(() => {
		const url = new URL(page.url.href);
		const values = {
			org: org?.id ?? '',
			q: search.trim(),
			category: categoryId,
			show: show === 'all' ? '' : show,
			productions: byProduction ? '1' : ''
		};
		for (const [key, value] of Object.entries(values)) {
			if (value) url.searchParams.set(key, value);
			else url.searchParams.delete(key);
		}
		if (url.href === page.url.href) return;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- updating query params on the current route, not navigating to a typed path
		goto(url, { replace: true, reset: false });
	});
	let matchSearch = $derived(searchMatcher(search));

	type Asset = (typeof assets)[number];
	type Card = {
		key: string;
		kind: 'bundle' | 'product';
		title: string;
		caption: string | null;
		subtitle: string | null;
		imagePath: string | null;
		/** Top-level units here; accessories ride along with them. */
		units: Asset[];
		/** Of those, the ones out on a production right now. */
		out: Asset[];
	};
	type Column = {
		id: string;
		name: string;
		owner: string | null;
		/** A production's column (`byProduction`): no shelf, nothing is dropped on it. */
		production: { id: string | null } | null;
		cards: Card[];
		total: number;
	};

	function isOut(asset: Asset) {
		return !!asset.checkedOutTo;
	}

	/** A unit with the accessories that hang off it — every device a card stands for. */
	function deviceCount(units: Asset[]) {
		return units.reduce((sum, u) => sum + 1 + u.accessories.length, 0);
	}

	function unitMatches(a: Asset) {
		if (categoryId && a.product.category.id !== categoryId) return false;
		return matchSearch(
			a.product.name,
			a.product.caption,
			a.product.manufacturer?.name,
			a.product.cableType,
			a.product.connectorA,
			a.product.connectorB,
			a.assetTag,
			a.serialNumber,
			a.bundle?.template.name
		);
	}

	let columns = $derived.by<Column[]>(() => {
		const topLevel = assets.filter((a) => !a.parentAssetId);
		// The org's own locations, then any other org's that keeps some of its
		// units (a friend storing our things), named with that org.
		const byId: Record<string, Column> = {};
		for (const l of locations) {
			byId[l.id] = { id: l.id, name: l.name, owner: null, production: null, cards: [], total: 0 };
		}
		/** The column a unit is shown in: its shelf, or the production it is out on. */
		function columnIdOf(a: Asset) {
			if (!byProduction || !a.checkedOutTo) return a.locationId;
			// A production this user may not open has no id; its name stands in.
			return `production:${a.checkedOutTo.productionId ?? a.checkedOutTo.name}`;
		}
		for (const a of topLevel) {
			const id = columnIdOf(a);
			byId[id] ??=
				id === a.locationId
					? {
							id,
							name: a.location.name,
							owner: a.location.organizationId,
							production: null,
							cards: [],
							total: 0
						}
					: {
							id,
							name: a.checkedOutTo!.name,
							owner: null,
							production: { id: a.checkedOutTo!.productionId },
							cards: [],
							total: 0
						};
		}
		const cards: Record<string, Card> = {};
		for (const a of topLevel) {
			const columnId = columnIdOf(a);
			const column = byId[columnId];
			column.total += deviceCount([a]);
			if (show === 'here' && isOut(a)) continue;
			if (show === 'out' && !isOut(a)) continue;
			const kind = a.bundle ? 'bundle' : 'product';
			// Out units of a product get a card of their own, under the ones here.
			const key = a.bundle
				? `${columnId}|b|${a.bundle.id}`
				: `${columnId}|p|${a.productId}|${isOut(a) ? 'out' : 'here'}`;
			let card = cards[key];
			if (!card) {
				card = {
					key,
					kind,
					title: a.bundle ? a.bundle.template.name : a.product.name,
					caption: a.bundle ? a.bundle.template.caption : a.product.caption,
					subtitle: a.bundle ? null : (a.product.manufacturer?.name ?? null),
					imagePath: a.bundle ? a.bundle.imagePath : (a.generatedImagePath ?? a.product.imagePath),
					units: [],
					out: []
				};
				cards[key] = card;
				column.cards.push(card);
			}
			card.units.push(a);
			if (isOut(a)) card.out.push(a);
		}
		for (const column of Object.values(byId)) {
			// A production's column with nothing left after the filters is no column.
			if (column.production && column.cards.length === 0) delete byId[column.id];
			column.cards = column.cards
				// A kit is found by its name or by anything in it.
				.filter((card) =>
					card.kind === 'bundle'
						? (!categoryId && matchSearch(card.title, card.caption)) || card.units.some(unitMatches)
						: card.units.some(unitMatches)
				)
				.sort(
					(a, b) =>
						Number(allOut(a)) - Number(allOut(b)) ||
						Number(a.kind === 'product') - Number(b.kind === 'product') ||
						naturalCompare(a.title, b.title)
				);
		}
		// Shelves first, other orgs' shelves next, productions last.
		const rank = (c: Column) => (c.production ? 2 : c.owner ? 1 : 0);
		return Object.values(byId).sort((a, b) => rank(a) - rank(b) || naturalCompare(a.name, b.name));
	});

	function allOut(card: Card) {
		return card.units.length > 0 && card.out.length === card.units.length;
	}
	function movable(card: Card) {
		return card.units.filter((u) => !isOut(u));
	}

	const expanded = new SvelteSet<string>();

	// ── Moving ────────────────────────────────────────────────────────────────
	type Move = { card: Card; units: Asset[]; targetId: string; count: number };
	let move = $state<Move | null>(null);
	let moveOpen = $state(false);
	let moving = $state(false);
	let dragging = $state<{ card: Card; units: Asset[] } | null>(null);
	let dropTarget = $state<string | null>(null);

	// Where this user may put units at all — the org's own shelves, and any
	// other org's that lets them (`placeableLocationWhere`).
	let placeableQuery = $derived(getPlaceableLocations());
	let placeable = $derived(placeableQuery.current ?? []);
	function takesDrops(column: Column) {
		return placeable.some((l) => l.id === column.id);
	}
	/** Whose shelf another org's column is, from the locations this user may use. */
	function ownerName(organizationId: string) {
		const owner = placeable.find((l) => l.organizationId === organizationId)?.organization;
		return owner ? orgLabel(owner) : '';
	}
	/** The column on the right that is no location yet: a drop asks where to. */
	const ELSEWHERE = 'elsewhere';

	function startMove(card: Card, units: Asset[], targetId = '') {
		// A kit goes whole; a product row asks how many, starting at all of them.
		move = { card, units, targetId, count: units.length };
		if (card.kind === 'product' && units.length > 1) moveOpen = true;
		else if (targetId) void doMove();
		else moveOpen = true;
	}

	async function doMove() {
		if (!move || !move.targetId || moving) return;
		const target = placeable.find((l) => l.id === move!.targetId);
		const picked = move.card.kind === 'bundle' ? move.units : move.units.slice(0, move.count);
		if (picked.length === 0) return;
		moving = true;
		try {
			await checkoutAssets({
				assetIds: picked.map((u) => u.id),
				targetType: 'location',
				targetId: move.targetId
			}).updates(...EQUIPMENT_VIEWS);
			toast.success(
				`${plural(picked.length, ['1 device moved to', '# devices moved to'])} ${target?.name ?? ''}`
			);
			if (org) await getAssets(org.id).refresh();
			moveOpen = false;
			move = null;
		} catch (err) {
			toast.error(getErrorMessage(err));
		} finally {
			moving = false;
		}
	}

	function onDragStart(e: DragEvent, card: Card, units: Asset[]) {
		dragging = { card, units };
		e.dataTransfer?.setData('text/plain', card.key);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}
	function onDrop(e: DragEvent, column: Column) {
		e.preventDefault();
		dropTarget = null;
		const drag = dragging;
		dragging = null;
		if (!drag || !takesDrops(column)) return;
		if (drag.units.every((u) => u.locationId === column.id)) return;
		startMove(drag.card, drag.units, column.id);
	}
	function onDropElsewhere(e: DragEvent) {
		e.preventDefault();
		dropTarget = null;
		const drag = dragging;
		dragging = null;
		if (!drag) return;
		move = { card: drag.card, units: drag.units, targetId: '', count: drag.units.length };
		moveOpen = true;
	}

	// The board fills the window below the filters, and each column scrolls on
	// its own under a header that stays put — the page itself never scrolls
	// the location names away. Measured, since the filters wrap differently at
	// every width.
	let innerHeight = $state(0);
	let boardEl = $state<HTMLDivElement | null>(null);
	let boardTop = $state(0);
	$effect(() => {
		void innerHeight;
		if (boardEl) boardTop = boardEl.getBoundingClientRect().top + window.scrollY;
	});
	let boardHeight = $derived(Math.max(320, innerHeight - boardTop - 16));

	function unitLabel(u: Asset) {
		return u.assetTag ?? `#${u.orgIndex}`;
	}
</script>

<svelte:head><title>By Location | Technikpool</title></svelte:head>
<svelte:window bind:innerHeight />

<div class="space-y-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">By Location</h1>
			<p class="text-muted-foreground">
				Every location a column.{#if mayMove}
					Drag a card into another column to move it there.{/if}
			</p>
		</div>
		<Button variant="outline" href={resolve('assets')}>Devices list</Button>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<select
			bind:value={orgId}
			class="h-10 max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
			aria-label="Organization"
		>
			{#each orgs as o (o.id)}<option value={o.id}>{orgLabel(o)}</option>{/each}
		</select>
		<input
			type="search"
			bind:value={search}
			placeholder="Search…"
			class="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-64"
		/>
		<CategorySelect class="w-full sm:w-48" {categories} bind:value={categoryId} allowEmpty />
		<select
			bind:value={show}
			class="h-10 max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
			aria-label="Show"
		>
			<option value="all">Available and out on a production</option>
			<option value="here">Only available</option>
			<option value="out">Only out on a production</option>
		</select>
		<label class="flex h-10 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
			<input type="checkbox" bind:checked={byProduction} class="h-4 w-4 rounded border" />
			Show productions separately
		</label>
	</div>

	{#if !assetsQuery?.ready || !locationsQuery?.ready}
		<ContentSkeleton
			shape="cards"
			count={4}
			error={assetsQuery?.error ?? locationsQuery?.error ?? orgsQuery.error}
		/>
	{:else if columns.length === 0}
		<p class="text-sm text-muted-foreground">This organization has no locations yet.</p>
	{:else}
		<div
			bind:this={boardEl}
			class="-mx-4 overflow-x-auto px-4 pb-2"
			style:height={innerHeight ? `${boardHeight}px` : undefined}
		>
			<div class="flex h-full items-stretch gap-3">
				{#each columns as column (column.id)}
					<section
						class="flex h-full w-[85vw] shrink-0 flex-col rounded-lg border bg-muted/30 sm:w-72 lg:w-96 {dropTarget ===
						column.id
							? 'ring-2 ring-primary ring-inset'
							: ''}"
						aria-label={column.name}
						ondragover={(e) => {
							if (!dragging || !takesDrops(column)) return;
							e.preventDefault();
							dropTarget = column.id;
						}}
						ondragleave={() => {
							if (dropTarget === column.id) dropTarget = null;
						}}
						ondrop={(e) => onDrop(e, column)}
					>
						<header class="flex shrink-0 items-baseline justify-between gap-2 border-b px-3 py-2">
							<h2 class="min-w-0 truncate text-sm font-semibold">
								{#if column.production}
									<span class="block text-xs font-normal text-amber-700 dark:text-amber-400"
										>Out on a production</span
									>
									{#if column.production.id}
										<a
											href={resolve(`productions/${column.production.id}`)}
											class="underline-offset-2 hover:underline">{column.name}</a
										>
									{:else}
										{column.name}
									{/if}
								{:else}{column.name}{/if}{#if column.owner && ownerName(column.owner)}<span
										class="font-normal text-muted-foreground"
									>
										· at {ownerName(column.owner)}</span
									>{/if}
							</h2>
							<span class="shrink-0 text-xs text-muted-foreground">{column.total}</span>
						</header>
						<div class="flex min-h-0 flex-col gap-2 overflow-y-auto p-2">
							{#each column.cards as card (card.key)}
								{@const here = movable(card)}
								{@const open = expanded.has(card.key)}
								<article
									class="rounded-md border bg-background shadow-xs {allOut(card) &&
									!column.production
										? 'opacity-60'
										: ''} {mayMove && here.length > 0 ? 'cursor-grab' : ''}"
									draggable={mayMove && here.length > 0}
									ondragstart={(e) => onDragStart(e, card, here)}
									ondragend={() => {
										dragging = null;
										dropTarget = null;
									}}
								>
									<div class="flex items-start gap-2 p-2">
										<button
											type="button"
											class="flex min-w-0 flex-1 items-start gap-2 text-left"
											aria-expanded={open}
											onclick={() => (open ? expanded.delete(card.key) : expanded.add(card.key))}
										>
											<ProductThumb path={card.imagePath} alt={card.title} size={28} />
											<span class="min-w-0">
												<span class="block text-sm leading-tight font-medium">
													{#if card.kind === 'product'}
														<span class="text-muted-foreground">{card.units.length}×</span>
													{/if}
													{card.title}
												</span>
												{#if card.caption || card.subtitle}
													<span class="block truncate text-xs text-muted-foreground">
														{[card.subtitle, card.caption].filter(Boolean).join(' · ')}
													</span>
												{/if}
												{#if card.kind === 'bundle'}
													<span class="block text-xs text-muted-foreground">
														Bundle · {plural(deviceCount(card.units), ['1 device', '# devices'])}
													</span>
												{/if}
												{#if card.out.length > 0 && !column.production}
													<span class="block text-xs text-amber-700 dark:text-amber-400">
														{allOut(card) ? 'Out' : `${card.out.length} out`}: {[
															...new Set(card.out.map((u) => u.checkedOutTo?.name))
														].join(', ')}
													</span>
												{/if}
											</span>
										</button>
									</div>
									{#if open}
										<ul class="border-t px-2 py-1">
											{#each card.units as unit (unit.id)}
												<li
													class="flex items-center justify-between gap-2 py-0.5 text-xs {isOut(
														unit
													) && !column.production
														? 'text-muted-foreground'
														: ''}"
												>
													<a
														href={resolve(`assets/${unit.id}`)}
														class="min-w-0 truncate underline-offset-2 hover:underline"
													>
														<CableColorDot
															organizationId={unit.organizationId}
															lengthCm={unit.product.lengthCm}
														/>
														{#if card.kind === 'bundle'}{unit.product.name}
														{/if}<span class="font-mono">{unitLabel(unit)}</span>
														{#if unit.accessories.length > 0}
															<span class="text-muted-foreground"
																>+ {unit.accessories.map((x) => x.product.name).join(', ')}</span
															>
														{/if}
													</a>
													{#if isOut(unit) && !column.production}
														<span class="shrink-0 text-amber-700 dark:text-amber-400">out</span>
													{/if}
												</li>
											{/each}
										</ul>
									{/if}
								</article>
							{:else}
								<p class="px-1 py-2 text-xs text-muted-foreground">Nothing here.</p>
							{/each}
						</div>
					</section>
				{/each}
				{#if mayMove}
					<!-- Not a location: dropping here asks where to — another org's
					     shelf, say, which has no column until something is on it. -->
					<section
						class="flex w-[85vw] shrink-0 flex-col items-center justify-center gap-1 self-stretch rounded-lg border-2 border-dashed px-4 py-8 text-center sm:w-72 lg:w-96 {dropTarget ===
						ELSEWHERE
							? 'border-primary bg-primary/5'
							: ''}"
						aria-label="New location"
						ondragover={(e) => {
							if (!dragging) return;
							e.preventDefault();
							dropTarget = ELSEWHERE;
						}}
						ondragleave={() => {
							if (dropTarget === ELSEWHERE) dropTarget = null;
						}}
						ondrop={onDropElsewhere}
					>
						<h2 class="text-sm font-semibold">New location</h2>
						<p class="text-xs text-muted-foreground">
							Drop a card here to pick where it goes, another organization's location as well.
						</p>
					</section>
				{/if}
			</div>
		</div>
	{/if}
</div>

<Modal bind:open={moveOpen} title="Move to another location">
	{#snippet children()}
		{#if move}
			<div class="space-y-4">
				<p class="text-sm">
					{#if move.card.kind === 'bundle'}
						The whole bundle <strong>{move.card.title}</strong>, {plural(move.units.length, [
							'1 device',
							'# devices'
						])}.
					{:else}
						<strong>{move.card.title}</strong>
					{/if}
				</p>
				{#if move.card.kind === 'product' && move.units.length > 1}
					<div class="flex items-center justify-between gap-3">
						<span class="text-sm text-muted-foreground">How many</span>
						<CountStepper
							current={move.count}
							limit={move.units.length}
							min={1}
							onchange={(n) => move && (move.count = n)}
						/>
					</div>
				{/if}
				<label class="block space-y-1 text-sm">
					<span class="text-muted-foreground">New location</span>
					<LocationSelect
						locations={placeable}
						ownerOrgId={org?.id}
						bind:value={move.targetId}
						exclude={[...new Set(move.units.map((u) => u.locationId))].filter((id) =>
							move!.units.every((u) => u.locationId === id)
						)}
						placeholder="Choose a location"
					/>
				</label>
			</div>
		{/if}
	{/snippet}
	{#snippet footer()}
		<Button disabled={moving || !move?.targetId} onclick={doMove}>
			{moving ? 'Moving…' : 'Move'}
		</Button>
		<Button variant="outline" onclick={() => (moveOpen = false)}>Cancel</Button>
	{/snippet}
</Modal>
