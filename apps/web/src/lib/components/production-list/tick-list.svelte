<script
	lang="ts"
	generics="U extends { assetId: string; assetTag: string | null; productName: string; productCaption: string | null; productImagePath: string | null; accessoryOf: string | null }"
>
	import { Handshake, MapPin } from '@lucide/svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { Button } from '#lib/components/ui/button/index.js';
	import { CountStepper } from '#lib/components/ui/count-stepper/index.js';
	import { ProductThumb } from '#lib/components/ui/product-thumb/index.js';
	import type { ListLine, ListSection } from '#lib/production-list.js';

	// The list a production's equipment is worked through, whatever a tick means
	// there — checked, handed out, taken back. Units with a tag (or anything
	// else that tells them apart) are ticked one by one; interchangeable units
	// without one are a counted line. Each section can be ticked at once.
	//
	// What a unit's row says besides its name is up to the caller (`unitState`),
	// since that is where the three lists differ.
	//
	// A tick or a count shows at once and is saved behind it, one request after
	// another in the order they were made, so ticking down a list never waits
	// for the last tick to come back. The wanted state stays laid over the
	// server's until its request is through; a refusal drops it, and the row
	// shows what the server says.

	type UnitState = {
		done: boolean;
		/** Ticked by someone else, who alone may take it back. */
		locked: boolean;
		/** Who ticked it, when it was not this user. */
		doneBy?: string | null;
		/** Where the unit stands besides the tick, if anything worth saying. */
		note?: { text: string; tone: 'muted' | 'warn' } | null;
		/**
		 * On the list to be ticked if need be, but not owed: left out of the
		 * section's count and its "tick section" — a unit already taken back,
		 * on the hand-out list.
		 */
		optional?: boolean;
	};

	type Props = {
		sections: ListSection<U>[];
		unitState: (unit: U) => UnitState;
		enabled: boolean;
		/** A bulk action is running: the rows wait for it. */
		busy: boolean;
		doneLabel: string;
		tickSectionLabel: string;
		/** Saves a tick; reports a failure itself, and settles either way. */
		ontoggle: (unit: U, done: boolean) => Promise<unknown>;
		oncount: (line: ListLine, count: number) => Promise<unknown>;
		ontickSection: (units: U[], lines: ListLine[]) => void;
	};

	let {
		sections,
		unitState,
		enabled,
		busy,
		doneLabel,
		tickSectionLabel,
		ontoggle,
		oncount,
		ontickSection
	}: Props = $props();

	const wantedDone = new SvelteMap<string, boolean>();
	const wantedCount = new SvelteMap<string, number>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping, never rendered
	const sentCount = new Map<string, number>();
	let queued = $state(0);
	let queue: Promise<unknown> = Promise.resolve();

	function enqueue(job: () => Promise<unknown>) {
		queued += 1;
		queue = queue
			.then(job)
			.catch(() => {})
			.finally(() => (queued -= 1));
	}

	function stateOf(unit: U): UnitState {
		const s = unitState(unit);
		const wanted = wantedDone.get(unit.assetId);
		return wanted === undefined ? s : { ...s, done: wanted };
	}

	function doneOf(line: ListLine) {
		return wantedCount.get(line.key) ?? line.done;
	}

	function toggle(unit: U) {
		const done = !stateOf(unit).done;
		wantedDone.set(unit.assetId, done);
		enqueue(async () => {
			try {
				await ontoggle(unit, done);
			} finally {
				// A later tick of the same unit is still on its way: that one decides.
				if (wantedDone.get(unit.assetId) === done) wantedDone.delete(unit.assetId);
			}
		});
	}

	// A stepper clicked five times is one request for the last number, not five:
	// each job sends whatever is wanted by the time it runs.
	function count(line: ListLine, n: number) {
		wantedCount.set(line.key, n);
		enqueue(async () => {
			const want = wantedCount.get(line.key);
			if (want === undefined || want === sentCount.get(line.key)) return;
			sentCount.set(line.key, want);
			try {
				await oncount(line, want);
			} finally {
				if (wantedCount.get(line.key) === want) {
					wantedCount.delete(line.key);
					sentCount.delete(line.key);
				}
			}
		});
	}

	function tally(section: ListSection<U>) {
		let done = 0;
		let total = 0;
		const openUnits: U[] = [];
		const openLines: ListLine[] = [];
		for (const row of section.rows) {
			if (row.kind === 'line') {
				done += doneOf(row.line);
				total += row.line.total;
				if (doneOf(row.line) < row.line.total) openLines.push(row.line);
			} else {
				const s = stateOf(row.unit);
				if (s.optional && !s.done) continue;
				total += 1;
				if (s.done) done += 1;
				else openUnits.push(row.unit);
			}
		}
		return { done, total, openUnits, openLines };
	}
