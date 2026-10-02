<script
	lang="ts"
	generics="U extends { assetId: string; assetTag: string | null; productName: string; productCaption: string | null; accessoryOf: string | null }"
>
	import { Handshake, MapPin } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { CountStepper } from '#lib/components/ui/count-stepper/index.js';
	import type { ListLine, ListSection } from '#lib/production-list.js';

	// The list a production's equipment is worked through, whatever a tick means
	// there — checked, handed out, taken back. Units with a tag (or anything
	// else that tells them apart) are ticked one by one; interchangeable units
	// without one are a counted line. Each section can be ticked at once.
	//
	// What a unit's row says besides its name is up to the caller (`unitState`),
	// since that is where the three lists differ.

	type UnitState = {
		done: boolean;
		/** Ticked by someone else, who alone may take it back. */
		locked: boolean;
		/** Who ticked it, when it was not this user. */
		doneBy?: string | null;
		/** Where the unit stands besides the tick, if anything worth saying. */
		note?: { text: string; tone: 'muted' | 'warn' } | null;
	};

	type Props = {
		sections: ListSection<U>[];
		unitState: (unit: U) => UnitState;
		enabled: boolean;
		busy: boolean;
		doneLabel: string;
		tickSectionLabel: string;
		ontoggle: (unit: U) => void;
		oncount: (line: ListLine, count: number) => void;
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

	function tally(section: ListSection<U>) {
		let done = 0;
		let total = 0;
		const openUnits: U[] = [];
		const openLines: ListLine[] = [];
		for (const row of section.rows) {
			if (row.kind === 'line') {
				done += row.line.done;
				total += row.line.total;
				if (row.line.done < row.line.total) openLines.push(row.line);
			} else {
				total += 1;
				if (unitState(row.unit).done) done += 1;
				else openUnits.push(row.unit);
			}
		}
		return { done, total, openUnits, openLines };
	}
</script>

<div class="space-y-4">
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
						<li class="flex flex-wrap items-center gap-3 px-3 py-2">
							<span
								class="flex size-4 shrink-0 items-center justify-center rounded-sm border text-[10px] font-semibold {line.done >=
								line.total
									? 'border-emerald-600 bg-emerald-600 text-white'
									: ''}"
								aria-hidden="true">{line.done >= line.total ? '✓' : ''}</span
							>
							<span class="min-w-0 flex-1">
								<span class="block truncate font-medium">{line.productName}</span>
								<span class="block truncate text-xs text-muted-foreground">
									No tag · counted{line.productCaption ? ` · ${line.productCaption}` : ''}
								</span>
							</span>
							{#if enabled}
								<CountStepper
									current={line.done}
									limit={line.total}
									min={line.floor}
									disabled={busy}
									onchange={(n) => oncount(line, n)}
								/>
							{:else}
								<span class="text-sm font-medium tabular-nums">{line.done} / {line.total}</span>
							{/if}
						</li>
					{:else}
						{@const unit = row.unit}
						{@const s = unitState(unit)}
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
									onchange={() => ontoggle(unit)}
									class="size-4 accent-emerald-600"
								/>
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
