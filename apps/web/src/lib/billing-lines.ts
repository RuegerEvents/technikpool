import { localizedName } from '$lib/category';

// Units of the same product are separate rows in the database — each one is a
// real piece of equipment with its own tag and its own history — but a customer
// document lists them once with a quantity. This is the one place that collapse
// happens, so the web view and both print layouts always agree.

export type GroupableItem = {
	id: string;
	categoryId: string | null;
	categoryName: string | null;
	categoryNameDe?: string | null;
	categoryColor: string | null;
	productId?: string | null;
	productLabel?: string | null;
	bundleId?: string | null;
	description: string;
	netPurchasePrice: unknown;
	ratePercent: unknown;
	dailyRate: unknown;
	lineTotal: unknown;
};

export type LineGroup<T extends GroupableItem> = {
	key: string;
	label: string;
	quantity: number;
	netPurchasePrice: number;
	ratePercent: number;
	dailyRate: number;
	lineTotal: number;
	items: T[];
};

export type CategoryGroup<T extends GroupableItem> = {
	key: string;
	name: string;
	color: string | null;
	lines: LineGroup<T>[];
	subtotal: number;
};

// Lines only merge when every number a reader could check would be identical:
// same product, same purchase price, same rate. A unit priced differently keeps
// its own line rather than disappearing into an average.
function lineKey(item: GroupableItem): string {
	const identity = item.productId ?? (item.bundleId ? `bundle:${item.bundleId}` : item.description);
	return `${identity}|${Number(item.netPurchasePrice)}|${Number(item.ratePercent)}`;
}

export function groupBillingItems<T extends GroupableItem>(items: T[]): CategoryGroup<T>[] {
	const categories = new Map<string, CategoryGroup<T>>();
	const lines = new Map<string, LineGroup<T>>();

	for (const item of items) {
		const catKey = item.categoryId ?? '';
		let category = categories.get(catKey);
		if (!category) {
			category = {
				key: catKey,
				name: localizedName(item.categoryName, item.categoryNameDe) || 'Uncategorized',
				color: item.categoryColor ?? null,
				lines: [],
				subtotal: 0
			};
			categories.set(catKey, category);
		}
		category.subtotal += Number(item.lineTotal);

		const key = `${catKey}::${lineKey(item)}`;
		let line = lines.get(key);
		if (!line) {
			line = {
				key,
				// Without a product snapshot (a bundle line, or a row written
				// before the snapshot existed) the description is all there is,
				// and such a line never merges with another anyway.
				label: item.productLabel ?? item.description,
				quantity: 0,
				netPurchasePrice: Number(item.netPurchasePrice),
				ratePercent: Number(item.ratePercent),
				dailyRate: Number(item.dailyRate),
				lineTotal: 0,
				items: []
			};
			lines.set(key, line);
			category.lines.push(line);
		}
		line.quantity++;
		line.items.push(item);
		line.lineTotal += Number(item.lineTotal);
	}

	return [...categories.values()];
}

/** The tags behind a collapsed line, for the views that show what's in it. */
export function lineUnitLabels<T extends GroupableItem>(line: LineGroup<T>): string[] {
	return line.items.map((i) => i.description);
}