</script>

<div class="space-y-4">
	<p class="h-4 text-right text-xs text-muted-foreground" aria-live="polite">
		{#if queued > 0}Saving…{/if}
	</p>
	{#each sections as section (section.key)}
		{@const t = tally(section)}
		<section class="space-y-1.5">
			<div class="flex items-center justify-between gap-3">
				<h3 class="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
					{#if section.group.kind === 'lender'}
						<Handshake aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" />
						<span class="truncate">Lent by {section.group.name}</span>
					{:else if section.group.kind === 'location'}
						<MapPin aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" />
						<span class="truncate">{section.group.name}</span>
					{:else}
						<MapPin aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" />
						<span class="truncate">No location</span>
					{/if}
					<span class="font-normal text-muted-foreground tabular-nums">{t.done} / {t.total}</span>
				</h3>
				{#if enabled && t.done < t.total}
					<Button
						variant="ghost"
						size="sm"
						disabled={busy}
						onclick={() => ontickSection(t.openUnits, t.openLines)}>{tickSectionLabel}</Button
					>
				{/if}
			</div>
			<ul class="divide-y rounded-md border">
				{#each section.rows as row (row.kind === 'line' ? `line:${row.line.key}` : row.unit.assetId)}
					{#if row.kind === 'line'}
						{@const line = row.line}
						{@const lineDone = doneOf(line)}
						<li class="flex flex-wrap items-center gap-3 px-3 py-2">
							<span
								class="flex size-4 shrink-0 items-center justify-center rounded-sm border text-[10px] font-semibold {lineDone >=
								line.total
									? 'border-emerald-600 bg-emerald-600 text-white'
									: ''}"
								aria-hidden="true">{lineDone >= line.total ? '✓' : ''}</span
							>
							<ProductThumb path={line.productImagePath} alt={line.productName} size={36} />
							<span class="min-w-0 flex-1">
								<span class="block truncate font-medium">{line.productName}</span>
								<span class="block truncate text-xs text-muted-foreground">
									No tag · counted{line.productCaption ? ` · ${line.productCaption}` : ''}
								</span>
							</span>
							{#if enabled}
								<CountStepper
									current={lineDone}
									limit={line.total}
									min={line.floor}
									disabled={busy}
									onchange={(n) => count(line, n)}
								/>
							{:else}
								<span class="text-sm font-medium tabular-nums">{lineDone} / {line.total}</span>
							{/if}
						</li>
					{:else}
						{@const unit = row.unit}
						{@const s = stateOf(unit)}
						<li>
							<label
								class="flex items-center gap-3 px-3 py-2 {enabled && !s.locked
									? 'cursor-pointer hover:bg-muted/40'
									: ''} {unit.accessoryOf ? 'pl-9' : ''}"
							>
								<input
									type="checkbox"
									checked={s.done}
									disabled={!enabled || s.locked || busy}
									onchange={() => toggle(unit)}
									class="size-4 accent-emerald-600"
								/>
								<ProductThumb path={unit.productImagePath} alt={unit.productName} size={36} />
								<span class="min-w-0 flex-1">
									<span class="block truncate font-medium">{unit.productName}</span>
									<span class="block truncate text-xs text-muted-foreground">
										{unit.assetTag ?? 'No tag'}{unit.productCaption
											? ` · ${unit.productCaption}`
											: ''}
									</span>
								</span>
								<span class="flex shrink-0 flex-col items-end gap-0.5 text-xs">
									{#if s.done}
										<span class="font-medium text-emerald-700 dark:text-emerald-400"
											>{s.doneBy ? `${doneLabel} · ${s.doneBy}` : doneLabel}</span
										>
									{/if}
									{#if s.note}
										<span
											class={s.note.tone === 'warn'
												? 'text-amber-700 dark:text-amber-400'
												: 'text-muted-foreground'}>{s.note.text}</span
										>
									{/if}
								</span>
							</label>
						</li>
					{/if}
				{/each}
			</ul>
		</section>
	{/each}
</div>
