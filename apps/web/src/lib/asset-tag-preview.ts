// What the server's tag allocator (`services/tag-counter.ts`) will hand the
// blank rows of a form, so each field can show its number before it is drawn.
// A preview, never sent: the counter is only read inside the creating
// transaction, so a unit created elsewhere meanwhile moves it on.

const DIGITS = 5;

/**
 * One entry per row: the tag a blank row will get, or null for a row that
 * brought its own. Mirrors the allocator — the count starts past `nextTag` and
 * past every typed tag in the pattern, then goes down the rows in order.
 */
export function previewAutoTags(nextTag: string | null, typed: string[]): (string | null)[] {
	if (!nextTag) return typed.map(() => null);
	const prefix = nextTag.slice(0, -DIGITS);
	const numberOf = (tag: string) => {
		const rest = tag.startsWith(prefix) ? tag.slice(prefix.length) : '';
		return /^[0-9]{5}$/.test(rest) ? Number(rest) : null;
	};
	let n = Math.max(
		Number(nextTag.slice(-DIGITS)),
		...typed.map((tag) => (numberOf(tag.trim()) ?? 0) + 1)
	);
	return typed.map((tag) => (tag.trim() ? null : `${prefix}${String(n++).padStart(DIGITS, '0')}`));
}
