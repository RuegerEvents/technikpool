import { untrack } from 'svelte';

/**
 * An always-open form over saved values: the fields start at what is saved,
 * follow it while nobody has typed, and `dirty` says when Save has something
 * to send. Construct it while a component initialises (it sets up an effect).
 *
 * `empty` is what the fields hold until the saved values are there, so a
 * `bind:` never sees `undefined`; render the form once `ready`.
 */
export class FormDraft<T extends object> {
	value = $state({} as T);
	#saved: () => T | null;
	/** The saved values the fields were last filled from; null until then. */
	#synced = $state<string | null>(null);

	constructor(saved: () => T | null, empty: T) {
		this.#saved = saved;
		const initial = untrack(saved);
		this.value = structuredClone(initial ?? empty);
		if (initial) this.#synced = JSON.stringify(initial);
		$effect(() => {
			const current = saved();
			if (!current) return;
			const json = JSON.stringify(current);
			const typed = untrack(() => JSON.stringify(this.value));
			const synced = untrack(() => this.#synced);
			// Follow the saved values unless someone has changed a field since
			// they were filled in — and take note once a save made them equal.
			if (synced === null || typed === synced || typed === json) {
				if (typed !== json) this.value = structuredClone(current);
				if (synced !== json) this.#synced = json;
			}
		});
	}

	/** Whether the fields hold the saved values (or edits of them) yet. */
	get ready() {
		return this.#synced !== null;
	}

	get dirty() {
		const saved = this.#saved();
		return !!saved && JSON.stringify(this.value) !== JSON.stringify(saved);
	}

	/** Back to what is saved. */
	reset() {
		const saved = this.#saved();
		if (!saved) return;
		this.value = structuredClone(saved);
		this.#synced = JSON.stringify(saved);
	}
}
