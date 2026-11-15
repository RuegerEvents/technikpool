// How every name in the app is ordered: "2m" before "10m", "A-2" before "a-10",
// "Äpfel" among the As. The database sorts the same way through the "natural"
// collation (migration 20260927160000_natural_sort), so a list sorted here and
// one that arrived already sorted from a query never disagree.
const collator = new Intl.Collator('de', { numeric: true });

export const naturalCompare = (a: string, b: string): number => collator.compare(a, b);

/** A category as lists are grouped by it: Licht, Strom, Rigging … in the order the admins set. */
export type CategoryRank = { sortOrder: number; name: string };

/**
 * Categories in their set order, then by name; no category last. For printed
 * lists that put all the lighting first, then all the power, then the rigging.
 */
export const categoryCompare = (
	a: CategoryRank | null | undefined,
	b: CategoryRank | null | undefined
): number => {
	if (!a || !b) return Number(!a) - Number(!b);
	return a.sortOrder - b.sortOrder || naturalCompare(a.name, b.name);
};
