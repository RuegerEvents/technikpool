// Where "Back" on a detail page goes: to the page the user actually came from,
// not to a list chosen in advance. A unit is opened from the Devices list, a
// product page, a production or a stocktake, and each of them wants to be
// returned to — with its filters, which the lists keep in the URL.
//
// The browser does not let a page read its own history, so the root layout
// records every in-app navigation against SvelteKit's history index. A replace
// (the Devices list's filters) overwrites the entry, a push clears what lay
// ahead of it, and going back and forth leaves the record alone. It lives in
// sessionStorage so a reload of a detail page still knows the way back.
//
// The index is SvelteKit's own (`sveltekit:metadata` on `history.state`). If a
// release moves it, `backDelta` finds nothing and every Back button falls back
// to its fixed target — the behaviour before this existed, not a broken one.

const storageKey = 'technikpool:history';

type Entries = Record<number, string>;

function historyIndex(): number | null {
	const index = history.state?.['sveltekit:metadata']?.historyIndex;
	return typeof index === 'number' ? index : null;
}

function load(): Entries {
	try {
		return JSON.parse(sessionStorage.getItem(storageKey) ?? '{}');
	} catch {
		return {};
	}
}

/** Called from the root layout's `afterNavigate`. */
export function recordNavigation(url: URL, type: string) {
	const index = historyIndex();
	if (index === null) return;
	const entries = load();
	if (type !== 'popstate') {
		for (const key of Object.keys(entries)) if (Number(key) > index) delete entries[Number(key)];
	}
	entries[index] = url.pathname;
	sessionStorage.setItem(storageKey, JSON.stringify(entries));
}

function inScope(path: string, scope: string) {
	return path === scope || path.startsWith(`${scope}/`);
}

/**
 * How far to go back to leave `scope` (a record's path, with its sub-pages),
 * or null when the way there was not inside the app — a shared link, a new
 * tab — and the caller should go to its fixed target instead.
 */
export function backDelta(scope: string): number | null {
	const index = historyIndex();
	const entries = load();
	if (index === null) return null;
	for (let i = index - 1; entries[i] !== undefined; i--) {
		if (!inScope(entries[i], scope)) return i - index;
	}
	return null;
}
