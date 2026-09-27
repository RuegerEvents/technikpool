// How every name in the app is ordered: "2m" before "10m", "A-2" before "a-10",
// "Äpfel" among the As. The database sorts the same way through the "natural"
// collation (migration 20260927160000_natural_sort), so a list sorted here and
// one that arrived already sorted from a query never disagree.
const collator = new Intl.Collator('de', { numeric: true });

export const naturalCompare = (a: string, b: string): number => collator.compare(a, b);
