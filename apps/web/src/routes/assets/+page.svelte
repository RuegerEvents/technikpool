<script lang="ts">
	import { categoryLabel } from '$lib/category';
	import { orgLabel } from '$lib/utils';
	import {
		connectorLabel,
		formatLength,
		isCable,
		parseLengthMeters,
		type CableAttrs
	} from '$lib/cable';
	import {
		getAssets,
		getCategories,
		getBundleTemplates,
		getRetiredAssets
	} from '$lib/remote/assets.remote';
	import { getMyOrgs } from '$lib/remote/orgs.remote';
	import { getLicenses } from '$lib/remote/licenses.remote';
	import { Button } from '$lib/components/ui/button';
	import { CategorySelect } from '$lib/components/ui/category-select';
	import { CategoryPill } from '$lib/components/ui/category-pill';
	import { ProductThumb } from '$lib/components/ui/product-thumb';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import BulkActionsBar from '$lib/components/ui/bulk-actions-bar.svelte';
	import CsvImportModal from '$lib/components/CsvImportModal.svelte';
	import { AssetStatusBadge, assetStatusLabel } from '$lib/components/ui/asset-status';
	import { SortableHeader } from '$lib/components/ui/sortable-header';
	import { ContentSkeleton } from '$lib/components/ui/skeleton';
	import LicenseList from './license-list.svelte';

	let showImportModal = $state(false);

	// Sold and decommissioned units are out of the pool, so they get their own
	// filter rather than a share of the normal list.
	const RETIRED_FILTER = 'RETIRED';

	const statusFilterOptions = [
		['', 'All'],
		['AVAILABLE', 'Available'],
		['UNAVAILABLE', 'Unavailable'],
		['MAINTENANCE', 'Maintenance'],
		['BROKEN', 'Broken'],
		[RETIRED_FILTER, 'Sold / Decommissioned']
	] as const;

	// The filters live in the query string, so clicking into an asset and coming
	// back lands on the list as it was left. Read once here; the effect below
	// writes changes back.
	const initial = page.url.searchParams;
	const initialStatus = initial.get('status') ?? '';

	let filterOrgId = $state(initial.get('org') ?? '');
	let searchQuery = $state(initial.get('q') ?? '');
	let statusFilter = $state(
		statusFilterOptions.some(([value]) => value === initialStatus) ? initialStatus : ''
	);
	let categoryFilter = $state(initial.get('category') ?? '');
	// What kind of thing is listed: devices, licenses or cables — and among the
	// cables, one type. One select, because the three exclude each other and a
	// cable type only means something once cables are what is being looked at.
	const kinds = ['devices', 'licenses', 'cables'] as const;
	type Kind = '' | (typeof kinds)[number];
	const initialKind = initial.get('kind');
	// Cable filters. Length is held as the metres someone typed, not centimetres:
	// it round-trips through the URL as what is in the box.
	const initialCableType = initial.get('ctype') ?? '';
	let cableTypeFilter = $state(initialCableType);
	let kindFilter = $state<Kind>(
		kinds.find((k) => k === initialKind) ?? (initialCableType ? 'cables' : '')
	);
	let connectorFilter = $state(initial.get('conn') ?? '');
	let lengthMin = $state(initial.get('lmin') ?? '');
	let lengthMax = $state(initial.get('lmax') ?? '');
	// Licenses get a list of their own rather than a share of the device tables:
	// the question there is who has one, which no other view answers.
	let showingLicenses = $derived(kindFilter === 'licenses');
	let showingCables = $derived(kindFilter === 'cables');
	// Bundles → products → single units, from most structure to least. `devices`
	// is one flat row per unit and only exists as a table: a photo wall of forty
	// identical lamps says nothing the product tile doesn't.
	const groupings = ['bundles', 'products', 'devices'] as const;
	type Grouping = (typeof groupings)[number];
	const initialGroup = initial.get('group');
	let grouping = $state<Grouping>(groupings.find((g) => g === initialGroup) ?? 'bundles');
	// A photo wall for browsing the catalogue; the table stays the working view.
	let layout = $state<'list' | 'grid'>(initial.get('view') === 'grid' ? 'grid' : 'list');
	// An empty key is each table's default order.
	let sortKey = $state(initial.get('sort') ?? '');
	let sortDir = $state<'asc' | 'desc'>(initial.get('dir') === 'desc' ? 'desc' : 'asc');
	let expanded = new SvelteMap<string, boolean>();
	let selectedAssetIds = new SvelteSet<string>();

	let showingRetired = $derived(statusFilter === RETIRED_FILTER);

	// replaceState, not a new history entry: every keystroke in the search box
	// would otherwise need its own Back press to get past.
	$effect(() => {
		const url = new URL(page.url);
		const params = {
			org: filterOrgId,
			q: searchQuery,
			status: statusFilter,
			category: categoryFilter,
			group: grouping === 'bundles' ? '' : grouping,
			view: layout === 'grid' ? 'grid' : '',
			kind: kindFilter,
			ctype: cableTypeFilter,
			conn: connectorFilter,
			lmin: lengthMin,
			lmax: lengthMax,
			sort: sortKey,
			dir: sortKey && sortDir === 'desc' ? 'desc' : ''
		};
		for (const [key, value] of Object.entries(params)) {
			if (value) url.searchParams.set(key, value);
			else url.searchParams.delete(key);
		}
		if (url.href === page.url.href) return;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- updating query params on the current route, not navigating to a typed path
		goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	});

	// Read through the queries rather than awaited: an `await` in a `$derived`
	// suspends the whole page until it answers — heading, filters and all — and
	// this one asks for every unit in the pool. See CLAUDE.md, "Loading states".
	let orgs = $derived(getMyOrgs().current ?? []);
	let assetsQuery = $derived(
		showingRetired
			? getRetiredAssets(filterOrgId || undefined)
			: getAssets(filterOrgId || undefined)
	);
	let assets = $derived(assetsQuery.current ?? []);
	let categories = $derived(getCategories().current ?? []);

	type Asset = Awaited<ReturnType<typeof getAssets>>[number];
	type TemplateData = Awaited<ReturnType<typeof getBundleTemplates>>[number];
	type BundleInstance = TemplateData['instances'][number];
	type BundleAsset = BundleInstance['assets'][number];

	// Grouping is independent of presentation: switching between list and grid
	// must not make kits disappear into their component product groups.
	let bundleGrouping = $derived(grouping === 'bundles' && !showingRetired);
	// Grid shows the product grouping instead of switching the layout away, so
	// going back to the table lands on the flat list again.
	let showingDevices = $derived(grouping === 'devices' && layout === 'list');

	let templates = $derived(
		bundleGrouping
			? (getBundleTemplates(filterOrgId || undefined).current ?? ([] as TemplateData[]))
			: ([] as TemplateData[])
	);

	type Group = {
		productId: string;
		name: string;
		imagePath: string | null;
		manufacturerName: string;
		categoryId: string;
		categoryName: string;
		categoryColor: string;
		cable: CableAttrs | null;
		available: number;
		unavailable: number;
		maintenance: number;
		broken: number;
		assets: Asset[];
	};

	type InstanceGroup = BundleInstance & {
		filteredAssets: BundleAsset[];
		locationLabel: string | null;
		available: number;
		unavailable: number;
		maintenance: number;
		broken: number;
	};

	type TemplateGroup = TemplateData & {
		instanceGroups: InstanceGroup[];
		locationLabel: string | null;
		totalAssets: number;
		// Bundle-instance counts (not asset counts) — how many physical kits of
		// this type are ready to send out vs. need attention.
		totalInstances: number;
		availableInstances: number;
		unavailableInstances: number;
		maintenanceInstances: number;
		brokenInstances: number;
	};

	// Bundle view is about top-level inventory structure. Components belonging to
	// a bundle appear under that bundle; attached accessories stay exclusive to
	// All Products, where they can be found and managed as individual units.
	let baseAssets = $derived(
		bundleGrouping ? assets.filter((a) => !a.bundleId && !a.parentAssetId) : assets
	);

	// A pool of lamps shouldn't grow a row of controls that can only ever match
	// nothing, so the cable filters appear once the pool holds a cable.
	let hasCables = $derived(assets.some((a) => isCable(a.product)));
	// From the license list itself rather than from `assets`: it also holds the
	// licenses another org lent to a production this user crews, which is how
	// they find the key without belonging to the org that keeps it.
	let hasLicenses = $derived((getLicenses(filterOrgId || undefined).current?.length ?? 0) > 0);

	// The select's value: a kind, or `ctype:<type>` for one cable type.
	let kindValue = $derived(cableTypeFilter ? `ctype:${cableTypeFilter}` : kindFilter);

	function setKind(value: string) {
		const type = value.startsWith('ctype:') ? value.slice('ctype:'.length) : '';
		const next: Kind = type ? 'cables' : (kinds.find((k) => k === value) ?? '');
		// Neither list's selection means anything in the other.
		if ((next === 'licenses') !== showingLicenses) selectedAssetIds.clear();
		kindFilter = next;
		cableTypeFilter = type;
		// The connector and length boxes go with the cables; left set, they would
		// keep filtering a list that no longer shows them.
		if (next !== 'cables') {
			connectorFilter = '';
			lengthMin = '';
			lengthMax = '';
		}
		if (next === 'licenses' && showingRetired) statusFilter = '';
	}
	const collator = new Intl.Collator('de', { numeric: true });
	let cableTypes = $derived(
		[...new Set(assets.map((a) => a.product.cableType).filter((t): t is string => !!t))].sort(
			collator.compare
		)
	);
	let connectors = $derived(
		[
			...new Set(
				assets
					.flatMap((a) => [a.product.connectorA, a.product.connectorB])
					.filter((c): c is string => !!c)
			)
		].sort(collator.compare)
	);

	let lengthMinCm = $derived(parseLengthMeters(lengthMin));
	let lengthMaxCm = $derived(parseLengthMeters(lengthMax));

	// A connector matches on either end: "everything with a TRUE1 on it" is the
	// question, and which end it is on is not something anyone knows in advance.
	function matchesKind(product: CableAttrs & { isLicense: boolean }) {
		if (kindFilter === 'devices') return !isCable(product) && !product.isLicense;
		if (kindFilter === 'cables') return isCable(product) && matchesCable(product);
		return true;
	}

	function matchesCable(product: CableAttrs) {
		if (cableTypeFilter && product.cableType !== cableTypeFilter) return false;
		if (
			connectorFilter &&
			product.connectorA !== connectorFilter &&
			product.connectorB !== connectorFilter
		) {
			return false;
		}
		if (lengthMinCm !== null && (product.lengthCm ?? -1) < lengthMinCm) return false;
		if (lengthMaxCm !== null && (product.lengthCm ?? Infinity) > lengthMaxCm) return false;
		return true;
	}

	let visibleAssets = $derived(
		baseAssets
			.filter((a) => (!statusFilter || showingRetired ? true : a.status === statusFilter))
			.filter((a) => (!categoryFilter ? true : a.product.categoryId === categoryFilter))
			.filter((a) => matchesKind(a.product))
	);

	let groups = $derived(
		Object.values(
			visibleAssets.reduce<Record<string, Group>>((acc, asset) => {
				const pid = asset.product.id;
				if (!acc[pid]) {
					acc[pid] = {
						productId: pid,
						name: asset.product.name,
						imagePath:
							bundleGrouping && asset.accessories.length > 0
								? (asset.generatedImagePath ?? asset.product.imagePath)
								: asset.product.imagePath,
						manufacturerName: asset.product.manufacturer.name,
						categoryId: asset.product.categoryId,
						categoryName: categoryLabel(asset.product.category),
						categoryColor: asset.product.category.color,
						cable: isCable(asset.product)
							? {
									cableType: asset.product.cableType,
									connectorA: asset.product.connectorA,
									connectorB: asset.product.connectorB,
									lengthCm: asset.product.lengthCm
								}
							: null,
						available: 0,
						unavailable: 0,
						maintenance: 0,
						broken: 0,
						assets: []
					};
				}
				const g = acc[pid];
				// Bundle View presents what travels as one unit. If another unit in
				// this product group is the first one with attached accessories, use
				// its generated composite as the representative group image.
				if (
					bundleGrouping &&
					asset.accessories.length > 0 &&
					!g.assets.some((member) => member.accessories.length > 0)
				) {
					g.imagePath = asset.generatedImagePath ?? asset.product.imagePath;
				}
				g.assets.push(asset);
				if (asset.status === 'AVAILABLE') g.available++;
				else if (asset.status === 'UNAVAILABLE') g.unavailable++;
				else if (asset.status === 'MAINTENANCE') g.maintenance++;
				else if (asset.status === 'BROKEN') g.broken++;
				return acc;
			}, {})
		)
	);

	let searchTrimmed = $derived(searchQuery.toLowerCase().trim());
	// Per unit, so the flat list can use it as it is. A product group matches when
	// any of its units does — everything a group row shows is taken from them.
	function assetMatchesSearch(a: Asset) {
		if (!searchTrimmed) return true;
		return [
			a.product.name,
			a.product.manufacturer.name,
			categoryLabel(a.product.category),
			a.product.cableType,
			a.product.connectorA,
			a.product.connectorB,
			a.serialNumber,
			a.assetTag,
			a.bundle?.template.name,
			orgLabel(a.organization),
			a.organization.name
		].some((v) => v?.toLowerCase().includes(searchTrimmed));
	}

	let filteredGroups = $derived(
		showingDevices ? [] : groups.filter((g) => g.assets.some(assetMatchesSearch))
	);

	// A header click sorts by that column, a second reverses it, a third goes back
	// to the default order. Both tables read the same key: a column they share
	// stays sorted across a switch, and one the other table lacks is ignored there.
	type SortValue = string | number | null;
	type SortColumns<T> = Record<string, (row: T) => SortValue>;

	function toggleSort(key: string) {
		if (sortKey !== key) {
			sortKey = key;
			sortDir = 'asc';
		} else if (sortDir === 'asc') {
			sortDir = 'desc';
		} else {
			sortKey = '';
		}
	}

	function sortDirection(key: string) {
		return sortKey === key ? sortDir : null;
	}

	// Blanks stay at the bottom in both directions: sorting a column is looking
	// for its values, and a descending sort shouldn't open on a page of dashes.
	// The sort is stable, so ties keep the default order.
	function sortRows<T>(rows: T[], columns: SortColumns<T>): T[] {
		const value = Object.hasOwn(columns, sortKey) ? columns[sortKey] : undefined;
		if (!value) return rows;
		const sign = sortDir === 'asc' ? 1 : -1;
		return [...rows].sort((a, b) => {
			const x = value(a);
			const y = value(b);
			if (x === null || x === '') return y === null || y === '' ? 0 : 1;
			if (y === null || y === '') return -1;
			if (typeof x === 'number' && typeof y === 'number') return sign * (x - y);
			return sign * collator.compare(String(x), String(y));
		});
	}

	const deviceColumns: SortColumns<Asset> = {
		tag: (a) => a.assetTag,
		product: (a) => a.product.name,
		manufacturer: (a) => a.product.manufacturer.name,
		serial: (a) => a.serialNumber,
		category: (a) => categoryLabel(a.product.category),
		// By what the badge says, so the order matches what is on screen.
		status: (a) => assetStatusLabel(a.status),
		// The column is hidden for retired units; a sort by it must not linger there.
		location: (a) => (showingRetired ? null : (a.location?.name ?? null)),
		organization: (a) => orgLabel(a.organization),
		bundle: (a) => a.bundle?.template.name ?? null
	};

	// Tag order by default rather than the server's product order: this is the
	// list tags get read off, and the natural sort keeps RE00010 after RE00009.
	// Untagged units go last and keep the server's order among themselves.
	let filteredDevices = $derived(
		!showingDevices
			? []
			: sortRows(
					visibleAssets.filter(assetMatchesSearch).sort((a, b) => {
						if (a.assetTag && b.assetTag) return collator.compare(a.assetTag, b.assetTag);
						if (a.assetTag || b.assetTag) return a.assetTag ? -1 : 1;
						return 0;
					}),
					deviceColumns
				)
	);

	// A row that stands for several units names the place they share, or says
	// that they don't. Read off the units rather than `AssetBundle.location`: a
	// case is wherever its contents are, and those get moved one at a time.
	// Units nobody has placed yet don't make the rest "mixed".
	function mixedLabel() {
		return 'Mixed';
	}

	function sharedLocation(units: { location: { name: string } | null }[]): string | null {
		const names = new Set(units.flatMap((u) => (u.location ? [u.location.name] : [])));
		if (names.size === 0) return null;
		if (names.size > 1) return mixedLabel();
		return [...names][0];
	}

	// Retired units have left their shelf, so the column stays a dash there.
	function groupLocation(group: Group): string | null {
		return showingRetired ? null : sharedLocation(group.assets);
	}

	// Bundles and products sort as one list, so sorting by Total puts the biggest
	// line first whichever kind it is; unsorted, bundles stay on top.
	type TableRow =
		| { kind: 'bundle'; key: string; template: TemplateGroup }
		| { kind: 'group'; key: string; group: Group };

	const tableColumns: SortColumns<TableRow> = {
		product: (r) => (r.kind === 'bundle' ? r.template.name : r.group.name),
		manufacturer: (r) => (r.kind === 'bundle' ? null : r.group.manufacturerName),
		location: (r) => (r.kind === 'bundle' ? r.template.locationLabel : groupLocation(r.group)),
		category: (r) => {
			if (r.kind === 'group') return r.group.categoryName;
			return r.template.category ? categoryLabel(r.template.category) : null;
		},
		total: (r) => (r.kind === 'bundle' ? r.template.totalInstances : r.group.assets.length),
		available: (r) => (r.kind === 'bundle' ? r.template.availableInstances : r.group.available),
		unavailable: (r) =>
			r.kind === 'bundle' ? r.template.unavailableInstances : r.group.unavailable,
		maintenance: (r) =>
			r.kind === 'bundle' ? r.template.maintenanceInstances : r.group.maintenance,
		broken: (r) => (r.kind === 'bundle' ? r.template.brokenInstances : r.group.broken)
	};

	let filteredBundles = $derived(
		!bundleGrouping
			? ([] as TemplateGroup[])
			: templates
					.map((t) => {
						const instanceGroups: InstanceGroup[] = t.instances.map((inst) => {
							const filteredAssets = inst.assets
								.filter((a) => !a.parentAssetId)
								.filter((a) => !statusFilter || a.status === statusFilter)
								.filter((a) => !categoryFilter || a.product.categoryId === categoryFilter)
								.filter((a) => matchesKind(a.product));
							return {
								...inst,
								filteredAssets,
								// Every unit in the case, not the filtered ones: a status
								// filter doesn't move anything. An empty case has only the
								// place it was given.
								locationLabel: sharedLocation(inst.assets) ?? inst.location?.name ?? null,
								available: filteredAssets.filter((a) => a.status === 'AVAILABLE').length,
								unavailable: filteredAssets.filter((a) => a.status === 'UNAVAILABLE').length,
								maintenance: filteredAssets.filter((a) => a.status === 'MAINTENANCE').length,
								broken: filteredAssets.filter((a) => a.status === 'BROKEN').length
							};
						});
						return {
							...t,
							instanceGroups,
							locationLabel: sharedLocation(t.instances.flatMap((inst) => inst.assets)),
							totalAssets: instanceGroups.reduce((sum, i) => sum + i.filteredAssets.length, 0),
							totalInstances: instanceGroups.length,
							availableInstances: instanceGroups.filter(
								(i) =>
									i.filteredAssets.length > 0 &&
									i.unavailable === 0 &&
									i.maintenance === 0 &&
									i.broken === 0
							).length,
							// A bundle is booked whole, so a single unit held back makes the whole
							// instance unbookable — that outranks a maintenance note elsewhere in it.
							unavailableInstances: instanceGroups.filter(
								(i) => i.broken === 0 && i.unavailable > 0
							).length,
							maintenanceInstances: instanceGroups.filter(
								(i) => i.broken === 0 && i.unavailable === 0 && i.maintenance > 0
							).length,
							brokenInstances: instanceGroups.filter((i) => i.broken > 0).length
						};
					})
					.filter((t) => {
						if (!searchTrimmed) return t.totalAssets > 0;
						if (t.name.toLowerCase().includes(searchTrimmed)) return true;
						if (t.instances.some((i) => i.tag?.toLowerCase().includes(searchTrimmed))) return true;
						// Search full asset list so bundles surface even when status/category filter hides the match
						return t.instances.some((inst) =>
							inst.assets
								.filter((a) => !a.parentAssetId)
								.some(
									(a) =>
										a.product.name.toLowerCase().includes(searchTrimmed) ||
										a.product.manufacturer.name.toLowerCase().includes(searchTrimmed) ||
										(a.serialNumber?.toLowerCase().includes(searchTrimmed) ?? false) ||
										(a.assetTag?.toLowerCase().includes(searchTrimmed) ?? false)
								)
						);
					})
	);

	let tableRows = $derived(
		sortRows<TableRow>(
			[
				...filteredBundles.map((template) => ({
					kind: 'bundle' as const,
					key: `bundle:${template.id}`,
					template
				})),
				...filteredGroups.map((group) => ({
					kind: 'group' as const,
					key: `product:${group.productId}`,
					group
				}))
			],
			tableColumns
		)
	);

	function toggle(id: string) {
		expanded.set(id, !expanded.get(id));
	}

	let allFilteredAssetIds = $derived([
		...filteredBundles.flatMap((t) =>
			t.instanceGroups.flatMap((i) => i.filteredAssets.map((a) => a.id))
		),
		...filteredGroups.flatMap((g) => g.assets.map((a) => a.id)),
		...filteredDevices.map((a) => a.id)
	]);
	let allFilteredSelected = $derived(
		allFilteredAssetIds.length > 0 && allFilteredAssetIds.every((id) => selectedAssetIds.has(id))
	);
	let someFilteredSelected = $derived(allFilteredAssetIds.some((id) => selectedAssetIds.has(id)));

	function toggleSelectAll() {
		if (allFilteredSelected) {
			allFilteredAssetIds.forEach((id) => selectedAssetIds.delete(id));
		} else {
			allFilteredAssetIds.forEach((id) => selectedAssetIds.add(id));
		}
	}

	function indeterminate(node: HTMLInputElement, value: boolean) {
		node.indeterminate = value;
		return {
			update(v: boolean) {
				node.indeterminate = v;
			}
		};
	}

	// Nothing in the retired list can be checked out, so a selection carried
	// across the filter would only offer an action the server refuses.
	function setStatusFilter(value: string) {
		if ((value === RETIRED_FILTER) !== showingRetired) selectedAssetIds.clear();
		statusFilter = value;
	}

	let hasResults = $derived(
		filteredBundles.length > 0 || filteredGroups.length > 0 || filteredDevices.length > 0
	);

	function toggleGroupSelection(assetIds: string[], allSelected: boolean) {
		if (allSelected) assetIds.forEach((id) => selectedAssetIds.delete(id));
		else assetIds.forEach((id) => selectedAssetIds.add(id));
	}

	function toggleAssetSelection(assetId: string) {
		if (selectedAssetIds.has(assetId)) selectedAssetIds.delete(assetId);
		else selectedAssetIds.add(assetId);
	}
