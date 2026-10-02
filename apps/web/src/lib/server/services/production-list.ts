import { prisma } from '#lib/server/auth.js';
import type { Prisma } from '#lib/prisma/client.js';
import { naturalCompare } from '#lib/sort.js';
import { ACTIVE_ASSET_WHERE } from '#lib/asset-status.js';
import { compareGroups, type ListGroup, type ListLine } from '#lib/production-list.js';

// The list a production's equipment is worked through — checked (Prüfen),
// handed out (Ausgabe) or taken back (Rücknahme). The three differ only in
// what a tick means; the list is the same, so it is built here once:
//
// - sections by the shelf a unit is kept on, lent units by the org that lent
//   them, each unit followed by its accessories
// - interchangeable units without a tag (twenty identical cables) collected
//   into one counted line per product and shelf, as a stocktake counts them,
//   because nobody can scan them and nobody should tick them twenty times

export type { ListGroup, ListLine };

export const LIST_ITEM_INCLUDE = {
	asset: {
		select: {
			id: true,
			assetTag: true,
			orgIndex: true,
			organizationId: true,
			parentAssetId: true,
			bundleId: true,
			productId: true,
			locationId: true,
			location: { select: { name: true } },
			organization: { select: { name: true, shortName: true } },
			product: {
				select: { name: true, caption: true, manufacturer: { select: { name: true } } }
			},
			// Only whether there are any: a unit with accessories is never loose.
			accessories: { where: ACTIVE_ASSET_WHERE, select: { id: true }, take: 1 }
		}
	}
} satisfies Prisma.ProductionItemInclude;

export type ListedItem = Prisma.ProductionItemGetPayload<{ include: typeof LIST_ITEM_INCLUDE }>;

/** The production's items in these statuses, optionally only some orgs' units. */
export function listItems(productionId: string, statuses: string[], organizationIds?: string[]) {
	return prisma.productionItem.findMany({
		where: {
			productionId,
			status: { in: statuses },
			...(organizationIds ? { asset: { organizationId: { in: organizationIds } } } : {})
		},
		include: LIST_ITEM_INCLUDE
	});
}

export function lenderLabel(item: ListedItem) {
	const org = item.asset.organization;
	return org.shortName || org.name;
}

/**
 * Where a unit is listed. `byLender` is false for someone looking at their own
 * units only (a lending org): there every unit is on its own shelves.
 */
export function groupOf(item: ListedItem, productionOrgId: string, byLender: boolean): ListGroup {
	if (byLender && item.asset.organizationId !== productionOrgId) {
		return { kind: 'lender', name: lenderLabel(item) };
	}
	const location = item.asset.location?.name ?? null;
	return location ? { kind: 'location', name: location } : { kind: 'none', name: null };
}

/**
 * By section, then parents first, each followed by its accessories; by name
 * within. An accessory is listed under its parent's section even when it is
 * booked somewhere else — it travels with it.
 */
export function nestAndSort<
	T extends {
		assetId: string;
		accessoryOf: string | null;
		productName: string;
		assetTag: string | null;
		group: ListGroup;
	}
>(items: T[]) {
	const byName = (a: T, b: T) =>
		naturalCompare(a.productName, b.productName) ||
		naturalCompare(a.assetTag ?? '', b.assetTag ?? '');
	const ids = new Set(items.map((i) => i.assetId));
	const tops = items
		.filter((i) => !i.accessoryOf || !ids.has(i.accessoryOf))
		.sort((a, b) => compareGroups(a.group, b.group) || byName(a, b));
	return tops.flatMap((top) => [
		top,
		...items
			.filter((i) => i.accessoryOf === top.assetId && i !== top)
			.sort(byName)
			.map((i) => ({ ...i, group: top.group }))
	]);
}

/** Interchangeable with the others of its product on its shelf — see `ListLine`. */
export function isLoose(item: ListedItem) {
	const a = item.asset;
	return !a.assetTag && !a.bundleId && !a.parentAssetId && a.accessories.length === 0;
}

export function lineKey(item: ListedItem) {
	const a = item.asset;
	return `${a.productId}|${a.locationId ?? ''}|${a.organizationId}`;
}

/**
 * The counted lines of a list. A line of one is still a line: the row looks
 * the same whether the shelf holds one cable or forty.
 *
 * `state` says per unit whether it is done and whether this user may undo it;
 * the units of a line are in a stable order (lowest unit number first), which
 * is the order a count picks them in.
 */
export function buildLines(
	items: ListedItem[],
	productionOrgId: string,
	byLender: boolean,
	state: (item: ListedItem) => { done: boolean; undoable: boolean }
): ListLine[] {
	const lines = new Map<string, ListLine & { order: number[] }>();
	for (const item of items) {
		if (!isLoose(item)) continue;
		const key = lineKey(item);
		const lent = item.asset.organizationId !== productionOrgId;
		const line = lines.get(key) ?? {
			key,
			productName: item.asset.product.name,
			productCaption: item.asset.product.caption,
			manufacturerName: item.asset.product.manufacturer?.name ?? null,
			lentBy: lent ? lenderLabel(item) : null,
			group: groupOf(item, productionOrgId, byLender),
			assetIds: [],
			order: [],
			total: 0,
			done: 0,
			floor: 0
		};
		const s = state(item);
		line.assetIds.push(item.assetId);
		line.order.push(item.asset.orgIndex);
		line.total += 1;
		if (s.done) line.done += 1;
		if (s.done && !s.undoable) line.floor += 1;
		lines.set(key, line);
	}
	return [...lines.values()]
		.map(({ order, ...line }) => ({
			...line,
			assetIds: line.assetIds
				.map((id, i) => ({ id, n: order[i] }))
				.sort((a, b) => a.n - b.n)
				.map((x) => x.id)
		}))
		.sort(
			(a, b) =>
				compareGroups(a.group, b.group) ||
				naturalCompare(a.productName, b.productName) ||
				naturalCompare(a.key, b.key)
		);
}

/**
 * Which units of a line a count changes: to raise it, the first ones not done
 * yet; to lower it, the last undoable ones done. Fewer than asked when the
 * line runs out — a count is clamped, not refused.
 */
export function pickForCount(
	line: ListLine,
	count: number,
	state: (assetId: string) => { done: boolean; undoable: boolean }
): { add: string[]; remove: string[] } {
	const target = Math.max(line.floor, Math.min(line.total, Math.round(count)));
	const delta = target - line.done;
	if (delta > 0) {
		return { add: line.assetIds.filter((id) => !state(id).done).slice(0, delta), remove: [] };
	}
	if (delta < 0) {
		const undoable = line.assetIds.filter((id) => {
			const s = state(id);
			return s.done && s.undoable;
		});
		return { add: [], remove: undoable.slice(undoable.length + delta) };
	}
	return { add: [], remove: [] };
}
