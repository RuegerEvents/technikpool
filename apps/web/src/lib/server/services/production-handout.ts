import { prisma } from '#lib/server/auth.js';
import {
	isSystemAdmin,
	productionVisibility,
	visibleProductionName,
	writableOrgIds
} from './access';
import { resolveScannedCode } from './asset-lookup';
import {
	CheckoutError,
	emptyAffected,
	mergeAffected,
	performBulkCheckout,
	performScan,
	undoCheckout,
	type AffectedRecords
} from './checkout';
import {
	buildLines,
	groupOf,
	lenderLabel,
	listItems,
	nestAndSort,
	pickForCount,
	type ListGroup,
	type ListLine,
	type ListedItem
} from './production-list';

// Handing a production's equipment out (Ausgabe) and taking it back
// (Rücknahme) against its list, the same list a check works through — see
// production-list.ts. Here a tick is not a note but the booking itself:
//
//   checkout  ticked = CHECKED_OUT   tick: check out   untick: back to booked
//   checkin   ticked = RETURNED      tick: onto its shelf   untick: out again
//
// Taking back lists what is booked but was never handed out as well: kit goes
// out without anyone scanning it often enough, and it comes back all the same.
// Ticking such a unit books what happened — out, then back — so its history
// and the production's list say it was there.
//
// so nothing is stored beyond the items' own status, and two people working
// through the same list see each other's ticks because they are the same
// rows. Scanning is the ordinary scan (`performScan`), and every rule of it —
// stand-ins, accessories coming along, what a lender may hand over — applies
// unchanged, because everything here goes through checkout.ts.
//
// Each person sees the units they can book: those of the orgs they are
// MEMBER+ of. Lent units are handed over by their lender and are only counted
// (`othersCount`), so the list never offers a tick that would be refused.

export type HandoutMode = 'checkout' | 'checkin';

const MODE_STATUSES: Record<HandoutMode, string[]> = {
	checkout: ['APPROVED', 'CHECKED_OUT'],
	checkin: ['APPROVED', 'CHECKED_OUT', 'RETURNED']
};

const DONE_STATUS: Record<HandoutMode, string> = {
	checkout: 'CHECKED_OUT',
	checkin: 'RETURNED'
};

export interface HandoutItem {
	assetId: string;
	assetTag: string | null;
	productName: string;
	productCaption: string | null;
	productImagePath: string | null;
	manufacturerName: string | null;
	lentBy: string | null;
	accessoryOf: string | null;
	group: ListGroup;
	status: 'APPROVED' | 'CHECKED_OUT' | 'RETURNED';
	done: boolean;
	received: boolean;
	returnReported: boolean;
}

export interface HandoutView {
	mode: HandoutMode;
	productionId: string;
	productionName: string;
	cancelled: boolean;
	/** The side the list is seen from, and the others this user could pick. */
	side: HandoutSide;
	sides: HandoutSide[];
	items: HandoutItem[];
	lines: ListLine[];
	/** Units on the production in this step that other orgs hand over themselves. */
	othersCount: number;
}

/**
 * One way of looking at the list, as with a check (`CheckSide`). The
 * production's own side lists every unit this user can book; a lending org's
 * side only that org's units, by shelf — what it has to pack.
 */
export interface HandoutSide {
	organizationId: string;
	organizationName: string;
	own: boolean;
}

/**
 * Whose units this user books here, seen from `organizationId`'s side or the
 * first one they stand on. A system admin books all of them; anyone else needs
 * to be MEMBER+ of the production's org or of an org with units on it —
 * otherwise there is nothing for them on the list, and the production is none
 * of their business.
 */
async function handoutScope(userId: string, productionId: string, organizationId?: string) {
	const production = await prisma.production.findUnique({
		where: { id: productionId },
		select: {
			id: true,
			name: true,
			organizationId: true,
			cancelledAt: true,
			organization: { select: { name: true, shortName: true } }
		}
	});
	if (!production) throw new CheckoutError('forbidden', 'No access to this production');
	const [writable, admin] = await Promise.all([writableOrgIds(userId), isSystemAdmin(userId)]);
	const lenders = await prisma.organization.findMany({
		where: {
			id: { not: production.organizationId, ...(admin ? {} : { in: writable }) },
			assets: { some: { productionItems: { some: { productionId } } } }
		},
		select: { id: true, name: true, shortName: true },
		orderBy: { name: 'asc' }
	});
	const sides: HandoutSide[] = [
		...(admin || writable.includes(production.organizationId)
			? [
					{
						organizationId: production.organizationId,
						organizationName: production.organization.shortName || production.organization.name,
						own: true
					}
				]
			: []),
		...lenders.map((org) => ({
			organizationId: org.id,
			organizationName: org.shortName || org.name,
			own: false
		}))
	];
	if (sides.length === 0) throw new CheckoutError('forbidden', 'No access to this production');
	const side = sides.find((s) => s.organizationId === organizationId) ?? sides[0];
	return {
		production,
		sides,
		side,
		organizationIds: side.own ? (admin ? undefined : writable) : [side.organizationId],
		byLender: side.own
	};
}

