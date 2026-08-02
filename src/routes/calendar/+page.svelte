<script lang="ts">
	/* eslint-disable svelte/prefer-svelte-reactivity */
	import { getCalendarData, getProductionsCalendar } from '$lib/remote/productions.remote';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { OrgBadge } from '$lib/components/ui/org-badge';
	import { FilterPopover } from '$lib/components/ui/filter-popover';

	type Granularity = 'day' | 'week' | 'month' | 'year';
	type ViewMode = 'assets' | 'productions';

	let rawData = $derived(await getCalendarData());
	let prodCalData = $derived(await getProductionsCalendar());

	// View state is persisted in URL query params (?view=&mode=&date=&orgs=) so
	// a refresh or shared link keeps the same view.
	function updateUrl(params: Record<string, string | null>) {
		const url = new URL(page.url);
		for (const [k, v] of Object.entries(params)) {
			if (v === null) url.searchParams.delete(k);
			else url.searchParams.set(k, v);
		}
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- updating query params on the current route, not navigating to a typed path
		goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	const GRANULARITIES: Granularity[] = ['day', 'week', 'month', 'year'];
	const VIEW_MODES: ViewMode[] = ['assets', 'productions'];

	function parseDateParam(v: string | null): Date | null {
		if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
		const [y, m, d] = v.split('-').map(Number);
		const parsed = new Date(y, m - 1, d);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	function dateParam(d: Date): string {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
			d.getDate()
		).padStart(2, '0')}`;
	}

	const initialGranularity = page.url.searchParams.get('view');
	let granularity = $state<Granularity>(
		GRANULARITIES.includes(initialGranularity as Granularity)
			? (initialGranularity as Granularity)
			: 'week'
	);
	const initialViewMode = page.url.searchParams.get('mode');
	let viewMode = $state<ViewMode>(
		VIEW_MODES.includes(initialViewMode as ViewMode) ? (initialViewMode as ViewMode) : 'assets'
	);
	let expandedProducts = $state(new Set<string>());
	let viewDate = $state(parseDateParam(page.url.searchParams.get('date')) ?? new Date());

	function setGranularity(g: Granularity) {
		granularity = g;
		updateUrl({ view: g });
	}

	function setViewMode(m: ViewMode) {
		viewMode = m;
		updateUrl({ mode: m });
	}

	function setViewDate(d: Date) {
		viewDate = d;
		updateUrl({ date: dateParam(d) });
	}

	// Org filter (assets mode only) — persisted in the ?orgs= URL query param.
	let selectedOrgIds = $state(new Set<string>(page.url.searchParams.get('orgs')?.split(',') ?? []));
	let availableOrgs = $derived.by(() => {
		const seen = new Map<
			string,
			{ id: string; name: string; color: string; avatarLabel: string }
		>();
		for (const a of rawData) {
			if (!seen.has(a.organization.id)) {
				seen.set(a.organization.id, {
					id: a.organization.id,
					name: a.organization.name,
					color: a.organization.color,
					avatarLabel: a.organization.avatarLabel
				});
			}
		}
		return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
	});
	let filteredData = $derived(
		selectedOrgIds.size === 0
			? rawData
			: rawData.filter((a) => selectedOrgIds.has(a.organization.id))
	);

	function toggleOrgFilter(orgId: string) {
		const next = new Set(selectedOrgIds);
		if (next.has(orgId)) next.delete(orgId);
		else next.add(orgId);
		selectedOrgIds = next;
		updateUrl({ orgs: next.size === 0 ? null : [...next].join(',') });
	}

	let scrollEl = $state<HTMLDivElement | null>(null);
	let scrollLeft = $state(0);
	let viewportWidth = $state(900);

	// Tracks the hovered event across week rows (month/year views split a
	// multi-week event into a separate bar per row, so CSS-only :hover can't
	// span them — this drives the "highlight the whole event" behavior instead.
	let hoveredEventId = $state<string | null>(null);

	const SIDEBAR = 220;
	const ROW_H = 36;
	const PRODUCT_H = 28;
	const MS_DAY = 86_400_000;
	const BUFFER = 5;

	// Month grid view constants
	const DAY_NUM_H = 28;
	const MONTH_BAR_H = 18;
	const MONTH_BAR_GAP = 2;

	// Year grid view constants
	const YEAR_DAY_NUM_H = 10;
	const YEAR_BAR_H = 4;
	const YEAR_BAR_GAP = 1;

	const colWidth = $derived(granularity === 'day' ? 40 : 120);

	function startOfDay(d: Date): Date {
		const r = new Date(d);
		r.setHours(0, 0, 0, 0);
		return r;
	}

	function startOfWeek(d: Date): Date {
		const r = startOfDay(d);
		const dow = r.getDay();
		r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
		return r;
	}

	function snapToCol(d: Date): Date {
		return granularity === 'day' ? startOfDay(d) : startOfWeek(d);
	}

	let timelineStart = $derived.by(() => {
		const d = new Date();
		d.setFullYear(d.getFullYear() - 3);
		return snapToCol(d);
	});

	let timelineEnd = $derived.by(() => {
		const d = new Date();
		d.setFullYear(d.getFullYear() + 3);
		return snapToCol(d);
	});

	let totalCols = $derived.by(() => {
		const unit = granularity === 'day' ? MS_DAY : MS_DAY * 7;
		return Math.ceil((timelineEnd.getTime() - timelineStart.getTime()) / unit) + 2;
	});

	let totalWidth = $derived(totalCols * colWidth);

	let firstCol = $derived(Math.max(0, Math.floor(scrollLeft / colWidth) - BUFFER));
	let lastCol = $derived(
		Math.min(totalCols - 1, Math.ceil((scrollLeft + viewportWidth) / colWidth) + BUFFER)
	);
	let visibleCols = $derived(
		Array.from({ length: Math.max(0, lastCol - firstCol + 1) }, (_, i) => firstCol + i)
	);

	function colDate(i: number): Date {
		const d = new Date(timelineStart);
		if (granularity === 'day') d.setDate(d.getDate() + i);
		else d.setDate(d.getDate() + i * 7);
		return d;
	}

	function dateToX(d: Date): number {
		const unit = granularity === 'day' ? MS_DAY : MS_DAY * 7;
		return ((d.getTime() - timelineStart.getTime()) / unit) * colWidth;
	}

	function barDims(rawStart: Date | string, rawEnd: Date | string) {
		const s = new Date(rawStart);
		const e = new Date(rawEnd);
		e.setDate(e.getDate() + 1);
		const left = dateToX(s);
		const width = Math.max(colWidth * 0.5, dateToX(e) - left);
		return { left, width };
	}

	// Adds the show-day sub-range (clamped within start/end) to a bar's pixel
	// dims, so the Gantt view can render get-in/get-out days distinctly from
	// the actual show days.
	function barDimsWithShow(
		start: Date | string,
		end: Date | string,
		showStart: Date | string | null,
		showEnd: Date | string | null
	) {
		const s = new Date(start);
		const e = new Date(end);
		const ss = showStart
			? new Date(Math.min(Math.max(new Date(showStart).getTime(), s.getTime()), e.getTime()))
			: s;
		const se = showEnd
			? new Date(Math.min(Math.max(new Date(showEnd).getTime(), ss.getTime()), e.getTime()))
			: e;
		const show = barDims(ss, se);
		return { ...barDims(s, e), showLeft: show.left, showWidth: show.width };
	}

	type GanttSegment = {
		left: number;
		width: number;
		kind: 'setup' | 'show';
		roundedLeft: boolean;
		roundedRight: boolean;
	};

	function ganttSegments(bar: {
		left: number;
		width: number;
		showLeft: number;
		showWidth: number;
	}): GanttSegment[] {
		const setupBefore = bar.showLeft - bar.left;
		const setupAfter = bar.left + bar.width - (bar.showLeft + bar.showWidth);
		if (setupBefore < 1 && setupAfter < 1) {
			return [
				{ left: bar.left, width: bar.width, kind: 'show', roundedLeft: true, roundedRight: true }
			];
		}
		const segs: GanttSegment[] = [];
		if (setupBefore >= 1) {
			segs.push({
				left: bar.left,
				width: setupBefore,
				kind: 'setup',
				roundedLeft: true,
				roundedRight: false
			});
		}
		segs.push({
			left: bar.showLeft,
			width: bar.showWidth,
			kind: 'show',
			roundedLeft: setupBefore < 1,
			roundedRight: setupAfter < 1
		});
		if (setupAfter >= 1) {
			segs.push({
				left: bar.showLeft + bar.showWidth,
				width: setupAfter,
				kind: 'setup',
				roundedLeft: false,
				roundedRight: true
			});
		}
		return segs;
	}

	const COLORS = [
		'#3b82f6',
		'#10b981',
		'#f59e0b',
		'#8b5cf6',
		'#ef4444',
		'#06b6d4',
		'#f97316',
		'#84cc16'
	];

	function prodColor(id: string): string {
		let h = 0;
		for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
		return COLORS[h % COLORS.length];
	}

	type Bar = {
		id: string;
		productionId: string;
		label: string;
		left: number;
		width: number;
		showLeft: number;
		showWidth: number;
		color: string;
		pending: boolean;
	};
	type CollapsedBar = {
		productionId: string;
		label: string;
		left: number;
		width: number;
		showLeft: number;
		showWidth: number;
		color: string;
		fraction: number;
		allPending: boolean;
	};
	type HeaderRow = {
		kind: 'header';
		id: string;
		name: string;
		mfr: string;
		count: number;
		collapsed: boolean;
		collapsedBars: CollapsedBar[];
	};
	type AssetRow = {
		kind: 'asset';
		id: string;
		label: string;
		org: string;
		orgInfo?: { id: string; name: string; color: string; avatarLabel: string };
		bars: Bar[];
	};
	type ProdRow = { kind: 'prod'; id: string; name: string; start: Date; end: Date; bars: Bar[] };
	type Row = HeaderRow | AssetRow | ProdRow;

	let displayRows = $derived.by((): Row[] => {
		if (viewMode === 'productions') {
			return prodCalData.map((p): ProdRow => ({
				kind: 'prod',
				id: p.id,
				name: p.name,
				start: new Date(p.startDate!),
				end: new Date(p.endDate!),
				bars: [
					{
						id: p.id,
						productionId: p.id,
						label: p.name,
						...barDimsWithShow(p.startDate!, p.endDate!, p.showStartDate, p.showEndDate),
						color: prodColor(p.id),
						pending: false
					}
				]
			}));
		}

		const rows: Row[] = [];
		const byBundle = new Map<string, { name: string; assets: typeof rawData }>();
		const byProduct = new Map<string, { name: string; mfr: string; assets: typeof rawData }>();

		for (const a of filteredData) {
			if (a.bundle) {
				if (!byBundle.has(a.bundle.id))
					byBundle.set(a.bundle.id, { name: a.bundle.name, assets: [] });
				byBundle.get(a.bundle.id)!.assets.push(a);
			} else {
				const pid = a.product.id;
				if (!byProduct.has(pid))
					byProduct.set(pid, {
						name: a.product.name,
						mfr: a.product.manufacturer.name,
						assets: []
					});
				byProduct.get(pid)!.assets.push(a);
			}
		}

		function addGroupRows(
			groupId: string,
			groupName: string,
			mfr: string,
			assets: typeof rawData,
			isBundle: boolean
		) {
			const collapsed = !expandedProducts.has(groupId);
			const prodAgg = new Map<
				string,
				{
					label: string;
					start: Date;
					end: Date;
					showStart: Date | null;
					showEnd: Date | null;
					count: number;
					pendingCount: number;
				}
			>();
			for (const a of assets) {
				for (const pi of a.productionItems) {
					if (!pi.production.startDate || !pi.production.endDate) continue;
					if (!prodAgg.has(pi.production.id))
						prodAgg.set(pi.production.id, {
							label: pi.production.name,
							start: new Date(pi.production.startDate),
							end: new Date(pi.production.endDate),
							showStart: pi.production.showStartDate,
							showEnd: pi.production.showEndDate,
							count: 0,
							pendingCount: 0
						});
					prodAgg.get(pi.production.id)!.count++;
					if (pi.status === 'PENDING') prodAgg.get(pi.production.id)!.pendingCount++;
				}
			}
			const collapsedBars: CollapsedBar[] = [...prodAgg.entries()].map(([id, p]) => ({
				productionId: id,
				label: p.label,
				...barDimsWithShow(p.start, p.end, p.showStart, p.showEnd),
				color: prodColor(id),
				fraction: p.count / assets.length,
				allPending: p.pendingCount === p.count
			}));
			rows.push({
				kind: 'header',
				id: groupId,
				name: groupName,
				mfr,
				count: assets.length,
				collapsed,
				collapsedBars
			});
			if (!collapsed) {
				if (isBundle) {
					// Group assets by product, show product name + count
					const byProd = new Map<string, { name: string; assets: typeof rawData }>();
					for (const a of assets) {
						if (!byProd.has(a.product.id))
							byProd.set(a.product.id, { name: a.product.name, assets: [] });
						byProd.get(a.product.id)!.assets.push(a);
					}
					for (const [productId, pg] of byProd) {
						const seenProds = new Set<string>();
						const bars: Bar[] = [];
						for (const a of pg.assets) {
							for (const pi of a.productionItems) {
								if (!pi.production.startDate || !pi.production.endDate) continue;
								if (seenProds.has(pi.production.id)) continue;
								seenProds.add(pi.production.id);
								bars.push({
									id: pi.id,
									productionId: pi.production.id,
									label: pi.production.name,
									...barDimsWithShow(
										pi.production.startDate!,
										pi.production.endDate!,
										pi.production.showStartDate,
										pi.production.showEndDate
									),
									color: prodColor(pi.production.id),
									pending: pi.status === 'PENDING'
								});
							}
						}
						rows.push({
							kind: 'asset',
							id: `${groupId}-${productId}`,
							label: pg.name,
							org: `×${pg.assets.length}`,
							bars
						});
					}
				} else {
					for (const a of assets) {
						const bars: Bar[] = a.productionItems
							.filter((pi) => pi.production.startDate && pi.production.endDate)
							.map((pi) => ({
								id: pi.id,
								productionId: pi.production.id,
								label: pi.production.name,
								...barDimsWithShow(
									pi.production.startDate!,
									pi.production.endDate!,
									pi.production.showStartDate,
									pi.production.showEndDate
								),
								color: prodColor(pi.production.id),
								pending: pi.status === 'PENDING'
							}));
						rows.push({
							kind: 'asset',
							id: a.id,
							label: a.serialNumber ?? a.assetTag ?? `#${a.id.slice(0, 6)}`,
							org: a.organization.name,
							orgInfo: {
								id: a.organization.id,
								name: a.organization.name,
								color: a.organization.color,
								avatarLabel: a.organization.avatarLabel
							},
							bars
						});
					}
				}
			}
		}

		for (const [bid, bg] of byBundle) addGroupRows(bid, bg.name, '', bg.assets, true);
		for (const [pid, pg] of byProduct) addGroupRows(pid, pg.name, pg.mfr, pg.assets, false);

		return rows;
	});

	const MONTHS = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];

	type Span = { label: string; col: number; span: number };

	let monthSpans = $derived.by((): Span[] => {
		if (!visibleCols.length) return [];
		const spans: Span[] = [];
		let cur: Span | null = null;
		for (const col of visibleCols) {
			const d = colDate(col);
			const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
			if (!cur || cur.label !== label) {
				if (cur) spans.push(cur);
				cur = { label, col, span: 1 };
			} else {
				cur.span++;
			}
		}
		if (cur) spans.push(cur);
		return spans;
	});

	function fmtDateRange(s: Date, e: Date): string {
		if (s.getFullYear() === e.getFullYear()) {
			if (s.getMonth() === e.getMonth())
				return `${s.getDate()}–${e.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
			return `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${s.getFullYear()}`;
		}
		return `${s.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
	}

	function colLabel(d: Date): string {
		if (granularity === 'day') return String(d.getDate());
		return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
	}

	function isToday(d: Date): boolean {
		const t = new Date();
		return (
			d.getFullYear() === t.getFullYear() &&
			d.getMonth() === t.getMonth() &&
			d.getDate() === t.getDate()
		);
	}

	function isWeekend(d: Date): boolean {
		const dow = d.getDay();
		return dow === 0 || dow === 6;
	}

	let todayX = $derived(dateToX(startOfDay(new Date())));

	function rowH(row: Row): number {
		return row.kind === 'header' ? PRODUCT_H : ROW_H;
	}

	function toggleCollapse(productId: string) {
		const next = new Set(expandedProducts);
		if (next.has(productId)) next.delete(productId);
		else next.add(productId);
		expandedProducts = next;
	}

	function handleScroll() {
		if (scrollEl) scrollLeft = scrollEl.scrollLeft;
	}

	function goToday() {
		if (granularity === 'day' || granularity === 'week') {
			scrollEl?.scrollTo({ left: Math.max(0, todayX - viewportWidth / 2), behavior: 'smooth' });
		} else {
			setViewDate(new Date());
		}
	}

	function scrollToBar(bar: Bar) {
		scrollEl?.scrollTo({ left: Math.max(0, bar.left - viewportWidth / 4), behavior: 'smooth' });
	}

	$effect(() => {
		if (!scrollEl) return;
		const ro = new ResizeObserver(() => {
			viewportWidth = scrollEl!.clientWidth;
		});
		ro.observe(scrollEl);
		viewportWidth = scrollEl.clientWidth;
		return () => ro.disconnect();
	});

	// Scroll to today on mount and whenever granularity changes (timeline resets)
	$effect(() => {
		void granularity;
		setTimeout(() => {
			if (scrollEl) scrollEl.scrollLeft = Math.max(0, todayX - viewportWidth / 2);
		}, 0);
	});

	// Grid view (month/year) helpers

	const effectiveViewMode = $derived(
		granularity === 'month' || granularity === 'year' ? ('productions' as const) : viewMode
	);

	type GridEvent = {
		id: string;
		name: string;
		color: string;
		startTs: number;
		endTs: number;
		showStartTs: number;
		showEndTs: number;
	};

	// Show dates narrow the full booked/loaded range down to the actual event
	// days; days outside that window (get-in/get-out) render as "setup".
	// Clamped to the full range so bad data never produces a show window wider
	// than the booking itself.
	function showRange(
		startTs: number,
		endTs: number,
		showStart: Date | string | null,
		showEnd: Date | string | null
	) {
		const showStartTs = showStart
			? Math.min(Math.max(startOfDay(new Date(showStart)).getTime(), startTs), endTs)
			: startTs;
		const showEndTs = showEnd
			? Math.max(Math.min(startOfDay(new Date(showEnd)).getTime(), endTs), showStartTs)
			: endTs;
		return { showStartTs, showEndTs };
	}

	let gridEvents = $derived.by((): GridEvent[] => {
		if (effectiveViewMode === 'productions') {
			return prodCalData
				.filter((p) => p.startDate && p.endDate)
				.map((p) => {
					const startTs = startOfDay(new Date(p.startDate!)).getTime();
					const endTs = startOfDay(new Date(p.endDate!)).getTime();
					return {
						id: p.id,
						name: p.name,
						color: prodColor(p.id),
						startTs,
						endTs,
						...showRange(startTs, endTs, p.showStartDate, p.showEndDate)
					};
				});
		}
		const seen = new Set<string>();
		const result: GridEvent[] = [];
		for (const a of rawData) {
			for (const pi of a.productionItems) {
				if (!pi.production.startDate || !pi.production.endDate) continue;
				if (seen.has(pi.production.id)) continue;
				seen.add(pi.production.id);
				const startTs = startOfDay(new Date(pi.production.startDate)).getTime();
				const endTs = startOfDay(new Date(pi.production.endDate)).getTime();
				result.push({
					id: pi.production.id,
					name: pi.production.name,
					color: prodColor(pi.production.id),
					startTs,
					endTs,
					...showRange(startTs, endTs, pi.production.showStartDate, pi.production.showEndDate)
				});
			}
		}
		return result;
	});

	type EventBar = {
		event: GridEvent;
		startCol: number;
		endCol: number;
		lane: number;
		startsInRow: boolean;
		endsInRow: boolean;
		dimmed: boolean;
		// Show-day segment clipped to this row's columns; null when this row
		// contains no show days at all (i.e. it's entirely setup/get-out).
		showStartCol: number | null;
		showEndCol: number | null;
	};

	type WeekRowData = {
		days: Array<{ date: Date; isCurrentMonth: boolean }>;
		bars: EventBar[];
	};

	function computeWeekBars(
		week: Array<{ date: Date; isCurrentMonth: boolean }>,
		events: GridEvent[],
		monthStart = -Infinity,
		monthEnd = Infinity
	): EventBar[] {
		const rowStartTs = startOfDay(week[0].date).getTime();
		const rowEndTs = rowStartTs + 6 * MS_DAY;

		const items = events
			.filter((e) => e.startTs <= rowEndTs && e.endTs >= rowStartTs)
			.map((e) => {
				const startCol = Math.max(0, Math.round((e.startTs - rowStartTs) / MS_DAY));
				const endCol = Math.min(6, Math.round((e.endTs - rowStartTs) / MS_DAY));
				const hasShowInRow = e.showEndTs >= rowStartTs && e.showStartTs <= rowEndTs;
				const showStartCol = hasShowInRow
					? Math.max(startCol, Math.round((e.showStartTs - rowStartTs) / MS_DAY))
					: null;
				const showEndCol = hasShowInRow
					? Math.min(endCol, Math.round((e.showEndTs - rowStartTs) / MS_DAY))
					: null;
				return {
					event: e,
					startCol,
					endCol,
					startsInRow: e.startTs >= rowStartTs,
					endsInRow: e.endTs <= rowEndTs,
					dimmed: e.endTs < monthStart || e.startTs > monthEnd,
					showStartCol,
					showEndCol
				};
			});

		items.sort(
			(a, b) => a.startCol - b.startCol || b.endCol - b.startCol - (a.endCol - a.startCol)
		);

		const result: EventBar[] = [];
		const laneEndCols: number[] = [];
		for (const item of items) {
			let lane = 0;
			while (lane < laneEndCols.length && laneEndCols[lane] >= item.startCol) lane++;
			laneEndCols[lane] = item.endCol;
			result.push({ ...item, lane });
		}
		return result;
	}

	// Splits a bar into show/setup segments for rendering — setup segments
	// (get-in/get-out days outside the show window) get a hatched treatment
	// distinct from the plain opacity-20 used for out-of-month dimming.
	type BarSegment = {
		colStart: number;
		colEnd: number;
		kind: 'setup' | 'show';
		roundedLeft: boolean;
		roundedRight: boolean;
	};

	function barSegments(bar: EventBar): BarSegment[] {
		if (bar.showStartCol === null || bar.showEndCol === null) {
			return [
				{
					colStart: bar.startCol,
					colEnd: bar.endCol,
					kind: 'setup',
					roundedLeft: bar.startsInRow,
					roundedRight: bar.endsInRow
				}
			];
		}
		const segs: BarSegment[] = [];
		if (bar.showStartCol > bar.startCol) {
			segs.push({
				colStart: bar.startCol,
				colEnd: bar.showStartCol - 1,
				kind: 'setup',
				roundedLeft: bar.startsInRow,
				roundedRight: false
			});
		}
		segs.push({
			colStart: bar.showStartCol,
			colEnd: bar.showEndCol,
			kind: 'show',
			roundedLeft: bar.startsInRow && bar.showStartCol === bar.startCol,
			roundedRight: bar.endsInRow && bar.showEndCol === bar.endCol
		});
		if (bar.showEndCol < bar.endCol) {
			segs.push({
				colStart: bar.showEndCol + 1,
				colEnd: bar.endCol,
				kind: 'setup',
				roundedLeft: false,
				roundedRight: bar.endsInRow
			});
		}
		return segs;
	}

	// Dimming (event outside the visible month) always wins over the setup
	// hatch treatment — they'd otherwise fight over `opacity`.
	function segmentStyle(bar: EventBar, seg: BarSegment): string {
		if (bar.dimmed) return 'opacity: 0.2;';
		if (seg.kind === 'setup') {
			return 'opacity: 0.65; background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0px, rgba(255,255,255,0.35) 4px, transparent 4px, transparent 8px);';
		}
		return '';
	}

	function buildMonthWeeks(year: number, month: number, forceWeeks = 0) {
		const firstDay = new Date(year, month, 1);
		const startDow = firstDay.getDay();
		const gridStart = new Date(firstDay);
		gridStart.setDate(1 - (startDow === 0 ? 6 : startDow - 1));

		let numWeeks = forceWeeks;
		if (!numWeeks) {
			const lastDay = new Date(year, month + 1, 0);
			const endDow = lastDay.getDay();
			const gridEnd = new Date(lastDay);
			if (endDow !== 0) gridEnd.setDate(lastDay.getDate() + (7 - endDow));
			numWeeks = Math.round((gridEnd.getTime() - gridStart.getTime()) / (MS_DAY * 7)) + 1;
		}

		const weeks: Array<Array<{ date: Date; isCurrentMonth: boolean }>> = [];
		const cur = new Date(gridStart);
		for (let w = 0; w < numWeeks; w++) {
			const week: Array<{ date: Date; isCurrentMonth: boolean }> = [];
			for (let i = 0; i < 7; i++) {
				week.push({ date: new Date(cur), isCurrentMonth: cur.getMonth() === month });
				cur.setDate(cur.getDate() + 1);
			}
			weeks.push(week);
		}
		return weeks;
	}

	let monthGridData = $derived.by((): WeekRowData[] => {
		if (granularity !== 'month') return [];
		const y = viewDate.getFullYear();
		const m = viewDate.getMonth();
		const monthStart = new Date(y, m, 1).getTime();
		const monthEnd = new Date(y, m + 1, 0).getTime();
		const weeks = buildMonthWeeks(y, m);
		return weeks.map((week) => ({
			days: week,
			bars: computeWeekBars(week, gridEvents, monthStart, monthEnd)
		}));
	});

	let yearGridData = $derived.by(() => {
		if (granularity !== 'year') return [];
		const year = viewDate.getFullYear();
		return Array.from({ length: 12 }, (_, m) => {
			const monthStart = new Date(year, m, 1).getTime();
			const monthEnd = new Date(year, m + 1, 0).getTime();
			return {
				month: m,
				year,
				weeks: buildMonthWeeks(year, m, 6).map((week) => ({
					days: week,
					bars: computeWeekBars(week, gridEvents, monthStart, monthEnd)
				}))
			};
		});
	});

	let viewTitle = $derived.by(() => {
		if (granularity === 'month') return `${MONTHS[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
		if (granularity === 'year') return String(viewDate.getFullYear());
		return '';
	});

	function prevPeriod() {
		const d = new Date(viewDate);
		if (granularity === 'month') d.setMonth(d.getMonth() - 1);
		else d.setFullYear(d.getFullYear() - 1);
		setViewDate(d);
	}

	function nextPeriod() {
		const d = new Date(viewDate);
		if (granularity === 'month') d.setMonth(d.getMonth() + 1);
		else d.setFullYear(d.getFullYear() + 1);
		setViewDate(d);
	}
</script>

<svelte:head><title>Calendar | Technikpool</title></svelte:head>

<div class="flex h-full flex-col overflow-hidden">
	<!-- Controls -->
	<div class="flex flex-wrap items-center gap-3 border-b px-4 py-2">
		<!-- 1. View selector -->
		<div class="flex overflow-hidden rounded-md border text-sm">
			<button
				class="px-3 py-1.5 {granularity === 'day'
					? 'bg-primary text-primary-foreground'
					: 'bg-background hover:bg-muted'}"
				onclick={() => setGranularity('day')}>Day</button
			>
			<button
				class="border-l px-3 py-1.5 {granularity === 'week'
					? 'bg-primary text-primary-foreground'
					: 'bg-background hover:bg-muted'}"
				onclick={() => setGranularity('week')}>Week</button
			>
			<button
				class="border-l px-3 py-1.5 {granularity === 'month'
					? 'bg-primary text-primary-foreground'
					: 'bg-background hover:bg-muted'}"
				onclick={() => setGranularity('month')}>Month</button
			>
			<button
				class="border-l px-3 py-1.5 {granularity === 'year'
					? 'bg-primary text-primary-foreground'
					: 'bg-background hover:bg-muted'}"
				onclick={() => setGranularity('year')}>Year</button
			>
		</div>

		<!-- 2. Mode selector (day/week only) -->
		{#if granularity === 'day' || granularity === 'week'}
			<div class="flex overflow-hidden rounded-md border text-sm">
				<button
					class="px-3 py-1.5 {viewMode === 'assets'
						? 'bg-primary text-primary-foreground'
						: 'bg-background hover:bg-muted'}"
					onclick={() => setViewMode('assets')}>Assets</button
				>
				<button
					class="border-l px-3 py-1.5 {viewMode === 'productions'
						? 'bg-primary text-primary-foreground'
						: 'bg-background hover:bg-muted'}"
					onclick={() => setViewMode('productions')}>Productions</button
				>
			</div>
		{/if}

		<!-- 2b. Org filter (assets mode only) -->
		{#if (granularity === 'day' || granularity === 'week') && viewMode === 'assets' && availableOrgs.length > 0}
			<FilterPopover align="start">
				{#snippet trigger()}
					Orgs
					{#if selectedOrgIds.size > 0}
						<span
							class="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
							>{selectedOrgIds.size}</span
						>
					{/if}
				{/snippet}
				{#each availableOrgs as org (org.id)}
					<label
						class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
					>
						<input
							type="checkbox"
							checked={selectedOrgIds.has(org.id)}
							onchange={() => toggleOrgFilter(org.id)}
							class="h-4 w-4 rounded border-input"
						/>
						<OrgBadge name={org.name} color={org.color} avatarLabel={org.avatarLabel} />
					</label>
				{/each}
			</FilterPopover>
		{/if}

		<!-- 3. Today + period navigation -->
		<button
			onclick={goToday}
			class="h-8 rounded-md border bg-background px-3 text-sm hover:bg-muted"
		>
			Today
		</button>

		{#if granularity === 'month' || granularity === 'year'}
			<div class="flex items-center gap-1">
				<button
					onclick={prevPeriod}
					class="flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted"
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
						<path d="m15 18-6-6 6-6" />
					</svg>
				</button>
				<span class="min-w-[120px] text-center text-sm font-medium">{viewTitle}</span>
				<button
					onclick={nextPeriod}
					class="flex h-8 w-8 items-center justify-center rounded-md border bg-background hover:bg-muted"
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
						<path d="m9 18 6-6-6-6" />
					</svg>
				</button>
			</div>
		{/if}

		<!-- 4. Expand/collapse (day/week assets only) -->
		{#if (granularity === 'day' || granularity === 'week') && viewMode === 'assets' && displayRows.some((r) => r.kind === 'header')}
			<button
				class="text-xs text-muted-foreground hover:text-foreground"
				onclick={() => {
					const allIds = displayRows.filter((r) => r.kind === 'header').map((r) => r.id);
					const allExpanded = allIds.every((id) => expandedProducts.has(id));
					expandedProducts = allExpanded ? new Set() : new Set(allIds);
				}}
			>
				{displayRows.filter((r) => r.kind === 'header').every((r) => expandedProducts.has(r.id))
					? 'Collapse all'
					: 'Expand all'}
			</button>
		{/if}
	</div>

	<!-- Month Grid View -->
	{#if granularity === 'month'}
		<div class="flex flex-1 flex-col overflow-hidden">
			<!-- Day-of-week header -->
			<div class="grid shrink-0 grid-cols-7 border-b">
				{#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as dow, i (i)}
					<div
						class="py-2 text-center text-xs font-medium text-muted-foreground {i < 6
							? 'border-r'
							: ''}"
					>
						{dow}
					</div>
				{/each}
			</div>
			<!-- Week rows -->
			<div class="flex flex-1 flex-col">
				{#each monthGridData as weekRow, wi (wi)}
					<div
						class="relative flex-1 overflow-hidden border-b {wi === monthGridData.length - 1
							? 'border-b-0'
							: ''}"
					>
						<!-- Background: day cells -->
						<div class="pointer-events-none absolute inset-0 grid grid-cols-7">
							{#each weekRow.days as day, di (day.date.toISOString())}
								{@const todayDay = isToday(day.date)}
								{@const weekend = isWeekend(day.date)}
								<div
									class="h-full {di < 6 ? 'border-r' : ''} {!day.isCurrentMonth
										? 'bg-muted/10'
										: weekend
											? 'bg-muted/5'
											: ''}"
								>
									<div class="flex h-7 items-center px-1.5">
										{#if todayDay}
											<span
												class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
											>
												{day.date.getDate()}
											</span>
										{:else}
											<span
												class="text-xs {day.isCurrentMonth
													? weekend
														? 'text-muted-foreground'
														: 'text-foreground'
													: 'text-muted-foreground/30'}"
											>
												{day.date.getDate()}
											</span>
										{/if}
									</div>
								</div>
							{/each}
						</div>
						<!-- Event bars spanning columns -->
						{#each weekRow.bars as bar (bar.event.id)}
							{@const segments = barSegments(bar)}
							{#each segments as seg, si (si)}
								<a
									href={resolve(`/productions/${bar.event.id}`)}
									title={bar.event.name}
									onmouseenter={() => (hoveredEventId = bar.event.id)}
									onmouseleave={() => (hoveredEventId = null)}
									class="absolute flex items-center overflow-hidden px-1.5 text-[11px] font-medium text-white no-underline {hoveredEventId ===
									bar.event.id
										? 'brightness-110'
										: ''} {seg.roundedLeft ? 'rounded-l' : ''} {seg.roundedRight
										? 'rounded-r'
										: ''}"
									style="left: calc({seg.colStart} / 7 * 100% + {seg.roundedLeft
										? 2
										: 0}px); width: calc({seg.colEnd -
										seg.colStart +
										1} / 7 * 100% - {(seg.roundedLeft ? 2 : 0) +
										(seg.roundedRight ? 2 : 0)}px); top: {DAY_NUM_H +
										bar.lane *
											(MONTH_BAR_H +
												MONTH_BAR_GAP)}px; height: {MONTH_BAR_H}px; background-color: {bar.event
										.color}; {segmentStyle(bar, seg)}"
								>
									{#if seg.kind === 'show' || segments.length === 1}
										{bar.event.name}
									{/if}
								</a>
							{/each}
						{/each}
					</div>
				{/each}
			</div>
		</div>

		<!-- Year Grid View -->
	{:else if granularity === 'year'}
		<div class="flex-1 overflow-hidden p-2">
			<div class="grid h-full grid-cols-4 grid-rows-3 gap-1">
				{#each yearGridData as mg (mg.month)}
					<div class="flex flex-col overflow-hidden rounded-lg border">
						<!-- Month name header -->
						<div class="shrink-0 border-b py-1 text-center text-xs font-semibold">
							{MONTHS[mg.month]}
						</div>
						<!-- Week rows filling remaining height -->
						<div class="flex flex-1 flex-col">
							{#each mg.weeks as weekRow, wi (wi)}
								<div
									class="relative flex-1 overflow-hidden {wi < mg.weeks.length - 1
										? 'border-b'
										: ''}"
								>
									<!-- Background: day cells (always faintly visible) -->
									<div class="pointer-events-none absolute inset-0 grid grid-cols-7">
										{#each weekRow.days as day, di (day.date.toISOString())}
											<div
												class="h-full {di < 6
													? 'border-r border-border/30'
													: ''} {day.isCurrentMonth
													? isWeekend(day.date)
														? 'bg-muted/30'
														: 'bg-muted/15'
													: 'bg-muted/5'}"
											></div>
										{/each}
									</div>
									<!-- Event bars spanning columns -->
									{#each weekRow.bars as bar (bar.event.id)}
										{#each barSegments(bar) as seg, si (si)}
											<a
												href={resolve(`/productions/${bar.event.id}`)}
												title={bar.event.name}
												onmouseenter={() => (hoveredEventId = bar.event.id)}
												onmouseleave={() => (hoveredEventId = null)}
												class="absolute no-underline {hoveredEventId === bar.event.id
													? 'brightness-110'
													: ''} {seg.roundedLeft ? 'rounded-l-sm' : ''} {seg.roundedRight
													? 'rounded-r-sm'
													: ''}"
												style="left: calc({seg.colStart} / 7 * 100%); width: calc({seg.colEnd -
													seg.colStart +
													1} / 7 * 100%); top: {YEAR_DAY_NUM_H +
													bar.lane *
														(YEAR_BAR_H +
															YEAR_BAR_GAP)}px; height: {YEAR_BAR_H}px; background-color: {bar.event
													.color}; {segmentStyle(bar, seg)}"
											></a>
										{/each}
									{/each}
									<!-- Day numbers on top -->
									<div class="pointer-events-none absolute inset-0 grid grid-cols-7">
										{#each weekRow.days as day (day.date.toISOString())}
											<div class="flex items-start justify-start px-0.5 pt-0.5">
												<span
													class="text-[7px] leading-none {isToday(day.date)
														? 'font-bold text-primary'
														: day.isCurrentMonth
															? 'text-foreground/50'
															: 'text-foreground/20'}">{day.date.getDate()}</span
												>
											</div>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Gantt chart (day/week) -->
	{:else}
		<div class="flex-1 overflow-auto" bind:this={scrollEl} onscroll={handleScroll}>
			<div style="min-width: {SIDEBAR + totalWidth}px">
				<!-- Sticky date header -->
				<div class="sticky top-0 z-20 flex border-b bg-background shadow-sm">
					<!-- Corner cell -->
					<div
						class="sticky left-0 z-30 flex shrink-0 items-end border-r bg-background px-3 pb-1"
						style="width: {SIDEBAR}px"
					>
						<span class="text-xs text-muted-foreground">
							{viewMode === 'assets' ? 'Asset' : 'Production'}
						</span>
					</div>

					<!-- Header columns -->
					<div class="relative shrink-0" style="width: {totalWidth}px; height: 56px">
						<!-- Month spans -->
						<div class="absolute inset-x-0 top-0 border-b" style="height: 24px">
							{#each monthSpans as span (span.col)}
								<div
									class="absolute top-0 h-full overflow-hidden border-l px-1.5 text-xs leading-6 font-medium whitespace-nowrap text-muted-foreground"
									style="left: {span.col * colWidth}px; width: {span.span * colWidth}px"
								>
									{span.label}
								</div>
							{/each}
						</div>

						<!-- Day/Week labels -->
						<div class="absolute inset-x-0 bottom-0" style="height: 32px">
							{#each visibleCols as col (col)}
								{@const d = colDate(col)}
								{@const today = isToday(d)}
								{@const weekend = granularity === 'day' && isWeekend(d)}
								<div
									class="absolute flex h-full items-center justify-center border-l text-xs {today
										? 'font-bold text-primary'
										: weekend
											? 'text-muted-foreground/60'
											: 'text-muted-foreground'} {weekend ? 'bg-muted/20' : ''}"
									style="left: {col * colWidth}px; width: {colWidth}px"
								>
									{#if today}
										<span
											class="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground"
										>
											{colLabel(d)}
										</span>
									{:else}
										{colLabel(d)}
									{/if}
								</div>
							{/each}

							<!-- Today vertical marker line -->
							{#if todayX >= 0 && todayX <= totalWidth}
								<div
									class="absolute top-0 h-full w-px bg-primary/40"
									style="left: {todayX}px"
								></div>
							{/if}
						</div>
					</div>
				</div>

				<!-- Rows -->
				{#each displayRows as row, idx (row.id)}
					{@const h = rowH(row)}
					<div
						class="flex border-b {idx % 2 === 0 ? '' : 'bg-muted/10'} {row.kind === 'header'
							? 'bg-muted/30'
							: ''}"
						style="height: {h}px"
					>
						<!-- Label (sticky left) -->
						<div
							class="sticky left-0 z-10 shrink-0 border-r bg-background"
							style="width: {SIDEBAR}px"
						>
							{#if row.kind === 'header'}
								<button
									class="flex h-full w-full cursor-pointer items-center gap-1.5 px-2 text-left"
									onclick={() => toggleCollapse(row.id)}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="10"
										height="10"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="shrink-0 text-muted-foreground transition-transform {row.collapsed
											? ''
											: 'rotate-90'}"
									>
										<path d="m9 18 6-6-6-6" />
									</svg>
									<span class="truncate text-xs font-semibold">{row.name}</span>
									<span class="ml-auto shrink-0 text-xs text-muted-foreground">×{row.count}</span>
								</button>
							{:else if row.kind === 'asset'}
								<div class="flex h-full flex-col justify-center px-3">
									<p class="truncate text-xs font-medium">{row.label}</p>
									<p class="truncate text-[10px] text-muted-foreground">
										{#if row.orgInfo}
											<OrgBadge
												name={row.orgInfo.name}
												color={row.orgInfo.color}
												avatarLabel={row.orgInfo.avatarLabel}
											/>
										{:else}
											{row.org}
										{/if}
									</p>
								</div>
							{:else}
								<button
									class="flex h-full w-full cursor-pointer flex-col justify-center px-3 text-left hover:bg-muted/20"
									onclick={() => row.bars[0] && scrollToBar(row.bars[0])}
								>
									<p class="truncate text-sm font-medium">{row.name}</p>
									<p class="truncate text-[10px] text-muted-foreground">
										{fmtDateRange(row.start, row.end)}
									</p>
								</button>
							{/if}
						</div>

						<!-- Timeline area -->
						<div class="relative shrink-0" style="width: {totalWidth}px; height: {h}px">
							<!-- Weekend column shading (day granularity only) -->
							{#if granularity === 'day' && row.kind !== 'header'}
								{#each visibleCols as col (col)}
									{#if isWeekend(colDate(col))}
										<div
											class="absolute top-0 h-full bg-muted/20"
											style="left: {col * colWidth}px; width: {colWidth}px"
										></div>
									{/if}
								{/each}
							{/if}

							<!-- Today line -->
							{#if todayX >= 0 && todayX <= totalWidth}
								<div
									class="absolute top-0 h-full w-px bg-primary/20"
									style="left: {todayX}px"
								></div>
							{/if}

							<!-- Bars (asset / production rows) -->
							{#if row.kind !== 'header'}
								{#each row.bars as bar (bar.id)}
									{#if bar.pending}
										<a
											href={resolve(`/productions/${bar.productionId}`)}
											title="{bar.label} (pending)"
											class="absolute top-1 flex items-center overflow-hidden rounded px-1.5 text-[11px] font-medium text-white no-underline hover:brightness-110"
											style="left: {bar.left}px; width: {bar.width}px; height: {h -
												8}px; background-color: {bar.color}; background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.25) 0px, rgba(255,255,255,0.25) 4px, transparent 4px, transparent 8px); opacity: 0.75;"
										>
											{bar.label}
										</a>
									{:else}
										{@const segs = ganttSegments(bar)}
										<div class="group/bar">
											{#each segs as seg, si (si)}
												<a
													href={resolve(`/productions/${bar.productionId}`)}
													title={bar.label}
													class="absolute top-1 flex items-center overflow-hidden px-1.5 text-[11px] font-medium text-white no-underline group-hover/bar:brightness-110 {seg.roundedLeft
														? 'rounded-l'
														: ''} {seg.roundedRight ? 'rounded-r' : ''}"
													style="left: {seg.left}px; width: {seg.width}px; height: {h -
														8}px; background-color: {bar.color}; {seg.kind === 'setup'
														? 'opacity: 0.65; background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0px, rgba(255,255,255,0.35) 4px, transparent 4px, transparent 8px);'
														: ''}"
												>
													{#if seg.kind === 'show' || segs.length === 1}
														{bar.label}
													{/if}
												</a>
											{/each}
										</div>
									{/if}
								{/each}
							{/if}

							<!-- Collapsed product bars: height proportional to booked/total fraction -->
							{#if row.kind === 'header' && row.collapsed}
								{#each row.collapsedBars as bar (bar.productionId)}
									{@const barH = Math.max(3, Math.round(bar.fraction * (PRODUCT_H - 6)))}
									{#if bar.allPending}
										<a
											href={resolve(`/productions/${bar.productionId}`)}
											title="{bar.label} ({Math.round(bar.fraction * 100)}%) · pending"
											class="absolute flex items-center overflow-hidden rounded-sm px-1 no-underline hover:brightness-110"
											style="left: {bar.left}px; width: {bar.width}px; height: {barH}px; top: 3px; background-color: {bar.color}; background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.25) 0px, rgba(255,255,255,0.25) 4px, transparent 4px, transparent 8px);"
										>
											<span class="truncate text-[9px] leading-none font-medium text-white"
												>{bar.label}</span
											>
										</a>
									{:else}
										{@const segs = ganttSegments(bar)}
										<div class="group/bar">
											{#each segs as seg, si (si)}
												<a
													href={resolve(`/productions/${bar.productionId}`)}
													title="{bar.label} ({Math.round(bar.fraction * 100)}%)"
													class="absolute flex items-center overflow-hidden px-1 no-underline group-hover/bar:brightness-110 {seg.roundedLeft
														? 'rounded-l-sm'
														: ''} {seg.roundedRight ? 'rounded-r-sm' : ''}"
													style="left: {seg.left}px; width: {seg.width}px; height: {barH}px; top: 3px; background-color: {bar.color}; {seg.kind ===
													'setup'
														? 'opacity: 0.65; background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0px, rgba(255,255,255,0.35) 4px, transparent 4px, transparent 8px);'
														: ''}"
												>
													{#if seg.kind === 'show' || segs.length === 1}
														<span class="truncate text-[9px] leading-none font-medium text-white"
															>{bar.label}</span
														>
													{/if}
												</a>
											{/each}
										</div>
									{/if}
								{/each}
							{/if}
						</div>
					</div>
				{/each}

				{#if displayRows.length === 0}
					<div class="py-16 text-center text-sm text-muted-foreground">
						No assets with scheduled productions found.
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
