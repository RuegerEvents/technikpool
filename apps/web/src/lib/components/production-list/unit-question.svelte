<script lang="ts" module>
	export type QuestionUnit = { id: string; name: string; tag: string | null };
</script>

<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Modal } from '#lib/components/ui/modal/index.js';

	// Asked after a scan booked several units at once — a kit's sticker brings
	// everything in the case: is all of it there? Everything starts ticked, so
	// confirming changes nothing; the caller books back what was unticked.
	// `ask` answers with the units that are there, or null when dismissed,
	// which leaves them all as they are. Awaited inside the scan queue, so the
	// next scan waits for the answer.

	let open = $state(false);
	let title = $state('');
	let question = $state('');
	let units = $state<QuestionUnit[]>([]);
	const there = new SvelteSet<string>();
	let answer: ((there: Set<string> | null) => void) | null = null;

	export function ask(t: string, q: string, list: QuestionUnit[]) {
		finish(null);
		title = t;
		question = q;
		units = list;
		there.clear();
		for (const u of list) there.add(u.id);
		open = true;
		return new Promise<Set<string> | null>((resolve) => (answer = resolve));
	}

	function finish(result: Set<string> | null) {
		open = false;
		answer?.(result);
		answer = null;
	}

	function toggle(id: string) {
		if (there.has(id)) there.delete(id);
		else there.add(id);
	}
</script>

<Modal bind:open {title} onclose={() => finish(null)}>
	<p class="mb-3 text-sm text-muted-foreground">{question}</p>
	<ul class="divide-y rounded-md border">
		{#each units as unit (unit.id)}
			<li>
				<label class="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40">
					<input
						type="checkbox"
						checked={there.has(unit.id)}
						onchange={() => toggle(unit.id)}
						class="size-4 accent-emerald-600"
					/>
					<span class="min-w-0 flex-1">
						<span class="block truncate font-medium">{unit.name}</span>
						<span class="block truncate text-xs text-muted-foreground">{unit.tag ?? 'No tag'}</span>
					</span>
				</label>
			</li>
		{/each}
	</ul>
	{#snippet footer()}
		<Button onclick={() => finish(new Set(there))}>Done</Button>
	{/snippet}
</Modal>