function isDone(item: ListedItem, mode: HandoutMode) {
	return item.status === DONE_STATUS[mode];
}

export async function getHandout(
	userId: string,
	productionId: string,
	mode: HandoutMode,
	organizationId?: string
): Promise<HandoutView> {
	const { production, sides, side, organizationIds, byLender } = await handoutScope(
		userId,
		productionId,
		organizationId
	);
	const [listed, total] = await Promise.all([
		listItems(productionId, MODE_STATUSES[mode], organizationIds),
		prisma.productionItem.count({
			where: { productionId, status: { in: MODE_STATUSES[mode] } }
		})
	]);
	const productionOrgId = production.organizationId;

	const items: HandoutItem[] = nestAndSort(
		listed.map((item) => {
			const lent = item.asset.organizationId !== productionOrgId;
			return {
				assetId: item.assetId,
				assetTag: item.asset.assetTag,
				productName: item.asset.product.name,
				productCaption: item.asset.product.caption,
				productImagePath: item.asset.product.imagePath,
				manufacturerName: item.asset.product.manufacturer?.name ?? null,
				lentBy: lent ? lenderLabel(item) : null,
				accessoryOf: item.asset.parentAssetId,
				group: groupOf(item, productionOrgId, byLender),
				status: item.status as HandoutItem['status'],
				done: isDone(item, mode),
				received: lent && item.receivedAt !== null,
				returnReported: lent && item.returnReportedAt !== null
			};
		})
	);

	return {
		mode,
		productionId,
		productionName: production.name,
		cancelled: production.cancelledAt !== null,
		side,
		sides,
		items,
		lines: buildLines(listed, productionOrgId, byLender, (item) => ({
			done: isDone(item, mode),
			undoable: true
		})),
		othersCount: total - listed.length
	};
}

/** How far each step has got, for the production page's buttons. Null: nothing to book here. */
export async function handoutSummary(userId: string, productionId: string) {
	let scope;
	try {
		scope = await handoutScope(userId, productionId);
	} catch (err) {
		if (err instanceof CheckoutError) return null;
		throw err;
	}
	const items = await prisma.productionItem.groupBy({
		by: ['status'],
		where: {
			productionId,
			...(scope.organizationIds ? { asset: { organizationId: { in: scope.organizationIds } } } : {})
		},
		_count: true
	});
	const count = (status: string) => items.find((i) => i.status === status)?._count ?? 0;
	return {
		cancelled: scope.production.cancelledAt !== null,
		approved: count('APPROVED'),
		checkedOut: count('CHECKED_OUT'),
		returned: count('RETURNED')
	};
}

/**
 * A scanned code: checked out to the production, or put back on its own shelf.
 * Taking back is the ordinary scan onto a location, which is what returns a
 * unit from wherever it is out — the unit's own location is the target, so
 * nobody has to pick one.
 */
export async function scanIntoHandout(
	userId: string,
	productionId: string,
	mode: HandoutMode,
	code: string
) {
	await handoutScope(userId, productionId);
	if (mode === 'checkout') {
		return performScan(userId, {
			assetTag: code,
			targetType: 'production',
			targetId: productionId
		});
	}
	const match = await resolveScannedCode(userId, code);
	if (match.kind === 'ambiguous') {
		throw new CheckoutError(
			'serial_ambiguous',
			`Serial number "${code}" is on more than one unit — scan the asset tag instead`,
			code
		);
	}
	if (match.kind === 'not_found') {
		throw new CheckoutError('asset_not_found', `Tag "${code}" not found`, code);
	}
	const asset = await prisma.asset.findUniqueOrThrow({
		where: { id: match.assetId },
		select: { id: true, locationId: true, productId: true, organizationId: true }
	});

	// Booked here and never handed out — the unit itself, or one it can stand in
	// for: the checkout that nobody scanned is booked first, so the return that
	// follows has something to return from.
	const affected = emptyAffected();
	const out = await prisma.productionItem.findFirst({
		where: { productionId, assetId: asset.id, status: 'CHECKED_OUT' },
		select: { id: true }
	});
	const booked =
		!out &&
		(await prisma.productionItem.findFirst({
			where: {
				productionId,
				status: 'APPROVED',
				OR: [
					{ assetId: asset.id },
					{
						sourceBundleId: null,
						sourceParentAssetId: null,
						asset: { productId: asset.productId, organizationId: asset.organizationId }
					}
				]
			},
			select: { id: true }
		}));
	if (booked) {
		const step = await performScan(userId, {
			assetTag: code,
			targetType: 'production',
			targetId: productionId
		});
		mergeAffected(affected, step.affected);
	}

	const back = await performScan(userId, {
		assetTag: code,
		targetType: 'location',
		targetId: asset.locationId
	});
	return { result: back.result, affected: mergeAffected(affected, back.affected) };
}

