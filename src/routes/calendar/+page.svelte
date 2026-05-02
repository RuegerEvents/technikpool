<!-- eslint-disable svelte/prefer-svelte-reactivity -->
<script lang="ts">
	import { getCalendarData, getProductionsCalendar } from '$lib/remote/productions.remote';
	import { resolve } from '$app/paths';

	type Granularity = 'day' | 'week';
	type ViewMode = 'assets' | 'productions';

	let rawData = $derived(await getCalendarData());
	let prodCalData = $derived(await getProductionsCalendar());

	let granularity = $state<Granularity>('week');
	let viewMode = $state<ViewMode>('assets');
	let expandedProducts = $state(new Set<string>());

	let scrollEl = $state<HTMLDivElement | null>(null);
	let scrollLeft = $state(0);
	let viewportWidth = $state(900);

	const SIDEBAR = 220;
	const ROW_H = 36;
	const PRODUCT_H = 28;
	const MS_DAY = 86_400_000;
	const BUFFER = 5;

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

	type Bar = { id: string; productionId: string; label: string; left: number; width: number; color: string; pending: boolean };
	type CollapsedBar = { productionId: string; label: string; left: number; width: number; color: string; fraction: number; allPending: boolean };
	type HeaderRow = { kind: 'header'; id: string; name: string; mfr: string; count: number; collapsed: boolean; collapsedBars: CollapsedBar[] };
	type AssetRow = { kind: 'asset'; id: string; label: string; org: string; bars: Bar[] };
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
				bars: [{
					id: p.id,
					productionId: p.id,
					label: p.name,
					...barDims(p.startDate!, p.endDate!),
					color: prodColor(p.id)
				}]
			}));
		}

		const rows: Row[] = [];
		const byProduct = new Map<string, { name: string; mfr: string; assets: typeof rawData }>();
		for (const a of rawData) {
			const pid = a.product.id;
			if (!byProduct.has(pid))
				byProduct.set(pid, { name: a.product.name, mfr: a.product.manufacturer.name, assets: [] });
			byProduct.get(pid)!.assets.push(a);
		}
		for (const [pid, pg] of byProduct) {
			const collapsed = !expandedProducts.has(pid);

			// Aggregate productions across all assets in this product group for collapsed view
			const prodAgg = new Map<string, { label: string; start: Date; end: Date; count: number; pendingCount: number }>();
			for (const a of pg.assets) {
				for (const pi of a.productionItems) {
					if (!pi.production.startDate || !pi.production.endDate) continue;
					if (!prodAgg.has(pi.production.id))
						prodAgg.set(pi.production.id, {
							label: pi.production.name,
							start: new Date(pi.production.startDate),
							end: new Date(pi.production.endDate),
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
				...barDims(p.start, p.end),
				color: prodColor(id),
				fraction: p.count / pg.assets.length,
				allPending: p.pendingCount === p.count
			}));

			rows.push({ kind: 'header', id: pid, name: pg.name, mfr: pg.mfr, count: pg.assets.length, collapsed, collapsedBars });
			if (!collapsed) {
				for (const a of pg.assets) {
					const bars: Bar[] = a.productionItems
						.filter((pi) => pi.production.startDate && pi.production.endDate)
						.map((pi) => ({
							id: pi.id,
							productionId: pi.production.id,
							label: pi.production.name,
							...barDims(pi.production.startDate!, pi.production.endDate!),
							color: prodColor(pi.production.id),
							pending: pi.status === 'PENDING'
						}));
					rows.push({
						kind: 'asset',
						id: a.id,
						label: a.serialNumber ?? a.assetTag ?? `#${a.id.slice(0, 6)}`,
						org: a.organization.name,
						bars
					});
				}
			}
		}
		return rows;
	});

	const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
		scrollEl?.scrollTo({ left: Math.max(0, todayX - viewportWidth / 2), behavior: 'smooth' });
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
</script>

<svelte:head><title>Calendar | Technikpool</title></svelte:head>

