// An in-app replacement for `window.confirm()`: `await confirmAction({…})`
// answers true or false, and `ConfirmHost` in the root layout draws the
// question with the app's own Modal. One host for the whole app, so a call
// site needs no dialog markup and no open/closed state of its own.
//
// The wording comes from the call site, which is where wuchale extracts it.

export type ConfirmOptions = {
	title: string;
	description?: string;
	/** The confirming button's label. */
	confirmLabel: string;
	/** Red confirming button, for what can't be taken back. */
	destructive?: boolean;
};

type Pending = ConfirmOptions & { id: number; answer: (ok: boolean) => void };

export const confirmState = $state<{ pending: Pending | null }>({ pending: null });

let nextId = 0;

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
	// A second question while one is open declines the first rather than
	// leaving its caller waiting for ever.
	confirmState.pending?.answer(false);
	return new Promise((resolve) => {
		// Compared by id: the state proxies what it is given, so the object read
		// back is never the one stored.
		const id = ++nextId;
		confirmState.pending = {
			...options,
			id,
			answer: (ok) => {
				if (confirmState.pending?.id === id) confirmState.pending = null;
				resolve(ok);
			}
		};
	});
}
