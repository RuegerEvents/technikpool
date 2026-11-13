import { prisma } from '#lib/server/auth.js';
import type { Prisma } from '#lib/prisma/client.js';
import { naturalCompare } from '#lib/sort.js';
import { ACTIVE_ASSET_WHERE } from '#lib/asset-status.js';
import { withCaption } from '#lib/product-label.js';
import {
	compareGroups,
	type ListGroup,
	type ListKit,
	type ListLine
} from '#lib/production-list.js';
import {
	casePaths,
	isPackCaseUnit,
	sectionCaseOf,
	type ListCase,
	type PackNode
} from '#lib/pack-cases.js';

// The list a production's equipment is worked through — checked (Prüfen),
// handed out (Ausgabe) or taken back (Rücknahme). The three differ only in
// what a tick means; the list is the same, so it is built here once:
//
// - sections by the shelf a unit is kept on, lent units by the org that lent
//   them, each unit followed by its accessories
// - interchangeable units without a tag (twenty identical cables) collected
//   into one counted line per product and shelf, as a stocktake counts them,
//   because nobody can scan them and nobody should tick them twenty times

export type { ListCase, ListGroup, ListKit, ListLine };

const KIT_REF_SELECT = {
	id: true,
	tag: true,
	template: { select: { name: true, caption: true } }
} satisfies Prisma.AssetBundleSelect;

export const KIT_SELECT = {
	...KIT_REF_SELECT,
	parentBundleId: true,
	parentBundle: { select: KIT_REF_SELECT }
} satisfies Prisma.AssetBundleSelect;

type KitRow = {
	id: string;
	tag: string | null;
	template: { name: string; caption: string | null };
};

/**
 * A unit's kit as the list shows it — see `ListKit`. A kit inside another one
 * is headed by its own name, with the outer kit as `parent`.
 */
export function kitOf(bundle: (KitRow & { parentBundle?: KitRow | null }) | null): ListKit | null {
	const ref = (kit: KitRow) => ({
		id: kit.id,
		name: withCaption(kit.template.name, kit.template.caption),
		tag: kit.tag
	});
	return bundle
		? { ...ref(bundle), parent: bundle.parentBundle ? ref(bundle.parentBundle) : null }
		: null;
}