</script>

<svelte:head><title>Devices | Technikpool</title></svelte:head>

<div class="space-y-6 {selectedAssetIds.size > 0 ? 'pb-20' : ''}">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Devices</h1>
			<p class="text-muted-foreground">
				{showingDevices
					? 'Every unit on its own row — click one to open it.'
					: 'Product catalog — click a row to see individual units.'}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<select
				bind:value={filterOrgId}
				class="h-10 max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
			>
				<option value="">All Organizations</option>
				{#each orgs as org (org.id)}<option value={org.id}>{orgLabel(org)}</option>{/each}
			</select>
			<Button variant="outline" onclick={() => (showImportModal = true)}>Import CSV</Button>
			<Button icon="add" variant="outline" href={resolve('/assets/bundles/new')}>Add Bundle</Button>
			<Button icon="add" variant="outline" href={resolve('/assets/new/cables')}>Add Cables</Button>
			<Button icon="add" href={resolve('/assets/new')}>Add Asset</Button>
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<input
			type="search"
			bind:value={searchQuery}
			placeholder="Search by product, manufacturer, S/N, tag, bundle…"
			class="h-10 w-full min-w-48 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none sm:w-64 sm:flex-none"
		/>
		<CategorySelect
			class="w-full sm:w-64"
			{categories}
			bind:value={categoryFilter}
			allowEmpty
			allLabel="All Categories"
		/>
		{#if hasCables || hasLicenses || kindFilter}
			<!-- Every cable is a kind of its own; one cable type narrows it further. -->
			<select
				value={kindValue}
				onchange={(e) => setKind((e.currentTarget as HTMLSelectElement).value)}
				class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
			>
				<option value="">All types</option>
				<option value="devices">Devices</option>
				{#if hasLicenses || showingLicenses}
					<option value="licenses">Licenses</option>
				{/if}
				{#if hasCables || showingCables}
					<option value="cables">Cables</option>
				{/if}
				{#if cableTypes.length > 0}
					<optgroup label="By cable type">
						{#each cableTypes as type (type)}<option value="ctype:{type}">{type}</option>{/each}
					</optgroup>
				{/if}
			</select>
		{/if}
		{#if hasCables && showingCables}
			<select
				bind:value={connectorFilter}
				class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
			>
				<option value="">Any connector</option>
				{#each connectors as conn (conn)}<option value={conn}>{conn}</option>{/each}
			</select>
			<input
				bind:value={lengthMin}
				inputmode="decimal"
				placeholder="min m"
				class="h-10 w-20 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
			/>
			<input
				bind:value={lengthMax}
				inputmode="decimal"
				placeholder="max m"
				class="h-10 w-20 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
			/>
		{/if}
		<div class="flex flex-wrap items-center gap-1 {showingLicenses ? 'hidden' : ''}">
			{#each statusFilterOptions as [val, label] (val)}
				<button
					type="button"
					onclick={() => setStatusFilter(val)}
					class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {statusFilter === val
						? 'bg-primary text-primary-foreground'
						: 'bg-muted text-muted-foreground hover:bg-muted/70'}">{label}</button
				>
			{/each}
		</div>
		<div class="flex flex-wrap items-center gap-3 sm:ml-auto {showingLicenses ? 'hidden' : ''}">
			<!-- Retired units have no bundles to group by, and the grid has no flat
			     list — so a button that could only fall back to another is left out. -->
			{#if !showingRetired || layout === 'list'}
				<div class="flex flex-wrap items-center gap-1">
					{#if !showingRetired}
						<button
							type="button"
							onclick={() => (grouping = 'bundles')}
							class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {bundleGrouping
								? 'bg-primary text-primary-foreground'
								: 'bg-muted text-muted-foreground hover:bg-muted/70'}">Bundle View</button
						>
					{/if}
					<button
						type="button"
						onclick={() => (grouping = 'products')}
						class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {!bundleGrouping &&
						!showingDevices
							? 'bg-primary text-primary-foreground'
							: 'bg-muted text-muted-foreground hover:bg-muted/70'}">All Products</button
					>
					{#if layout === 'list'}
						<button
							type="button"
							onclick={() => (grouping = 'devices')}
							class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {showingDevices
								? 'bg-primary text-primary-foreground'
								: 'bg-muted text-muted-foreground hover:bg-muted/70'}">All Devices</button
						>
					{/if}
				</div>
			{/if}
			<div class="flex overflow-hidden rounded-md border border-input">
				<button
					type="button"
					onclick={() => (layout = 'list')}
					title="List view"
					class="flex h-8 w-8 items-center justify-center transition-colors {layout === 'list'
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
				<button
					type="button"
					onclick={() => (layout = 'grid')}
					title="Grid view"
					class="flex h-8 w-8 items-center justify-center transition-colors {layout === 'grid'
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
			</div>
		</div>
	</div>

	<!-- What the name can't be trusted to say: the ends and the length, spelled
	     the same way on every row. -->
	{#snippet sharedLocationLabel(label: string | null)}
		{#if label === mixedLabel()}
			<span class="opacity-60">{label}</span>
		{:else}
			{label ?? '—'}
		{/if}
	{/snippet}

	{#snippet cableChips(cable: CableAttrs | null)}
		{#if cable}
			{@const ends = connectorLabel(cable)}
			{#if ends}<span class="rounded bg-muted px-1.5 py-0.5 text-xs">{ends}</span>{/if}
			{#if cable.lengthCm}
				<span class="rounded bg-muted px-1.5 py-0.5 text-xs">{formatLength(cable.lengthCm)}</span>
			{/if}
		{/if}
	{/snippet}

	{#if showingLicenses}
		<LicenseList
			organizationId={filterOrgId}
			search={searchQuery}
			categoryId={categoryFilter}
			selectedIds={selectedAssetIds}
		/>
	{:else if !assetsQuery.ready}
		<ContentSkeleton shape="table" count={10} />
	{:else if !hasResults}
		<div class="rounded-md border">
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<p class="text-lg font-medium">
					{assets.length === 0 ? 'No assets yet' : 'No results'}
				</p>
				<p class="text-sm text-muted-foreground">
					{assets.length === 0
						? 'Add assets to see your product catalog.'
						: 'Try a different search term or filter.'}
				</p>
				{#if assets.length === 0}
					<Button class="mt-4" variant="outline" href={resolve('/assets/new')}
						>Add your first asset</Button
					>
				{/if}
			</div>
		</div>
	{:else if showingDevices}
		<div class="overflow-x-auto rounded-md border">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b bg-muted/30">
						<th class="w-10 px-4 py-3">
							<input
								type="checkbox"
								checked={allFilteredSelected}
								use:indeterminate={someFilteredSelected && !allFilteredSelected}
								onclick={toggleSelectAll}
								class="h-4 w-4 cursor-pointer rounded border-input"
							/>
						</th>
						<SortableHeader direction={sortDirection('tag')} onclick={() => toggleSort('tag')}
							>Tag</SortableHeader
						>
						<SortableHeader
							direction={sortDirection('product')}
							onclick={() => toggleSort('product')}>Product</SortableHeader
						>
						<SortableHeader
							direction={sortDirection('manufacturer')}
							onclick={() => toggleSort('manufacturer')}>Manufacturer</SortableHeader
						>
						<SortableHeader direction={sortDirection('serial')} onclick={() => toggleSort('serial')}
							>Serial number</SortableHeader
						>
						<SortableHeader
							direction={sortDirection('category')}
							onclick={() => toggleSort('category')}>Category</SortableHeader
						>
						<SortableHeader direction={sortDirection('status')} onclick={() => toggleSort('status')}
							>Status</SortableHeader
						>
						{#if !showingRetired}
							<SortableHeader
								direction={sortDirection('location')}
								onclick={() => toggleSort('location')}>Location</SortableHeader
							>
						{/if}
						<SortableHeader
							direction={sortDirection('organization')}
							onclick={() => toggleSort('organization')}>Organization</SortableHeader
						>
						<SortableHeader direction={sortDirection('bundle')} onclick={() => toggleSort('bundle')}
							>Bundle</SortableHeader
						>
					</tr>
				</thead>
				<tbody>
					{#each filteredDevices as asset (asset.id)}
						<tr
							class="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
							onclick={() => goto(resolve(`/assets/${asset.id}`))}
						>
							<td class="px-4 py-2">
								<input
									type="checkbox"
									checked={selectedAssetIds.has(asset.id)}
									onclick={(e) => {
										e.stopPropagation();
										toggleAssetSelection(asset.id);
									}}
									class="h-4 w-4 cursor-pointer rounded border-input"
								/>
							</td>
							<td class="px-4 py-2 font-mono whitespace-nowrap">{asset.assetTag ?? '—'}</td>
							<td class="px-4 py-2">
								<div class="flex items-center gap-2">
									<ProductThumb path={asset.product.imagePath} alt={asset.product.name} size={24} />
									<div class="min-w-0">
										<div class="flex flex-wrap items-center gap-1.5">
											<span class="font-medium">{asset.product.name}</span>
											{@render cableChips(isCable(asset.product) ? asset.product : null)}
										</div>
										{#if asset.parent}
											<a
												href={resolve(`/assets/${asset.parent.id}`)}
												class="text-xs text-muted-foreground hover:underline"
												onclick={(e) => e.stopPropagation()}
											>
												↳ Accessory of {asset.parent.product.name}
											</a>
										{/if}
									</div>
								</div>
							</td>
							<td class="px-4 py-2 text-muted-foreground">{asset.product.manufacturer.name}</td>
							<td class="px-4 py-2 font-mono text-xs text-muted-foreground"
								>{asset.serialNumber ?? '—'}</td
							>
							<td class="px-4 py-2">
								<CategoryPill
									name={categoryLabel(asset.product.category)}
									color={asset.product.category.color}
								/>
							</td>
							<td class="px-4 py-2"><AssetStatusBadge status={asset.status} /></td>
							{#if !showingRetired}
								<td class="px-4 py-2 text-muted-foreground">{asset.location?.name ?? '—'}</td>
							{/if}
							<td class="px-4 py-2 text-muted-foreground">{orgLabel(asset.organization)}</td>
							<td class="px-4 py-2 text-muted-foreground">
								{#if asset.bundle}
									<a
										href={resolve(`/assets/bundles/${asset.bundle.id}`)}
										class="hover:underline"
										onclick={(e) => e.stopPropagation()}
									>
										{asset.bundle.template.name}
									</a>
								{:else}
									—
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if layout === 'grid'}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
			{#each filteredBundles as template (template.id)}
				{@const templateAssetIds = template.instanceGroups.flatMap((instance) =>
					instance.filteredAssets.map((asset) => asset.id)
				)}
				{@const allInTemplateSelected =
					templateAssetIds.length > 0 && templateAssetIds.every((id) => selectedAssetIds.has(id))}
				<div
					class="group relative flex flex-col overflow-hidden rounded-lg border transition-colors hover:border-foreground/25"
				>
					<input
						type="checkbox"
						checked={allInTemplateSelected}
						onchange={() => toggleGroupSelection(templateAssetIds, allInTemplateSelected)}
						title="Select all units in bundle"
						class="absolute top-2 left-2 z-10 h-4 w-4 cursor-pointer rounded border-input bg-background transition-opacity group-hover:opacity-100 focus:opacity-100 {allInTemplateSelected
							? ''
							: 'opacity-0'}"
					/>
					<button
						type="button"
						onclick={() => toggle(template.id)}
						class="flex flex-1 flex-col text-left"
					>
						<div class="flex aspect-[4/3] items-center justify-center bg-muted/30 p-4">
							<ProductThumb
								path={template.instanceGroups[0]?.imagePath}
								alt={template.name}
								fill
								class="border-0 bg-transparent p-0"
							/>
						</div>
						<div class="flex flex-1 flex-col gap-1 border-t p-3">
							<span class="text-sm leading-snug font-medium">{template.name}</span>
							<span class="text-xs text-muted-foreground">Bundle</span>
							<div class="mt-auto flex flex-wrap items-center gap-2 pt-2">
								{#if template.category}
									<CategoryPill
										name={categoryLabel(template.category)}
										color={template.category.color}
									/>
								{/if}
								<span class="ml-auto flex items-center gap-1.5 font-mono text-xs tabular-nums">
									<span class="text-green-700 dark:text-green-400" title="Available"
										>{template.availableInstances}</span
									>
									{#if template.unavailableInstances > 0}
										<span class="text-orange-600 dark:text-orange-400" title="Unavailable"
											>{template.unavailableInstances}</span
										>
									{/if}
									{#if template.maintenanceInstances > 0}
										<span class="text-yellow-600 dark:text-yellow-400" title="Maintenance"
											>{template.maintenanceInstances}</span
										>
									{/if}
									{#if template.brokenInstances > 0}
										<span class="text-red-600 dark:text-red-400" title="Broken"
											>{template.brokenInstances}</span
										>
									{/if}
									<span class="text-muted-foreground" title="Total"
										>/ {template.totalInstances}</span
									>
								</span>
							</div>
						</div>
					</button>
					{#if expanded.get(template.id)}
						<div class="max-h-56 overflow-y-auto border-t">
							{#each template.instanceGroups as instance, i (instance.id)}
								<a
									href={resolve(`/assets/bundles/${instance.id}`)}
									class="flex items-center gap-2 border-b px-3 py-2 text-xs last:border-0 hover:bg-muted/30"
								>
									<span class="min-w-0 flex-1 truncate font-medium">
										{instance.tag ?? `Instance ${i + 1}`}
									</span>
									{#if instance.locationLabel}
										<span class="truncate text-muted-foreground"
											>{@render sharedLocationLabel(instance.locationLabel)}</span
										>
									{/if}
									<span class="whitespace-nowrap text-muted-foreground"
										>{instance.filteredAssets.length} items</span
									>
								</a>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
			{#each filteredGroups as group (group.productId)}
				{@const groupAssetIds = group.assets.map((a) => a.id)}
				{@const allInGroupSelected =
					groupAssetIds.length > 0 && groupAssetIds.every((id) => selectedAssetIds.has(id))}
				<div
					class="group relative flex flex-col overflow-hidden rounded-lg border transition-colors hover:border-foreground/25"
				>
					<!-- The checkbox only appears on hover unless it is ticked: a photo
					     wall is for looking at, and a control on every tile competes
					     with the thing it sits on top of. -->
					<input
						type="checkbox"
						checked={allInGroupSelected}
						onchange={() => toggleGroupSelection(groupAssetIds, allInGroupSelected)}
						title="Select all units"
						class="absolute top-2 left-2 z-10 h-4 w-4 cursor-pointer rounded border-input bg-background transition-opacity group-hover:opacity-100 focus:opacity-100 {allInGroupSelected
							? ''
							: 'opacity-0'}"
					/>
					<button
						type="button"
						onclick={() => toggle(group.productId)}
						class="flex flex-1 flex-col text-left"
					>
						<div class="flex aspect-[4/3] items-center justify-center bg-muted/30 p-4">
							<ProductThumb
								path={group.imagePath}
								alt={group.name}
								fill
								class="border-0 bg-transparent p-0"
							/>
						</div>
						<div class="flex flex-1 flex-col gap-1 border-t p-3">
							<span class="text-sm leading-snug font-medium">{group.name}</span>
							<span class="text-xs text-muted-foreground">{group.manufacturerName}</span>
							{#if group.cable}
								<div class="flex flex-wrap items-center gap-1">
									{@render cableChips(group.cable)}
								</div>
							{/if}
							<div class="mt-auto flex flex-wrap items-center gap-2 pt-2">
								<CategoryPill name={group.categoryName} color={group.categoryColor} />
								<span class="ml-auto flex items-center gap-1.5 font-mono text-xs tabular-nums">
									<span class="text-green-700 dark:text-green-400" title="Available"
										>{group.available}</span
									>
									{#if group.unavailable > 0}
										<span class="text-orange-600 dark:text-orange-400" title="Unavailable"
											>{group.unavailable}</span
										>
									{/if}
									{#if group.maintenance > 0}
										<span class="text-yellow-600 dark:text-yellow-400" title="Maintenance"
											>{group.maintenance}</span
										>
									{/if}
									{#if group.broken > 0}
										<span class="text-red-600 dark:text-red-400" title="Broken">{group.broken}</span
										>
									{/if}
									<span class="text-muted-foreground" title="Total">/ {group.assets.length}</span>
								</span>
							</div>
						</div>
					</button>
					{#if expanded.get(group.productId)}
						<div class="max-h-56 overflow-y-auto border-t">
							{#each group.assets as asset (asset.id)}
								<div
									class="flex items-center gap-2 border-b px-3 py-1.5 text-xs last:border-0 hover:bg-muted/30"
								>
									<input
										type="checkbox"
										checked={selectedAssetIds.has(asset.id)}
										onchange={() => toggleAssetSelection(asset.id)}
										class="h-4 w-4 shrink-0 cursor-pointer rounded border-input"
									/>
									<a
										href={resolve(`/assets/${asset.id}`)}
										class="flex min-w-0 flex-1 items-center gap-2"
									>
										<span class="truncate font-mono text-muted-foreground">
											{asset.assetTag ?? asset.serialNumber ?? '—'}
										</span>
										<AssetStatusBadge status={asset.status} class="ml-auto shrink-0" />
									</a>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<div class="overflow-x-auto rounded-md border">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b bg-muted/30">
						<th class="w-10 px-4 py-3">
							<input
								type="checkbox"
								checked={allFilteredSelected}
								use:indeterminate={someFilteredSelected && !allFilteredSelected}
								onclick={toggleSelectAll}
								class="h-4 w-4 cursor-pointer rounded border-input"
							/>
						</th>
						<SortableHeader
							direction={sortDirection('product')}
							onclick={() => toggleSort('product')}>Product</SortableHeader
						>
						<SortableHeader
							direction={sortDirection('manufacturer')}
							onclick={() => toggleSort('manufacturer')}>Manufacturer</SortableHeader
						>
						<SortableHeader
							direction={sortDirection('location')}
							onclick={() => toggleSort('location')}>Location</SortableHeader
						>
						<SortableHeader
							direction={sortDirection('category')}
							onclick={() => toggleSort('category')}>Category</SortableHeader
						>
						<SortableHeader
							align="right"
							direction={sortDirection('total')}
							onclick={() => toggleSort('total')}>Total</SortableHeader
						>
						<SortableHeader
							align="right"
							direction={sortDirection('available')}
							onclick={() => toggleSort('available')}>Available</SortableHeader
						>
						<SortableHeader
							align="right"
							direction={sortDirection('unavailable')}
							onclick={() => toggleSort('unavailable')}>Unavail.</SortableHeader
						>
						<SortableHeader
							align="right"
							direction={sortDirection('maintenance')}
							onclick={() => toggleSort('maintenance')}>Maint.</SortableHeader
						>
						<SortableHeader
							align="right"
							direction={sortDirection('broken')}
							onclick={() => toggleSort('broken')}>Broken</SortableHeader
						>
					</tr>
				</thead>
				<tbody>
					{#each tableRows as row (row.key)}
						{#if row.kind === 'bundle'}
							{@const template = row.template}
							{@const templateAssetIds = template.instanceGroups.flatMap((i) =>
								i.filteredAssets.map((a) => a.id)
							)}
							{@const allInTemplateSelected =
								templateAssetIds.length > 0 &&
								templateAssetIds.every((id) => selectedAssetIds.has(id))}
							<tr
								class="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
								onclick={() => toggle(template.id)}
							>
								<td class="px-4 py-3">
									<input
										type="checkbox"
										checked={allInTemplateSelected}
										onclick={(e) => {
											e.stopPropagation();
											if (allInTemplateSelected) {
												templateAssetIds.forEach((id) => selectedAssetIds.delete(id));
											} else {
												templateAssetIds.forEach((id) => selectedAssetIds.add(id));
											}
										}}
										class="h-4 w-4 cursor-pointer rounded border-input"
									/>
								</td>
								<td class="px-4 py-3">
									<div class="flex items-center gap-2">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											class="shrink-0 text-muted-foreground transition-transform {expanded.get(
												template.id
											)
												? 'rotate-90'
												: ''}"
										>
											<path d="m9 18 6-6-6-6" />
										</svg>
										<ProductThumb
											path={template.instanceGroups[0]?.imagePath}
											alt={template.name}
											class="border-0 bg-transparent p-0"
										/>
										<span class="font-medium">{template.name}</span>
										<span
											class="rounded-full border border-border px-1.5 py-0.5 text-xs text-muted-foreground"
											>Bundle</span
										>
									</div>
								</td>
								<td class="px-4 py-3 text-muted-foreground">—</td>
								<td class="px-4 py-3 text-muted-foreground">
									{@render sharedLocationLabel(template.locationLabel)}
								</td>
								<td class="px-4 py-3">
									{#if template.category}
										<CategoryPill
											name={categoryLabel(template.category)}
											color={template.category.color}
										/>
									{/if}
								</td>
								<td class="px-4 py-3 text-right font-mono tabular-nums">
									{template.totalInstances}
								</td>
								<td
									class="px-4 py-3 text-right font-mono text-green-700 tabular-nums dark:text-green-400"
								>
									{template.availableInstances}
								</td>
								<td
									class="px-4 py-3 text-right font-mono tabular-nums {template.unavailableInstances >
									0
										? 'text-orange-600 dark:text-orange-400'
										: 'text-muted-foreground'}"
								>
									{template.unavailableInstances}
								</td>
								<td
									class="px-4 py-3 text-right font-mono tabular-nums {template.maintenanceInstances >
									0
										? 'text-yellow-600 dark:text-yellow-400'
										: 'text-muted-foreground'}"
								>
									{template.maintenanceInstances}
								</td>
								<td
									class="px-4 py-3 text-right font-mono tabular-nums {template.brokenInstances > 0
										? 'text-red-600 dark:text-red-400'
										: 'text-muted-foreground'}"
								>
									{template.brokenInstances}
								</td>
							</tr>
							{#if expanded.get(template.id)}
								{#each template.instanceGroups as instance, i (instance.id)}
									{@const instanceAssetIds = instance.filteredAssets.map((a) => a.id)}
									{@const allInInstanceSelected =
										instanceAssetIds.length > 0 &&
										instanceAssetIds.every((id) => selectedAssetIds.has(id))}
									<tr
										class="cursor-pointer border-b bg-muted/10 transition-colors last:border-0 hover:bg-muted/30"
										onclick={() => toggle(instance.id)}
									>
										<td class="px-4 py-2">
											<input
												type="checkbox"
												checked={allInInstanceSelected}
												onclick={(e) => {
													e.stopPropagation();
													if (allInInstanceSelected) {
														instanceAssetIds.forEach((id) => selectedAssetIds.delete(id));
													} else {
														instanceAssetIds.forEach((id) => selectedAssetIds.add(id));
													}
												}}
												class="h-4 w-4 cursor-pointer rounded border-input"
											/>
										</td>
										<!-- The same columns as the row above, one step in: a strip of
										     its own lined up with nothing, and the counts are the ones
										     the header already names. Total is what the row holds —
										     cases for a bundle type, units for a case. -->
										<td class="py-2 pr-4 pl-10">
											<div class="flex items-center gap-2">
												<svg
													xmlns="http://www.w3.org/2000/svg"
													width="12"
													height="12"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round"
													class="shrink-0 text-muted-foreground transition-transform {expanded.get(
														instance.id
													)
														? 'rotate-90'
														: ''}"
												>
													<path d="m9 18 6-6-6-6" />
												</svg>
												<ProductThumb
													path={instance.imagePath}
													alt={instance.tag ?? template.name}
													size={24}
													class="border-0 bg-transparent p-0"
												/>
												<span class="truncate font-mono text-xs font-medium">
													{instance.tag ?? `Instance ${i + 1}`}
												</span>
												<a
													href={resolve(`/assets/bundles/${instance.id}`)}
													class="text-xs whitespace-nowrap text-muted-foreground hover:text-foreground"
													onclick={(e) => e.stopPropagation()}
												>
													View →
												</a>
											</div>
										</td>
										<td class="px-4 py-2"></td>
										<td class="px-4 py-2 text-xs text-muted-foreground">
											{@render sharedLocationLabel(instance.locationLabel)}
										</td>
										<td class="px-4 py-2"></td>
										<td class="px-4 py-2 text-right font-mono text-xs tabular-nums">
											{instance.filteredAssets.length}
										</td>
										<td
											class="px-4 py-2 text-right font-mono text-xs text-green-700 tabular-nums dark:text-green-400"
										>
											{instance.available}
										</td>
										<td
											class="px-4 py-2 text-right font-mono text-xs tabular-nums {instance.unavailable >
											0
												? 'text-orange-600 dark:text-orange-400'
												: 'text-muted-foreground'}"
										>
											{instance.unavailable}
										</td>
										<td
											class="px-4 py-2 text-right font-mono text-xs tabular-nums {instance.maintenance >
											0
												? 'text-yellow-600 dark:text-yellow-400'
												: 'text-muted-foreground'}"
										>
											{instance.maintenance}
										</td>
										<td
											class="px-4 py-2 text-right font-mono text-xs tabular-nums {instance.broken >
											0
												? 'text-red-600 dark:text-red-400'
												: 'text-muted-foreground'}"
										>
											{instance.broken}
										</td>
									</tr>
									{#if expanded.get(instance.id)}
										{#each instance.filteredAssets as asset (asset.id)}
											<tr
												class="cursor-pointer border-b bg-muted/20 transition-colors last:border-0 hover:bg-muted/40"
												onclick={() => goto(resolve(`/assets/${asset.id}`))}
											>
												<td class="px-4 py-2 pl-8">
													<input
														type="checkbox"
														checked={selectedAssetIds.has(asset.id)}
														onclick={(e) => {
															e.stopPropagation();
															if (selectedAssetIds.has(asset.id)) {
																selectedAssetIds.delete(asset.id);
															} else {
																selectedAssetIds.add(asset.id);
															}
														}}
														class="h-4 w-4 cursor-pointer rounded border-input"
													/>
												</td>
												<td class="py-2 pr-4 pl-16">
													<div class="flex items-center gap-2">
														<ProductThumb
															path={asset.product.imagePath}
															alt={asset.product.name}
															size={22}
														/>
														<span class="truncate text-xs font-medium">
															{asset.product.name}
														</span>
														{#if asset.assetTag}
															<span
																class="font-mono text-xs whitespace-nowrap text-muted-foreground"
															>
																{asset.assetTag}
															</span>
														{/if}
													</div>
												</td>
												<td class="px-4 py-2 text-xs text-muted-foreground">
													{asset.product.manufacturer.name}
												</td>
												<td class="px-4 py-2 text-xs text-muted-foreground">
													{asset.location?.name ?? '—'}
												</td>
												<td class="px-4 py-2">
													<CategoryPill
														name={categoryLabel(asset.product.category)}
														color={asset.product.category.color}
													/>
												</td>
												<!-- One unit has a status, not five counts. -->
												<td colspan="5" class="px-4 py-2">
													<div class="flex items-center justify-end gap-4">
														{#if asset.serialNumber}
															<span class="truncate font-mono text-xs text-muted-foreground">
																S/N: {asset.serialNumber}
															</span>
														{/if}
														<AssetStatusBadge status={asset.status} />
														<a
															href={resolve(`/assets/${asset.id}`)}
															class="text-xs whitespace-nowrap text-muted-foreground hover:text-foreground"
															onclick={(e) => e.stopPropagation()}
														>
															View →
														</a>
													</div>
												</td>
											</tr>
										{/each}
									{/if}
								{/each}
							{/if}
						{:else}
							{@const group = row.group}
							{@const groupAssetIds = group.assets.map((a) => a.id)}
							{@const allInGroupSelected =
								groupAssetIds.length > 0 && groupAssetIds.every((id) => selectedAssetIds.has(id))}
							<tr
								class="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/30"
								onclick={() => toggle(group.productId)}
							>
								<td class="px-4 py-3">
									<input
										type="checkbox"
										checked={allInGroupSelected}
										onclick={(e) => {
											e.stopPropagation();
											if (allInGroupSelected) {
												groupAssetIds.forEach((id) => selectedAssetIds.delete(id));
											} else {
												groupAssetIds.forEach((id) => selectedAssetIds.add(id));
											}
										}}
										class="h-4 w-4 cursor-pointer rounded border-input"
									/>
								</td>
								<td class="px-4 py-3">
									<div class="flex items-center gap-2">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											class="shrink-0 text-muted-foreground transition-transform {expanded.get(
												group.productId
											)
												? 'rotate-90'
												: ''}"
										>
											<path d="m9 18 6-6-6-6" />
										</svg>
										<ProductThumb path={group.imagePath} alt={group.name} />
										<span class="font-medium">{group.name}</span>
										{@render cableChips(group.cable)}
									</div>
								</td>
								<td class="px-4 py-3 text-muted-foreground">{group.manufacturerName}</td>
								<td class="px-4 py-3 text-muted-foreground">
									{@render sharedLocationLabel(groupLocation(group))}
								</td>
								<td class="px-4 py-3">
									<CategoryPill name={group.categoryName} color={group.categoryColor} />
								</td>
								<td class="px-4 py-3 text-right font-mono tabular-nums">
									{group.assets.length}
								</td>
								<td
									class="px-4 py-3 text-right font-mono text-green-700 tabular-nums dark:text-green-400"
								>
									{group.available}
								</td>
								<td
									class="px-4 py-3 text-right font-mono tabular-nums {group.unavailable > 0
										? 'text-orange-600 dark:text-orange-400'
										: 'text-muted-foreground'}"
								>
									{group.unavailable}
								</td>
								<td
									class="px-4 py-3 text-right font-mono tabular-nums {group.maintenance > 0
										? 'text-yellow-600 dark:text-yellow-400'
										: 'text-muted-foreground'}"
								>
									{group.maintenance}
								</td>
								<td
									class="px-4 py-3 text-right font-mono tabular-nums {group.broken > 0
										? 'text-red-600 dark:text-red-400'
										: 'text-muted-foreground'}"
								>
									{group.broken}
								</td>
							</tr>
							{#if expanded.get(group.productId)}
								{#each group.assets as asset (asset.id)}
									<tr
										class="cursor-pointer border-b bg-muted/10 transition-colors last:border-0 hover:bg-muted/30"
										onclick={() => goto(resolve(`/assets/${asset.id}`))}
									>
										<td class="px-4 py-2">
											<input
												type="checkbox"
												checked={selectedAssetIds.has(asset.id)}
												onclick={(e) => {
													e.stopPropagation();
													if (selectedAssetIds.has(asset.id)) {
														selectedAssetIds.delete(asset.id);
													} else {
														selectedAssetIds.add(asset.id);
													}
												}}
												class="h-4 w-4 cursor-pointer rounded border-input"
											/>
										</td>
										<!-- Product, manufacturer and category are the row above; what
										     tells two units apart is the tag and the serial number. -->
										<td colspan="2" class="py-2 pr-4 pl-10">
											<div class="flex items-center gap-4 text-xs">
												<span class="font-mono font-medium whitespace-nowrap">
													{asset.assetTag ?? '—'}
												</span>
												{#if asset.serialNumber}
													<span class="truncate font-mono text-muted-foreground">
														S/N: {asset.serialNumber}
													</span>
												{/if}
												<!-- An accessory still belongs in this listing — it gets
											     inspected like anything else — but what it hangs off is
											     the first thing you need to know about it. -->
												{#if asset.parent}
													<a
														href={resolve(`/assets/${asset.parent.id}`)}
														class="text-muted-foreground hover:underline"
														onclick={(e) => e.stopPropagation()}
													>
														↳ Accessory of {asset.parent.product.name}
													</a>
												{/if}
											</div>
										</td>
										<td class="px-4 py-2 text-xs text-muted-foreground">
											{showingRetired ? '—' : (asset.location?.name ?? '—')}
										</td>
										<td colspan="6" class="px-4 py-2">
											<div class="flex items-center gap-4 text-xs text-muted-foreground">
												<span class="truncate">{orgLabel(asset.organization)}</span>
												{#if asset.bundle}
													<a
														href={resolve(`/assets/bundles/${asset.bundle.id}`)}
														class="truncate hover:underline"
														onclick={(e) => e.stopPropagation()}
													>
														{asset.bundle.template.name}
													</a>
												{/if}
												<span class="ml-auto"><AssetStatusBadge status={asset.status} /></span>
												<a
													href={resolve(`/assets/${asset.id}`)}
													class="whitespace-nowrap hover:text-foreground"
													onclick={(e) => e.stopPropagation()}
												>
													View →
												</a>
											</div>
										</td>
									</tr>
								{/each}
							{/if}
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<!-- The retired list keeps the bar for its status half: setting a unit back to
     AVAILABLE is the only way out of sold/decommissioned, and doing it one row
     at a time is the wrong tool for a shelf that was written off in a batch. -->
<BulkActionsBar
	selectedIds={selectedAssetIds}
	onClear={() => selectedAssetIds.clear()}
	canCheckout={!showingRetired}
	canSetStatus
/>

{#if showImportModal}
	<CsvImportModal onClose={() => (showImportModal = false)} />
{/if}
