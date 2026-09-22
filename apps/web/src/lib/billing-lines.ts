import { localizedName } from '$lib/category';

// Units of the same product are separate rows in the database — each one is a
// real piece of equipment with its own tag and its own history — but a customer
// document lists them once with a quantity. This is the one place that collapse
// happens, so the web view and both print layouts always agree.

/** "2× Stativ, Kabel" — what a kit or a unit ships with, counted and sorted. */
export function summarizeContents(labels: string[]): string {
	const counts = new Map<string, number>();
	for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
	const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
	return [...counts]
		.sort(([a], [b]) => collator.compare(a, b))
		.map(([label, count]) => (count > 1 ? `${count}× ${label}` : label))
		.join(', ');
}

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
	// Service lines only — see $lib/service-lines.
	kind?: string;
	quantity?: unknown;
	unit?: string | null;
	unitPrice?: unknown;
	perDay?: boolean;
	note?: string | null;
	position?: number;
	categorySortOrder?: number | null;
};

export const isServiceItem = (item: { kind?: string }) => item.kind === 'SERVICE';

export type LineGroup<T extends GroupableItem> = {
	key: string;
	label: string;
	quantity: number;
	netPurchasePrice: number;
	ratePercent: number;
	dailyRate: number;
	lineTotal: number;
	items: T[];
	/** Set on a service line, which is priced by unit rather than by rate. */
	service: {
		unit: string | null;
		unitPrice: number;
		perDay: boolean;
		note: string | null;
		position: number;
	} | null;
};

export type CategoryGroup<T extends GroupableItem> = {
	key: string;
	name: string;
	color: string | null;
	lines: LineGroup<T>[];
	subtotal: number;
	/** A section of service lines, which follows the equipment. */
	isService: boolean;
	sortOrder: number;
};

// Lines only merge when every number a reader could check would be identical:
// same product, same purchase price, same rate. A unit priced differently keeps
// its own line rather than disappearing into an average.
// A service line is never merged: two "Techniker" lines were typed in as two.
function lineKey(item: GroupableItem): string {
	if (isServiceItem(item)) return `service:${item.id}`;
	const identity = item.productId ?? (item.bundleId ? `bundle:${item.bundleId}` : item.description);
	return `${identity}|${Number(item.netPurchasePrice)}|${Number(item.ratePercent)}`;
}

export function groupBillingItems<T extends GroupableItem>(
	items: T[],
	categoryLabel: (item: T) => string = (item) =>
		localizedName(item.categoryName, item.categoryNameDe) || 'Uncategorized'
): CategoryGroup<T>[] {
	const categories = new Map<string, CategoryGroup<T>>();
	const lines = new Map<string, LineGroup<T>>();

	for (const item of items) {
		const service = isServiceItem(item);
		// A service category and an equipment category never share a section,
		// even if an id could ever collide.
		const catKey = `${service ? 'service:' : ''}${item.categoryId ?? ''}`;
		let category = categories.get(catKey);
		if (!category) {
			category = {
				key: catKey,
				name: categoryLabel(item),
				color: item.categoryColor ?? null,
				lines: [],
				subtotal: 0,
				isService: service,
				sortOrder: item.categorySortOrder ?? 0
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
				items: [],
				service: service
					? {
							unit: item.unit ?? null,
							unitPrice: Number(item.unitPrice),
							perDay: item.perDay ?? false,
							note: item.note ?? null,
							position: item.position ?? 0
						}
					: null
			};
			lines.set(key, line);
			category.lines.push(line);
		}
		line.quantity = service ? Number(item.quantity) : line.quantity + 1;
		line.items.push(item);
		line.lineTotal += Number(item.lineTotal);
	}

	const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
	// Equipment reads alphabetically; services in the order they were arranged —
	// sections by the catalog's order, lines by hand. Array sort is stable, so
	// lines sharing a position stay in the order they were added.
	return [...categories.values()]
		.map((category) => ({
			...category,
			lines: category.isService
				? category.lines.sort((a, b) => a.service!.position - b.service!.position)
				: category.lines.sort(
						(a, b) =>
							collator.compare(a.label, b.label) ||
							a.netPurchasePrice - b.netPurchasePrice ||
							a.ratePercent - b.ratePercent ||
							collator.compare(a.key, b.key)
					)
		}))
		.sort(
			(a, b) =>
				Number(a.isService) - Number(b.isService) ||
				(a.isService ? a.sortOrder - b.sortOrder : 0) ||
				collator.compare(a.name, b.name) ||
				collator.compare(a.key, b.key)
		);
}

/** The tags behind a collapsed line, for the views that show what's in it. */
export function lineUnitLabels<T extends GroupableItem>(line: LineGroup<T>): string[] {
	return line.items.map((i) => i.description);
}

/**
 * Composition/accessory text stored after the first line of a description, or
 * a service line's note.
 */
export function lineSubtitle<T extends GroupableItem>(line: LineGroup<T>): string {
	if (line.service) return line.service.note?.trim() ?? '';
	return [
		...new Set(
			line.items
				.map((item) => item.description.split('\n').slice(1).join('\n').trim())
				.filter(Boolean)
		)
	].join('\n');
}
