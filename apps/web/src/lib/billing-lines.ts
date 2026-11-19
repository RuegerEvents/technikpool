import { naturalCompare } from '#lib/sort.js';
import { localizedName } from '#lib/category.js';

// Units of the same product are separate rows in the database — each one is a
// real piece of equipment with its own tag and its own history — but a customer
// document lists them once with a quantity. This is the one place that collapse
// happens, so the web view and both print layouts always agree.

/** "2× Stativ, Kabel" — what a kit or a unit ships with, counted and sorted. */
export function summarizeContents(labels: string[]): string {
	const counts = new Map<string, number>();
	for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
	return [...counts]
		.sort(([a], [b]) => naturalCompare(a, b))
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
	/**
	 * The product or kit an equipment line stands for (`product:…`,
	 * `bundle:…`): what a collective line is kept by. Null on a service line
	 * and on rows too old to have a product snapshot.
	 */
	groupKey: string | null;
	/** A 0,00 € line the document leaves off its printout (`hideZeroLines`). */
	hidden: boolean;
	/**
	 * Set on a collective line ("Kabel & Strom, pauschal"): the lines folded
	 * into it, and what they read as underneath ("19× DMX 2 m, 8× …").
	 */
	collective: { id: string; members: LineGroup<T>[]; contents: string } | null;
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
/**
 * A document's collective lines, as stored in its `lineGroups` column: each
 * one folds every equipment line whose `groupKey` is in `keys`. By key rather
 * than by item, so a group survives "update from production" and picks up a
 * further unit of a product already in it.
 */
export type BillingLineGroup = { id: string; label: string; keys: string[] };

/** The stored JSON, read leniently: anything malformed is dropped, never thrown. */
export function parseLineGroups(value: unknown): BillingLineGroup[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		if (!entry || typeof entry !== 'object') return [];
		const { id, label, keys } = entry as Record<string, unknown>;
		if (typeof id !== 'string' || typeof label !== 'string' || !Array.isArray(keys)) return [];
		return [{ id, label, keys: keys.filter((key): key is string => typeof key === 'string') }];
	});
}

export type BillingLayout = {
	lineGroups?: unknown;
	hideZeroLines?: boolean;
};

function groupKeyOf(item: GroupableItem): string | null {
	if (isServiceItem(item)) return null;
	if (item.productId) return `product:${item.productId}`;
	if (item.bundleId) return `bundle:${item.bundleId}`;
	return null;
}

const centsOf = (value: number) => Math.round(value * 100);

function lineKey(item: GroupableItem): string {
	if (isServiceItem(item)) return `service:${item.id}`;
	const identity = item.productId ?? (item.bundleId ? `bundle:${item.bundleId}` : item.description);
	return `${identity}|${Number(item.netPurchasePrice)}|${Number(item.ratePercent)}`;
}

export function groupBillingItems<T extends GroupableItem>(
	items: T[],
	categoryLabel: (item: T) => string = (item) =>
		localizedName(item.categoryName, item.categoryNameDe) || 'Uncategorized',
	layout: BillingLayout = {}
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
				// A service line typed in without a section ("Sonstiges": a deduction
				// for a broken unit, a one-off charge) prints after every section.
				sortOrder:
					service && !item.categoryId ? Number.MAX_SAFE_INTEGER : (item.categorySortOrder ?? 0)
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
				groupKey: groupKeyOf(item),
				hidden: false,
				collective: null,
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

	// Equipment reads alphabetically; services in the order they were arranged —
	// sections by the catalog's order, lines by hand. Array sort is stable, so
	// lines sharing a position stay in the order they were added.
	const sections = [...categories.values()]
		.map((category) => ({
			...category,
			lines: category.isService
				? category.lines.sort((a, b) => a.service!.position - b.service!.position)
				: category.lines.sort(
						(a, b) =>
							naturalCompare(a.label, b.label) ||
							a.netPurchasePrice - b.netPurchasePrice ||
							a.ratePercent - b.ratePercent ||
							naturalCompare(a.key, b.key)
					)
		}))
		.sort(
			(a, b) =>
				Number(a.isService) - Number(b.isService) ||
				(a.isService ? a.sortOrder - b.sortOrder : 0) ||
				naturalCompare(a.name, b.name) ||
				naturalCompare(a.key, b.key)
		);
	return applyLayout(sections, layout);
}

/**
 * Hides the 0,00 € lines and folds the collective ones. A collective line
 * takes the place of its first member, in that member's section, and each
 * section's subtotal is what it then shows; a section left with no lines goes.
 */
function applyLayout<T extends GroupableItem>(
	sections: CategoryGroup<T>[],
	layout: BillingLayout
): CategoryGroup<T>[] {
	const groups = parseLineGroups(layout.lineGroups);
	if (layout.hideZeroLines)
		for (const section of sections)
			for (const line of section.lines)
				if (!line.service && centsOf(line.lineTotal) === 0) line.hidden = true;
	if (groups.length === 0) return sections;

	const claimed = new Set<string>();
	for (const group of groups) {
		const keys = new Set(group.keys.filter((key) => !claimed.has(key)));
		for (const key of keys) claimed.add(key);
		const members = sections.flatMap((section) =>
			section.lines.filter((line) => line.groupKey !== null && keys.has(line.groupKey))
		);
		if (members.length === 0) continue;
		const host = sections.find((section) => section.lines.includes(members[0]))!;
		const at = host.lines.indexOf(members[0]);
		const lineTotal = members.reduce((sum, line) => sum + centsOf(line.lineTotal), 0) / 100;
		const collective: LineGroup<T> = {
			key: `group:${group.id}`,
			label: group.label,
			quantity: 1,
			netPurchasePrice: 0,
			ratePercent: 0,
			dailyRate: 0,
			lineTotal,
			items: members.flatMap((line) => line.items),
			groupKey: null,
			hidden: !!layout.hideZeroLines && centsOf(lineTotal) === 0,
			collective: {
				id: group.id,
				members,
				contents: members
					.filter((line) => !line.hidden)
					.map((line) => {
						const label = line.label.split('\n')[0];
						return line.quantity > 1 ? `${line.quantity}× ${label}` : label;
					})
					.join(', ')
			},
			service: null
		};
		const folded = new Set(members);
		for (const section of sections)
			section.lines = section.lines.filter((line) => !folded.has(line));
		host.lines.splice(at, 0, collective);
	}
	return sections
		.filter((section) => section.lines.length > 0)
		.map((section) => ({
			...section,
			subtotal: section.lines.reduce((sum, line) => sum + centsOf(line.lineTotal), 0) / 100
		}));
}

/** What goes on paper and into the e-invoice XML: no hidden line, no empty section. */
export function printedSections<T extends GroupableItem>(
	sections: CategoryGroup<T>[]
): CategoryGroup<T>[] {
	return sections
		.map((section) => ({ ...section, lines: section.lines.filter((line) => !line.hidden) }))
		.filter((section) => section.lines.length > 0);
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
	if (line.collective) return line.collective.contents;
	return [
		...new Set(
			line.items
				.map((item) => item.description.split('\n').slice(1).join('\n').trim())
				.filter(Boolean)
		)
	].join('\n');
}
