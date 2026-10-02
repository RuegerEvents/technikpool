<script lang="ts">
	// What a customer sees behind their info link, in three tabs: the booked
	// equipment at a glance, the manuals and datasheets for it, and a checklist
	// to pack and check against. Ticks live in this browser only (localStorage) —
	// the list is theirs to work through, and nothing they do here reaches the
	// server. A tag can be scanned with the phone's camera to tick its unit.
	import { onDestroy, tick } from 'svelte';
	import { browser } from '$app/env';
	import { page } from '$app/state';
	import { SvelteSet } from 'svelte/reactivity';
	import { BookOpen, FileText, Info, LayoutList, PackageCheck, ScanLine, X } from '@lucide/svelte';
	import type { Html5Qrcode } from 'html5-qrcode';
	import type { ShareUnit } from '#lib/production-share.js';
	import { ProductThumb } from '#lib/components/ui/product-thumb/index.js';
	import { naturalCompare } from '#lib/sort.js';
	import { plural } from '#lib/utils.js';

	let { data } = $props();
	let view = $derived(data.view);

	type Tab = 'equipment' | 'manuals' | 'pack';

	// ── Browser storage: ticks and the open tab ─────────────────────────────
	const storageKey = $derived(`share-packed:${page.params.id}`);
	const tabKey = $derived(`share-tab:${page.params.id}`);
	const packed = new SvelteSet<string>();
	let tab = $state<Tab>('equipment');
	let loadedFor = '';
	$effect(() => {
		if (!browser || loadedFor === storageKey) return;
		loadedFor = storageKey;
		packed.clear();
		try {
			for (const id of JSON.parse(localStorage.getItem(storageKey) ?? '[]')) packed.add(id);
			const saved = localStorage.getItem(tabKey);
			if (saved === 'equipment' || saved === 'manuals' || saved === 'pack') tab = saved;
		} catch {
			// A private window or blocked storage: the page still works, it just
			// forgets on reload.
		}
	});
	function save() {
		try {
			localStorage.setItem(storageKey, JSON.stringify([...packed]));
		} catch {
			// See above.
		}
	}
	function open(next: Tab) {
		tab = next;
		if (next !== 'pack') void stopScan();
		try {
			localStorage.setItem(tabKey, next);
		} catch {
			// See above.
		}
	}

	// ── What is on the list ─────────────────────────────────────────────────
	let allUnits = $derived(view ? [...view.bundles.flatMap((b) => b.units), ...view.units] : []);
	/** Every tickable thing: units and their accessories. */
	let allIds = $derived(allUnits.flatMap(unitIds));
	let done = $derived(allIds.filter((id) => packed.has(id)).length);

	function unitIds(unit: ShareUnit) {
		return [unit.id, ...unit.accessories.map((a) => a.id)];
	}
	function bundleIds(bundle: { units: ShareUnit[] }) {
		return bundle.units.flatMap(unitIds);
	}

	type ProductLine = {
		productId: string;
		name: string;
		caption: string | null;
		manufacturer: string | null;
		imageUrl: string | null;
		count: number;
		accessories: Map<string, number>;
	};
	/** Units counted by product — "4× 2bright Par 18 IP" — with what hangs off them. */
	function byProduct(units: ShareUnit[]): ProductLine[] {
		const lines: Record<string, ProductLine> = {};
		for (const unit of units) {
			const line = (lines[unit.productId] ??= {
				productId: unit.productId,
				name: unit.name,
				caption: unit.caption,
				manufacturer: unit.manufacturer,
				imageUrl: unit.imageUrl,
				count: 0,
				accessories: new Map()
			});
			line.count++;
			for (const accessory of unit.accessories) {
				line.accessories.set(accessory.name, (line.accessories.get(accessory.name) ?? 0) + 1);
			}
		}
		return Object.values(lines).sort((a, b) => naturalCompare(a.name, b.name));
	}
	const counted = (entries: Iterable<[string, number]>) =>
		[...entries].map(([name, count]) => `${count}× ${name}`).join(' · ');

	let looseLines = $derived(byProduct(view?.units ?? []));
	let manualLines = $derived(
		byProduct(allUnits).filter((line) => (view?.documents[line.productId]?.length ?? 0) > 0)
	);
	let manualCount = $derived(
		manualLines.reduce((n, line) => n + (view?.documents[line.productId]?.length ?? 0), 0)
	);

	// ── Ticking ─────────────────────────────────────────────────────────────
	function toggle(id: string, on = !packed.has(id)) {
		if (on) packed.add(id);
		else packed.delete(id);
		save();
	}
	function setAll(ids: string[], on: boolean) {
		for (const id of ids) {
			if (on) packed.add(id);
			else packed.delete(id);
		}
		save();
	}
	function resetTicks() {
		packed.clear();
		save();
	}

	// ── Scanning ────────────────────────────────────────────────────────────
	let scanning = $state(false);
	let scanMessage = $state<{ kind: 'packed' | 'unknown' | 'camera'; text: string } | null>(null);
	let highlighted = $state<string | null>(null);
	let scanner: Html5Qrcode | null = null;
	let lastCode = '';
	let lastCodeAt = 0;

	/** A scanned code, matched against the tags on this list. */
	function onCode(raw: string) {
		const code = raw.trim();
		const now = Date.now();
		// The camera reads a label on every frame it stays in view.
		if (!code || (code === lastCode && now - lastCodeAt < 3000)) return;
		lastCode = code;
		lastCodeAt = now;
		if (!view) return;

		const bundle = view.bundles.find((b) => b.tag === code);
		if (bundle) {
			setAll(bundleIds(bundle), true);
			flash(bundle.id, withCaption(bundle.name, bundle.caption));
			return;
		}
		for (const unit of allUnits) {
			if (unit.tag === code) {
				toggle(unit.id, true);
				flash(unit.id, withCaption(unit.name, unit.caption));
				return;
			}
			const accessory = unit.accessories.find((a) => a.tag === code);
			if (accessory) {
				toggle(accessory.id, true);
				flash(unit.id, accessory.name);
				return;
			}
		}
		scanMessage = { kind: 'unknown', text: code };
		highlighted = null;
	}

	async function flash(id: string, text: string) {
		scanMessage = { kind: 'packed', text };
		highlighted = id;
		await tick();
		document.getElementById(`row-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	}

	async function startScan() {
		scanning = true;
		scanMessage = null;
		await tick();
		try {
			const { Html5Qrcode: Lib } = await import('html5-qrcode');
			scanner = new Lib('share-scanner');
			await scanner.start(
				{ facingMode: 'environment' },
				{ fps: 10, qrbox: { width: 240, height: 160 } },
				onCode,
				() => undefined
			);
		} catch {
			scanner = null;
			scanning = false;
			scanMessage = { kind: 'camera', text: '' };
		}
	}

	async function stopScan() {
		const s = scanner;
		scanner = null;
		scanning = false;
		if (s) {
			try {
				await s.stop();
			} catch {
				// Already stopped.
			}
		}
	}
	onDestroy(stopScan);

	// ── Enlarged picture ────────────────────────────────────────────────────
	let enlarged = $state<{ src: string; alt: string } | null>(null);

	// ── Formatting ──────────────────────────────────────────────────────────
	function withCaption(name: string, caption: string | null) {
		return caption ? `${name} — ${caption}` : name;
	}
	const day = (iso: string) =>
		new Date(iso).toLocaleDateString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		});
	let dates = $derived.by(() => {
		const p = view?.production;
		if (!p?.start) return null;
		const start = day(p.start);
		const end = p.end ? day(p.end) : start;
		return start === end ? start : `${start} – ${end}`;
	});

	function kindLabel(kind: 'MANUAL' | 'DATASHEET' | 'OTHER') {
		switch (kind) {
			case 'MANUAL':
				return 'Manual';
			case 'DATASHEET':
				return 'Datasheet';
			case 'OTHER':
				return 'Document';
		}
	}

	function switchLocale(locale: string) {
		document.cookie = `locale=${locale}; path=/; max-age=31536000; SameSite=Lax`;
		window.location.reload();
	}

	const tabClass = (active: boolean) =>
		`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-3 text-sm font-medium transition-colors ${
			active
				? 'border-foreground text-foreground'
				: 'border-transparent text-muted-foreground hover:text-foreground'
		}`;
</script>

<svelte:head>
	<title>{view ? view.production.name : 'Link no longer valid'}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
	<div class="mx-auto max-w-3xl px-4 py-6 sm:py-10">
		{#if !view}
			<div class="rounded-lg border bg-background p-6 text-center">
				<h1 class="text-xl font-semibold">This link is no longer valid</h1>
				<p class="mt-2 text-sm text-muted-foreground">
					It may have been replaced or withdrawn, or the event is long over. Ask whoever sent it to
					you for a current one.
				</p>
			</div>
		{:else}
			<header class="mb-4 flex items-center gap-4">
				{#if view.organization.logoUrl}
					<!-- On a light tile in both themes: logos are drawn for white paper. -->
					<div class="flex size-14 shrink-0 items-center justify-center rounded-lg bg-white p-1.5">
						<img
							src={view.organization.logoUrl}
							alt={view.organization.name}
							class="max-h-full max-w-full object-contain"
						/>
					</div>
				{/if}
				<div class="min-w-0">
					<p class="text-sm text-muted-foreground">{view.organization.name}</p>
					<h1 class="text-2xl font-bold tracking-tight break-words">{view.production.name}</h1>
					<p class="text-sm text-muted-foreground">
						{[dates, view.production.venue].filter(Boolean).join(' · ')}
					</p>
				</div>
			</header>

			<!-- Sticky, so switching tabs — and, when packing, the count and the
			     scanner — stay in reach down a long list. -->
			<div
				class="sticky top-0 z-10 -mx-4 border-b bg-zinc-50/95 px-4 backdrop-blur dark:bg-zinc-950/95"
			>
				<nav class="flex" aria-label="Sections">
					<button
						type="button"
						class={tabClass(tab === 'equipment')}
						aria-current={tab === 'equipment'}
						onclick={() => open('equipment')}
					>
						<LayoutList class="size-4" /> Equipment
					</button>
					<button
						type="button"
						class={tabClass(tab === 'manuals')}
						aria-current={tab === 'manuals'}
						onclick={() => open('manuals')}
					>
						<BookOpen class="size-4" /> Manuals
						{#if manualCount > 0}
							<span class="rounded-full bg-muted px-1.5 text-xs">{manualCount}</span>
						{/if}
					</button>
					<button
						type="button"
						class={tabClass(tab === 'pack')}
						aria-current={tab === 'pack'}
						onclick={() => open('pack')}
					>
						<PackageCheck class="size-4" /> Pack & check
					</button>
				</nav>

				{#if tab === 'pack'}
					<div class="space-y-3 py-3">
						<div class="flex items-center gap-3">
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium">{done} of {allIds.length} packed</p>
								<div class="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
									<div
										class="h-full bg-green-600 transition-all"
										style="width: {allIds.length ? (done / allIds.length) * 100 : 0}%"
									></div>
								</div>
							</div>
							{#if scanning}
								<button
									type="button"
									onclick={stopScan}
									class="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-2 text-sm font-medium"
								>
									<X class="size-4" /> Stop
								</button>
							{:else}
								<button
									type="button"
									onclick={startScan}
									class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
								>
									<ScanLine class="size-4" /> Scan tag
								</button>
							{/if}
						</div>
						{#if scanning}
							<div id="share-scanner" class="overflow-hidden rounded-md"></div>
						{/if}
						{#if scanMessage?.kind === 'packed'}
							<p class="text-sm text-green-700 dark:text-green-500">Packed: {scanMessage.text}</p>
						{:else if scanMessage?.kind === 'unknown'}
							<p class="text-sm text-red-700 dark:text-red-400">
								Not on this list: {scanMessage.text}
							</p>
						{:else if scanMessage?.kind === 'camera'}
							<p class="text-sm text-red-700 dark:text-red-400">
								The camera could not be started. Allow camera access for this page, or tick the
								items by hand.
							</p>
						{/if}
					</div>
				{/if}
			</div>

			<div class="mt-6 space-y-6">
				{#if allUnits.length === 0}
					<p class="text-sm text-muted-foreground">Nothing is booked for this event yet.</p>
				{:else if tab === 'equipment'}
					<p class="text-sm text-muted-foreground">
						{plural(allUnits.length, ['1 device', '# devices'])}{#if view.bundles.length > 0}
							· {plural(view.bundles.length, ['1 case', '# cases'])}{/if}
					</p>
					{#if view.bundles.length > 0}
						<section class="space-y-2">
							<h2 class="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
								Cases
							</h2>
							<ul class="divide-y overflow-hidden rounded-lg border bg-background">
								{#each view.bundles as bundle (bundle.id)}
									<li class="flex items-start gap-3 px-4 py-3">
										{@render zoomable(bundle.imageUrl, bundle.name, 48)}
										<div class="min-w-0">
											<p class="font-medium">
												{withCaption(bundle.name, bundle.caption)}
												{#if bundle.tag}
													<span class="ml-1 font-mono text-xs text-muted-foreground"
														>{bundle.tag}</span
													>
												{/if}
											</p>
											<p class="mt-0.5 text-sm text-muted-foreground">
												{counted(byProduct(bundle.units).map((line) => [line.name, line.count]))}
											</p>
										</div>
									</li>
								{/each}
							</ul>
						</section>
					{/if}
					{#if looseLines.length > 0}
						<section class="space-y-2">
							{#if view.bundles.length > 0}
								<h2 class="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
									Individual devices
								</h2>
							{/if}
							<ul class="divide-y overflow-hidden rounded-lg border bg-background">
								{#each looseLines as line (line.productId)}
									<li class="flex items-start gap-3 px-4 py-3">
										<span
											class="min-w-10 rounded-md bg-muted px-2 py-0.5 text-center text-sm font-semibold tabular-nums"
											>{line.count}×</span
										>
										{@render zoomable(line.imageUrl, line.name, 40)}
										<span class="min-w-0">
											<span class="block font-medium">{withCaption(line.name, line.caption)}</span>
											<span class="block text-sm text-muted-foreground">
												{line.manufacturer ??
													''}{#if line.manufacturer && line.accessories.size > 0}
													·
												{/if}{#if line.accessories.size > 0}
													with {counted(line.accessories)}
												{/if}
											</span>
										</span>
									</li>
								{/each}
							</ul>
						</section>
					{/if}
				{:else if tab === 'manuals'}
					{#if manualLines.length === 0}
						<p class="text-sm text-muted-foreground">
							There are no manuals or datasheets for this equipment yet.
						</p>
					{:else}
						<ul class="space-y-3">
							{#each manualLines as line (line.productId)}
								<li class="flex items-start gap-3 rounded-lg border bg-background px-4 py-3">
									<ProductThumb path={line.imageUrl} alt={line.name} size={48} />
									<div class="min-w-0 flex-1">
										<p class="font-medium">{withCaption(line.name, line.caption)}</p>
										{#if line.manufacturer}
											<p class="text-sm text-muted-foreground">{line.manufacturer}</p>
										{/if}
										<ul class="mt-2 space-y-1">
											{#each view.documents[line.productId] ?? [] as document (document.id)}
												<li>
													<!-- eslint-disable svelte/no-navigation-without-resolve -->
													<a
														href={document.url}
														target="_blank"
														rel="noopener"
														class="inline-flex items-center gap-2 text-sm text-primary underline-offset-2 hover:underline"
													>
														<FileText class="size-4 shrink-0" />
														{document.title}
														<span class="text-muted-foreground">· {kindLabel(document.kind)}</span>
													</a>
													<!-- eslint-enable svelte/no-navigation-without-resolve -->
												</li>
											{/each}
										</ul>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				{:else}
					{#each view.bundles as bundle (bundle.id)}
						{@const ids = bundleIds(bundle)}
						{@const all = ids.every((id) => packed.has(id))}
						<section
							id="row-{bundle.id}"
							class="overflow-hidden rounded-lg border bg-background {highlighted === bundle.id
								? 'ring-2 ring-green-600'
								: ''}"
						>
							<label
								class="flex cursor-pointer items-center gap-3 border-b bg-muted/40 px-3 py-2.5"
							>
								<input
									type="checkbox"
									class="size-5 shrink-0"
									checked={all}
									onchange={(e) => setAll(ids, e.currentTarget.checked)}
								/>
								<ProductThumb path={bundle.imageUrl} alt={bundle.name} size={36} />
								<span class="min-w-0 flex-1">
									<span class="block font-semibold">{withCaption(bundle.name, bundle.caption)}</span
									>
									<span class="block text-xs text-muted-foreground">
										{bundle.tag ? `Case ${bundle.tag} · ` : ''}{ids.filter((id) => packed.has(id))
											.length} / {ids.length}
									</span>
								</span>
							</label>
							<ul class="divide-y">
								{#each bundle.units as unit (unit.id)}
									{@render unitRow(unit)}
								{/each}
							</ul>
						</section>
					{/each}

					{#if view.units.length > 0}
						<section class="overflow-hidden rounded-lg border bg-background">
							{#if view.bundles.length > 0}
								<h2 class="border-b bg-muted/40 px-3 py-2.5 font-semibold">Individual devices</h2>
							{/if}
							<ul class="divide-y">
								{#each view.units as unit (unit.id)}
									{@render unitRow(unit)}
								{/each}
							</ul>
						</section>
					{/if}
				{/if}
			</div>

			<footer class="mt-8 space-y-2 text-xs text-muted-foreground">
				{#if tab === 'pack' || view.expiresAt}
					<p class="flex items-start gap-1.5">
						<Info class="mt-0.5 size-3.5 shrink-0" />
						<span>
							{#if tab === 'pack'}
								Ticks are kept in this browser only.
							{/if}
							{#if view.expiresAt}
								This link works until {day(view.expiresAt)}.
							{/if}
						</span>
					</p>
				{/if}
				<div class="flex items-center gap-3">
					{#if done > 0 && tab === 'pack'}
						<button type="button" class="underline underline-offset-2" onclick={resetTicks}
							>Clear all ticks</button
						>
					{/if}
					<span class="ml-auto flex gap-2">
						<button type="button" onclick={() => switchLocale('de')}>DE</button>
						<button type="button" onclick={() => switchLocale('en')}>EN</button>
					</span>
				</div>
			</footer>
		{/if}
	</div>
</div>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') enlarged = null;
	}}
/>

{#if enlarged}
	<!-- Any click closes it: on a phone there is no corner worth aiming for. -->
	<button
		type="button"
		class="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-4"
		aria-label="Close"
		onclick={() => (enlarged = null)}
	>
		<img
			src={enlarged.src}
			alt={enlarged.alt}
			class="max-h-full max-w-full rounded-lg bg-white object-contain p-2"
		/>
		<X class="absolute top-4 right-4 size-6 text-white" />
	</button>
{/if}

<!-- A thumbnail that opens large when tapped; without a picture, just the placeholder. -->
{#snippet zoomable(src: string | null, alt: string, size: number)}
	{#if src}
		<button
			type="button"
			class="shrink-0 cursor-zoom-in"
			aria-label={alt}
			onclick={() => (enlarged = { src, alt })}
		>
			<ProductThumb path={src} {alt} {size} />
		</button>
	{:else}
		<ProductThumb path={src} {alt} {size} />
	{/if}
{/snippet}

<!-- One unit on the checklist, with its accessories. At the end of the file: a
     snippet in the middle of markup is where wuchale stops extracting. -->
{#snippet unitRow(unit: ShareUnit)}
	<li
		id="row-{unit.id}"
		class="px-3 py-2.5 transition-colors {highlighted === unit.id
			? 'bg-green-50 dark:bg-green-950/40'
			: ''}"
	>
		<label class="flex cursor-pointer items-start gap-3">
			<input
				type="checkbox"
				class="mt-0.5 size-5 shrink-0"
				checked={packed.has(unit.id)}
				onchange={(e) => toggle(unit.id, e.currentTarget.checked)}
			/>
			<ProductThumb
				path={unit.imageUrl}
				alt={unit.name}
				size={36}
				class={packed.has(unit.id) ? 'opacity-60' : ''}
			/>
			<span class="min-w-0 flex-1">
				<span
					class="block text-sm font-medium {packed.has(unit.id) ? 'line-through opacity-60' : ''}"
				>
					{withCaption(unit.name, unit.caption)}
				</span>
				<span class="block text-xs text-muted-foreground">
					{[unit.manufacturer, unit.tag].filter(Boolean).join(' · ')}
				</span>
			</span>
		</label>
		{#each unit.accessories as accessory (accessory.id)}
			<label class="mt-1.5 ml-8 flex cursor-pointer items-center gap-3">
				<input
					type="checkbox"
					class="size-4 shrink-0"
					checked={packed.has(accessory.id)}
					onchange={(e) => toggle(accessory.id, e.currentTarget.checked)}
				/>
				<ProductThumb path={accessory.imageUrl} alt={accessory.name} size={20} />
				<span class="text-xs {packed.has(accessory.id) ? 'line-through opacity-60' : ''}">
					↳ {accessory.name}{accessory.tag ? ` · ${accessory.tag}` : ''}
				</span>
			</label>
		{/each}
	</li>
{/snippet}