export const LIST_ITEM_INCLUDE = {
	asset: {
		select: {
			id: true,
			assetTag: true,
			orgIndex: true,
			organizationId: true,
			parentAssetId: true,
			bundleId: true,
			bundle: { select: KIT_SELECT },
			productId: true,
			locationId: true,
			// The earliest due inspection of any type, for "overdue" on a hand-out list.
			nextInspectionDue: true,
			location: { select: { name: true } },
			organization: { select: { name: true, shortName: true } },
			product: {
				select: {
					name: true,
					caption: true,
					imagePath: true,
					isContainer: true,
					// For the cable colour, with the owner's scheme (#lib/cable-colors).
					lengthCm: true,
					manufacturer: { select: { name: true } }
				}
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

const PACK_NODE_SELECT = {
	id: true,
	packedInItemId: true,
	asset: {
		select: {
			id: true,
			assetTag: true,
			orgIndex: true,
			bundleId: true,
			product: { select: { name: true, caption: true, isContainer: true } }
		}
	}
} satisfies Prisma.ProductionItemSelect;

/**
 * The production's pack cases and what is in which — see #lib/pack-cases.ts.
 * Read over every item on it, whoever's, since a lender's units may travel in
 * the production's case and the other way round. `caseOf` is the case an item
 * is listed under: its own section for a case, else the one it is packed in.
 */
export async function loadPacking(productionId: string) {
	const rows = await prisma.productionItem.findMany({
		where: { productionId, status: { in: ['APPROVED', 'CHECKED_OUT', 'RETURNED'] } },
		select: PACK_NODE_SELECT
	});
	const nodes: PackNode[] = rows.map((row) => ({
		itemId: row.id,
		packedInItemId: row.packedInItemId,
		isPackCase: isPackCaseUnit(row.asset),
		ref: {
			assetId: row.asset.id,
			name: withCaption(row.asset.product.name, row.asset.product.caption),
			tag: row.asset.assetTag,
			orgIndex: row.asset.orgIndex
		}
	}));
	const byItem = new Map(nodes.map((n) => [n.itemId, n]));
	const byAsset = new Map(nodes.map((n) => [n.ref.assetId, n]));
	const cases = casePaths(nodes);
	return {
		byItem,
		byAsset,
		cases,
		caseOf(item: { id: string }): ListCase | null {
			const node = byItem.get(item.id);
			return node ? sectionCaseOf(node, cases) : null;
		}
	};
}

export type Packing = Awaited<ReturnType<typeof loadPacking>>;

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
 * within. A kit's units stay together, placed by the kit's name. An accessory
 * is listed under its parent's section and kit even when it is booked
 * somewhere else — it travels with it.
 */
export function nestAndSort<
	T extends {
		assetId: string;
		accessoryOf: string | null;
		productName: string;
		assetTag: string | null;
		group: ListGroup;
		kit: ListKit | null;
		packCase?: ListCase | null;
	}
>(items: T[]) {
	const byName = (a: T, b: T) =>
		naturalCompare(a.productName, b.productName) ||
		naturalCompare(a.assetTag ?? '', b.assetTag ?? '');
	// A kit inside another one is placed by the outer kit, right after its
	// own units, so the case reads top to bottom as it is packed.
	const outer = (t: T) => t.kit?.parent ?? t.kit;
	const byKit = (a: T, b: T) =>
		naturalCompare(outer(a)?.name ?? a.productName, outer(b)?.name ?? b.productName) ||
		naturalCompare(outer(a)?.tag ?? '', outer(b)?.tag ?? '') ||
		naturalCompare(outer(a)?.id ?? '', outer(b)?.id ?? '') ||
		Number(!!a.kit?.parent) - Number(!!b.kit?.parent) ||
		naturalCompare(a.kit?.name ?? '', b.kit?.name ?? '') ||
		naturalCompare(a.kit?.id ?? '', b.kit?.id ?? '');
	const ids = new Set(items.map((i) => i.assetId));
	const tops = items
		.filter((i) => !i.accessoryOf || !ids.has(i.accessoryOf))
		.sort((a, b) => compareGroups(a.group, b.group) || byKit(a, b) || byName(a, b));
	return tops.flatMap((top) => [
		top,
		...items
			.filter((i) => i.accessoryOf === top.assetId && i !== top)
			.sort(byName)
			.map((i) => ({
				...i,
				group: top.group,
				kit: top.kit,
				// In the case its unit is in: it travels with it.
				...(top.packCase !== undefined ? { packCase: top.packCase } : {})
			}))
	]);
}

/** Interchangeable with the others of its product on its shelf — see `ListLine`. */
export function isLoose(item: ListedItem) {
	const a = item.asset;
	// A pack case heads a section of its own, even one without a tag.
	return (
		!a.assetTag &&
		!a.bundleId &&
		!a.parentAssetId &&
		a.accessories.length === 0 &&
		!a.product.isContainer
	);
}

/** Product, shelf, owner and pack case: units under one key are one line. */
export function lineKey(item: ListedItem, packCase: ListCase | null = null) {
	const a = item.asset;
	return `${a.productId}|${a.locationId ?? ''}|${a.organizationId}|${packCase?.assetId ?? ''}`;
}

/**
 * The counted lines of a list. A line of one is still a line: the row looks
 * the same whether the shelf holds one cable or forty.
 *
 * `state` says per unit whether it is done and whether this user may undo it;
 * the units of a line are in a stable order (lowest unit number first), which
 * is the order a count picks them in. With `packing`, the units packed into a
 * case are a line of their own under it.
 */
export function buildLines(
	items: ListedItem[],
	productionOrgId: string,
	byLender: boolean,
	state: (item: ListedItem) => { done: boolean; undoable: boolean },
	packing?: Pick<Packing, 'caseOf'>
): ListLine[] {
	const lines = new Map<string, ListLine & { order: number[] }>();
	for (const item of items) {
		if (!isLoose(item)) continue;
		const packCase = packing?.caseOf(item) ?? null;
		const key = lineKey(item, packCase);
		const lent = item.asset.organizationId !== productionOrgId;
		const line = lines.get(key) ?? {
			key,
			productName: item.asset.product.name,
			productCaption: item.asset.product.caption,
			productImagePath: item.asset.product.imagePath,
			manufacturerName: item.asset.product.manufacturer?.name ?? null,
			lentBy: lent ? lenderLabel(item) : null,
			ownerOrgId: item.asset.organizationId,
			lengthCm: item.asset.product.lengthCm,
			group: groupOf(item, productionOrgId, byLender),
			assetIds: [],
			order: [],
			total: 0,
			done: 0,
			floor: 0,
			packCase
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