<div class="flex h-full flex-col overflow-hidden">
	<!-- Controls -->
	<div class="flex flex-wrap items-center gap-3 border-b px-4 py-2">
		<button
			onclick={goToday}
			class="h-8 rounded-md border bg-background px-3 text-sm hover:bg-muted"
		>
			Today
		</button>

		<div class="flex overflow-hidden rounded-md border text-sm">
			<button
				class="px-3 py-1.5 {granularity === 'day'
					? 'bg-primary text-primary-foreground'
					: 'bg-background hover:bg-muted'}"
				onclick={() => (granularity = 'day')}>Day</button
			>
			<button
				class="border-l px-3 py-1.5 {granularity === 'week'
					? 'bg-primary text-primary-foreground'
					: 'bg-background hover:bg-muted'}"
				onclick={() => (granularity = 'week')}>Week</button
			>
		</div>

		<div class="flex overflow-hidden rounded-md border text-sm">
			<button
				class="px-3 py-1.5 {viewMode === 'assets'
					? 'bg-primary text-primary-foreground'
					: 'bg-background hover:bg-muted'}"
				onclick={() => (viewMode = 'assets')}>Assets</button
			>
			<button
				class="border-l px-3 py-1.5 {viewMode === 'productions'
					? 'bg-primary text-primary-foreground'
					: 'bg-background hover:bg-muted'}"
				onclick={() => (viewMode = 'productions')}>Productions</button
			>
		</div>

		{#if viewMode === 'assets' && displayRows.some((r) => r.kind === 'header')}
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

	<!-- Gantt body -->
	<div
		class="flex-1 overflow-auto"
		bind:this={scrollEl}
		onscroll={handleScroll}
	>
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
								class="absolute top-0 h-full overflow-hidden whitespace-nowrap border-l px-1.5 text-xs font-medium leading-6 text-muted-foreground"
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
								<p class="truncate text-[10px] text-muted-foreground">{row.org}</p>
							</div>
						{:else}
							<button
								class="flex h-full w-full cursor-pointer flex-col justify-center px-3 text-left hover:bg-muted/20"
								onclick={() => row.bars[0] && scrollToBar(row.bars[0])}
							>
								<p class="truncate text-sm font-medium">{row.name}</p>
								<p class="truncate text-[10px] text-muted-foreground">{fmtDateRange(row.start, row.end)}</p>
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
								<a
									href={resolve(`/productions/${bar.productionId}`)}
									title="{bar.label}{bar.pending ? ' (pending)' : ''}"
									class="absolute top-1 flex items-center overflow-hidden rounded px-1.5 text-[11px] font-medium text-white no-underline hover:brightness-110"
									style="left: {bar.left}px; width: {bar.width}px; height: {h - 8}px; background-color: {bar.color}; {bar.pending ? 'background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.25) 0px, rgba(255,255,255,0.25) 4px, transparent 4px, transparent 8px); opacity: 0.75;' : ''}"
								>
									{bar.label}
								</a>
							{/each}
						{/if}

						<!-- Collapsed product bars: height proportional to booked/total fraction -->
						{#if row.kind === 'header' && row.collapsed}
							{#each row.collapsedBars as bar (bar.productionId)}
								{@const barH = Math.max(3, Math.round(bar.fraction * (PRODUCT_H - 6)))}
								<a
									href={resolve(`/productions/${bar.productionId}`)}
									title="{bar.label} ({Math.round(bar.fraction * 100)}%){bar.allPending ? ' · pending' : ''}"
									class="absolute flex items-center overflow-hidden rounded-sm px-1 no-underline hover:brightness-110"
									style="left: {bar.left}px; width: {bar.width}px; height: {barH}px; top: 3px; background-color: {bar.color}; opacity: 0.75; {bar.allPending ? 'background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.25) 0px, rgba(255,255,255,0.25) 4px, transparent 4px, transparent 8px);' : ''}"
								>
									<span class="truncate text-[9px] font-medium leading-none text-white">{bar.label}</span>
								</a>
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
</div>
