<script lang="ts">
	// How many of something to take: − and +, a number that can be typed, and
	// None / All for the two answers people most often want. Shared by the
	// production's equipment planner and the bundle pickers, so choosing "3 of
	// these" works the same everywhere.
	//
	// `limit` is what this row can reach on its own; `shownMax` is the "of n"
	// beside it, which may count more than can be taken here (units that came in
	// some other way).
	let {
		current,
		limit,
		shownMax = limit,
		onchange
	}: {
		current: number;
		limit: number;
		shownMax?: number;
		onchange: (n: number) => void;
	} = $props();

	function commitTyped(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const n = Number(input.value);
		const next = Number.isFinite(n) ? Math.min(Math.max(0, Math.round(n)), limit) : current;
		// Clamping to the value already shown changes no state, so nothing would
		// redraw the input — put the number back by hand.
		input.value = String(next);
		if (next !== current) onchange(next);
	}
</script>

<!-- None and All only appear when they would do something, but keep their
     width either way, so the steppers line up down the list. -->
<div class="flex items-center gap-1.5">
	<button
		type="button"
		disabled={current <= 0}
		title="Remove all"
		onclick={(e) => {
			e.stopPropagation();
			onchange(0);
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
			onchange(current - 1);
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
			if (e.key === 'Enter') {
				// Enter in a form would submit it; here it only means "done typing".
				e.preventDefault();
				e.currentTarget.blur();
			}
		}}
		onchange={commitTyped}
		class="h-6 w-9 [appearance:textfield] rounded-md border border-transparent bg-transparent text-center text-sm font-semibold tabular-nums hover:border-input focus:border-input focus:bg-background focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
	/>
	<button
		type="button"
		disabled={current >= limit}
		onclick={(e) => {
			e.stopPropagation();
			onchange(current + 1);
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
			onchange(limit);
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