/** Ticks or unticks units by hand — see the table at the top. */
export async function setHandoutDone(
	userId: string,
	productionId: string,
	mode: HandoutMode,
	assetIds: string[],
	done: boolean
): Promise<{ result: { count: number }; affected: AffectedRecords }> {
	if (assetIds.length === 0) return { result: { count: 0 }, affected: emptyAffected() };
	await handoutScope(userId, productionId);

	if (mode === 'checkout' && !done) return undoCheckout(userId, productionId, assetIds);
	if (mode === 'checkout' || !done) {
		const { result, affected } = await performBulkCheckout(userId, {
			assetIds,
			targetType: 'production',
			targetId: productionId
		});
		return { result: { count: result.count }, affected };
	}

	// Booked and never handed out: the checkout first, so there is something
	// to return — see the top of this file.
	const affected = emptyAffected();
	const unshipped = await prisma.productionItem.findMany({
		where: { productionId, assetId: { in: assetIds }, status: 'APPROVED' },
		select: { assetId: true }
	});
	if (unshipped.length > 0) {
		const step = await performBulkCheckout(userId, {
			assetIds: unshipped.map((i) => i.assetId),
			targetType: 'production',
			targetId: productionId
		});
		mergeAffected(affected, step.affected);
	}

	// Back onto the shelf each unit is kept on.
	const assets = await prisma.asset.findMany({
		where: { id: { in: assetIds } },
		select: { id: true, locationId: true }
	});
	const byShelf = new Map<string, string[]>();
	for (const a of assets) byShelf.set(a.locationId, [...(byShelf.get(a.locationId) ?? []), a.id]);
	let count = 0;
	for (const [locationId, ids] of byShelf) {
		const step = await performBulkCheckout(userId, {
			assetIds: ids,
			targetType: 'location',
			targetId: locationId
		});
		count += step.result.count;
		mergeAffected(affected, step.affected);
	}
	return { result: { count }, affected };
}

/** Sets how many units of a counted line are done — out, or back. */
export async function setHandoutLineCount(
	userId: string,
	productionId: string,
	mode: HandoutMode,
	key: string,
	count: number
) {
	const { production, organizationIds, byLender } = await handoutScope(userId, productionId);
	const listed = await listItems(productionId, MODE_STATUSES[mode], organizationIds);
	const byId = new Map(listed.map((i) => [i.assetId, i]));
	const state = (assetId: string) => ({
		done: byId.has(assetId) && isDone(byId.get(assetId)!, mode),
		undoable: true
	});
	const line = buildLines(listed, production.organizationId, byLender, (item) =>
		state(item.assetId)
	).find((l) => l.key === key);
	if (!line) return { result: { done: 0 }, affected: emptyAffected() };

	const { add, remove } = pickForCount(line, count, state);
	const affected = emptyAffected();
	if (add.length > 0) {
		mergeAffected(affected, (await setHandoutDone(userId, productionId, mode, add, true)).affected);
	}
	if (remove.length > 0) {
		mergeAffected(
			affected,
			(await setHandoutDone(userId, productionId, mode, remove, false)).affected
		);
	}
	return { result: { done: line.done + add.length - remove.length }, affected };
}

// ---------------------------------------------------------------------------
// What a lender has to pack

export interface PackTodo {
	productionId: string;
	productionName: string;
	startDate: Date | null;
	/** The lending org whose units these are — the side its list opens on. */
	organizationId: string;
	organizationName: string;
	count: number;
}

/** How far ahead the dashboard looks for kit to pack for someone else. */
const PACK_AHEAD_DAYS = 7;

/**
 * Units of this user's orgs that another org's production has booked and
 * nobody has handed out yet, for productions starting within a week (or
 * already running). One row per production and lending org, soonest first.
 * Packing earlier is what the productions list's "Pack" button is for.
 */
export async function packTodos(userId: string): Promise<PackTodo[]> {
	const writable = await writableOrgIds(userId);
	if (writable.length === 0) return [];
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const horizon = new Date(today.getTime() + (PACK_AHEAD_DAYS + 1) * 24 * 60 * 60 * 1000);

	const [items, canSee] = await Promise.all([
		prisma.productionItem.findMany({
			where: {
				status: 'APPROVED',
				asset: { organizationId: { in: writable } },
				production: {
					cancelledAt: null,
					startDate: { not: null, lt: horizon },
					OR: [{ endDate: { gte: today } }, { endDate: null, startDate: { gte: today } }]
				}
			},
			select: {
				asset: {
					select: {
						organizationId: true,
						organization: { select: { name: true, shortName: true } }
					}
				},
				production: {
					select: {
						id: true,
						name: true,
						startDate: true,
						organizationId: true,
						organization: { select: { name: true, shortName: true } }
					}
				}
			}
		}),
		productionVisibility(userId)
	]);

	const rows = new Map<string, PackTodo>();
	for (const item of items) {
		// Our own productions are packed by handing them out; this is for others'.
		if (item.asset.organizationId === item.production.organizationId) continue;
		const key = `${item.production.id}|${item.asset.organizationId}`;
		const row = rows.get(key) ?? {
			productionId: item.production.id,
			productionName: visibleProductionName(item.production, canSee),
			startDate: item.production.startDate,
			organizationId: item.asset.organizationId,
			organizationName: item.asset.organization.shortName || item.asset.organization.name,
			count: 0
		};
		row.count += 1;
		rows.set(key, row);
	}
	return [...rows.values()].sort(
		(a, b) => (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0)
	);
}
