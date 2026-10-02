import { prisma } from '$lib/server/auth';
import { naturalCompare } from '$lib/sort';
import { userLabel } from '$lib/user-label.svelte';
import type {
	HandoverReceivedData,
	ProductionCheckedData,
	ReturnReportedData
} from '$lib/types/asset-transaction';
import {
	isSystemAdmin,
	productionVisibility,
	visibleProductionName,
	writableOrgIds
} from './access';
import { resolveScannedCode } from './asset-lookup';
import {
	buildLines,
	groupOf,
	listItems,
	nestAndSort,
	pickForCount,
	type ListGroup,
	type ListLine,
	type ListedItem
} from './production-list';

// Checking a production's equipment against its list (Prüfen), and the two
// steps of a loan that belong to the borrower.
//
// A check changes no asset. It can be run as often as anyone likes — in the
// warehouse while packing, again on location — and several people tick into
// the same one, so the ticks are stored (like a stocktake's), not held by one
// device (like a case check's).
//
// A check belongs to one side of the production. The org that runs it checks
// every unit on it; a lending org checks only its own units, before handing
// them over. Each side has at most one open check at a time, and never ticks
// into the other's.
//
// A lent unit changes hands twice, and each hand says so:
//
//   lender scans it out (checkout.ts)      → CHECKED_OUT, receipt open
//   borrower confirms receipt (here)       → receivedAt
//   borrower reports it sent back (here)   → returnReportedAt
//   lender scans it onto a shelf (checkout.ts) → RETURNED
//
// The borrower's two steps are columns on the item rather than statuses, so
// every list that asks "is it out?" keeps asking CHECKED_OUT and nothing else.
// Neither step holds anything back: the lender taking a unit back works with or
// without a report, because the unit is on their shelf either way.
//
// Framework-agnostic like the rest of this directory: the remote functions and
// /api/v1 each turn a ProductionCheckError into their own error shape.

export class ProductionCheckError extends Error {
	constructor(
		readonly code:
			| 'not_found'
			| 'forbidden'
			| 'asset_not_found'
			| 'serial_ambiguous'
			| 'check_closed'
			| 'tick_not_yours'
			| 'production_cancelled'
			| 'receipt_forbidden',
		message: string,
		readonly param?: string
	) {
		super(message);
		this.name = 'ProductionCheckError';
	}
}

export const PRODUCTION_CHECK_ERROR_STATUS: Record<ProductionCheckError['code'], number> = {
	not_found: 404,
	forbidden: 403,
	asset_not_found: 404,
	serial_ambiguous: 409,
	check_closed: 409,
	tick_not_yours: 403,
	production_cancelled: 409,
	receipt_forbidden: 403
};

/** What a check is against: what is on its way to the production or out on it. */
const LISTED_STATUSES = ['APPROVED', 'CHECKED_OUT'];

export interface CheckSide {
	organizationId: string;
	organizationName: string;
	/** The production's own org: the whole list, and the borrower's confirmations. */
	own: boolean;
}

export interface ProductionCheckItem {
	assetId: string;
	assetTag: string | null;
	productName: string;
	productCaption: string | null;
	manufacturerName: string | null;
	/** The org that owns the unit, shown when it is not the production's. */
	lentBy: string | null;
	/** An accessory's parent, so the list can nest it. */
	accessoryOf: string | null;
	/**
	 * The section the unit is listed under — see `groupOf`. Items arrive sorted
	 * by it, so a client starts a new heading whenever it changes.
	 */
	group: CheckGroup;
	status: 'APPROVED' | 'CHECKED_OUT';
	received: boolean;
	returnReported: boolean;
	tick: { userName: string; mine: boolean; via: 'scan' | 'manual'; at: Date } | null;
}

export type CheckGroup = ListGroup;

export interface ProductionCheckUnexpected {
	assetId: string;
	assetTag: string | null;
	productName: string;
	userName: string;
	mine: boolean;
}

export interface ProductionCheckView {
	id: string;
	status: 'OPEN' | 'CLOSED';
	productionId: string;
	productionName: string;
	side: CheckSide;
	createdAt: Date;
	createdBy: string;
	closedAt: Date | null;
	closedBy: string | null;
	items: ProductionCheckItem[];
	/** Units without a tag, counted per product and shelf — see `ListLine`. */
	lines: ListLine[];
	unexpected: ProductionCheckUnexpected[];
	/** How many ticked lent units each borrower step would apply to. */
	canConfirmReceipt: number;
	canReportReturn: number;
}

export type CheckScanResult = {
	result: 'ticked' | 'already' | 'unexpected';
	assetTag: string;
	productName: string;
	/** Units ticked by this scan: the unit and its accessories that carry no tag of their own. */
	ticked: number;
};

// ---------------------------------------------------------------------------
// Who stands where

/**
 * Whether the user is on the borrowing side of this production: MEMBER+ of the
 * org that runs it, or its crew. Crew counts because on location it is
 * usually crew who takes the kit off the truck. A system admin is not
 * automatically on it — they run the server, and receiving equipment is a
 * statement about a place they are not standing in.
 */
export async function onProductionSide(
	userId: string,
	production: { id: string; organizationId: string }
) {
	if ((await writableOrgIds(userId)).includes(production.organizationId)) return true;
	const crew = await prisma.productionCrew.findFirst({
		where: {
			productionId: production.id,
			userId,
			// As in access.ts: a crew row outlives a membership, the access does not.
			production: { organization: { members: { some: { userId } } } }
		},
		select: { id: true }
	});
	return crew !== null;
}

/** The sides this user may check a production as — usually one. */
export async function checkSides(userId: string, productionId: string): Promise<CheckSide[]> {
	const production = await prisma.production.findUnique({
		where: { id: productionId },
		select: {
			id: true,
			organizationId: true,
			organization: { select: { id: true, name: true } }
		}
	});
	if (!production) throw new ProductionCheckError('not_found', 'Production not found');

	const [writable, admin] = await Promise.all([writableOrgIds(userId), isSystemAdmin(userId)]);
	const sides: CheckSide[] = [];
	if (admin || (await onProductionSide(userId, production))) {
		sides.push({
			organizationId: production.organizationId,
			organizationName: production.organization.name,
			own: true
		});
	}

	const lenders = await prisma.organization.findMany({
		where: {
			id: { not: production.organizationId, ...(admin ? {} : { in: writable }) },
			assets: {
				// RETURNED too, so a lender can still open the check it ran once
				// everything is back.
				some: {
					productionItems: {
						some: { productionId, status: { in: [...LISTED_STATUSES, 'RETURNED'] } }
					}
				}
			}
		},
		select: { id: true, name: true },
		orderBy: { name: 'asc' }
	});
	for (const org of lenders) {
		sides.push({ organizationId: org.id, organizationName: org.name, own: false });
	}
	return sides;
}

async function requireSide(userId: string, productionId: string, organizationId: string) {
	const side = (await checkSides(userId, productionId)).find(
		(s) => s.organizationId === organizationId
	);
	if (!side) throw new ProductionCheckError('forbidden', 'No access to check this production');
	return side;
}

async function loadCheck(userId: string, checkId: string) {
	const check = await prisma.productionCheck.findUnique({
		where: { id: checkId },
		include: {
			production: { select: { id: true, name: true, organizationId: true, cancelledAt: true } },
			createdBy: { select: { name: true, email: true } },
			closedBy: { select: { name: true, email: true } }
		}
	});
	if (!check) throw new ProductionCheckError('not_found', 'Check not found');
	const side = await requireSide(userId, check.productionId, check.organizationId);
	return { check, side };
}

function requireOpen(check: { status: string }) {
	if (check.status !== 'OPEN') {
		throw new ProductionCheckError('check_closed', 'This check is already closed');
	}
}

// ---------------------------------------------------------------------------
// The list

/** The production's units this side checks, as they are now. */
function listedItems(productionId: string, side: CheckSide) {
	return listItems(productionId, LISTED_STATUSES, side.own ? undefined : [side.organizationId]);
}

function isLent(item: ListedItem, productionOrgId: string) {
	return item.asset.organizationId !== productionOrgId;
}

/**
 * On the lending org's side every unit is its own, on its own shelves, so
 * there everything goes by location.
 */
function checkGroupOf(item: ListedItem, productionOrgId: string, side: CheckSide): CheckGroup {
	return groupOf(item, productionOrgId, side.own);
}

export async function getProductionCheck(
	userId: string,
	checkId: string
): Promise<ProductionCheckView> {
	const { check, side } = await loadCheck(userId, checkId);
	const [listed, ticks] = await Promise.all([
		listedItems(check.productionId, side),
		prisma.productionCheckTick.findMany({
			where: { checkId },
			include: {
				user: { select: { name: true, email: true } },
				asset: {
					select: {
						assetTag: true,
						product: { select: { name: true } }
					}
				}
			}
		})
	]);
	const tickOf = new Map(ticks.map((t) => [t.assetId, t]));
	const listedIds = new Set(listed.map((i) => i.assetId));
	const productionOrgId = check.production.organizationId;

	const items: ProductionCheckItem[] = nestAndSort(
		listed.map((item) => {
			const tick = tickOf.get(item.assetId);
			const lent = isLent(item, productionOrgId);
			return {
				assetId: item.assetId,
				assetTag: item.asset.assetTag,
				productName: item.asset.product.name,
				productCaption: item.asset.product.caption,
				manufacturerName: item.asset.product.manufacturer?.name ?? null,
				lentBy: lent ? item.asset.organization.shortName || item.asset.organization.name : null,
				accessoryOf: item.asset.parentAssetId,
				group: checkGroupOf(item, productionOrgId, side),
				status: item.status as ProductionCheckItem['status'],
				received: lent && item.receivedAt !== null,
				returnReported: lent && item.returnReportedAt !== null,
				tick: tick
					? {
							userName: userLabel(tick.user),
							mine: tick.userId === userId,
							via: tick.via as 'scan' | 'manual',
							at: tick.createdAt
						}
					: null
			};
		})
	);

	// A tick whose unit has since left the list — or was never on it — is
	// reported as unexpected, so nothing ticked silently disappears.
	const unexpected = ticks
		.filter((t) => !listedIds.has(t.assetId))
		.map((t) => ({
			assetId: t.assetId,
			assetTag: t.asset.assetTag,
			productName: t.asset.product.name,
			userName: userLabel(t.user),
			mine: t.userId === userId
		}));

	const lentTicked = listed.filter(
		(i) => tickOf.has(i.assetId) && isLent(i, productionOrgId) && i.status === 'CHECKED_OUT'
	);
	const borrower = side.own && (await onProductionSide(userId, check.production));

	return {
		id: check.id,
		status: check.status as ProductionCheckView['status'],
		productionId: check.productionId,
		productionName: check.production.name,
		side,
		createdAt: check.createdAt,
		createdBy: userLabel(check.createdBy),
		closedAt: check.closedAt,
		closedBy: check.closedBy ? userLabel(check.closedBy) : null,
		items,
		lines: buildLines(listed, productionOrgId, side.own, (item) => {
			const t = tickOf.get(item.assetId);
			return { done: !!t, undoable: !t || t.userId === userId };
		}),
		unexpected,
		canConfirmReceipt:
			borrower && check.status === 'OPEN'
				? lentTicked.filter((i) => i.receivedAt === null).length
				: 0,
		canReportReturn:
			borrower && check.status === 'OPEN'
				? lentTicked.filter((i) => i.receivedAt !== null && i.returnReportedAt === null).length
				: 0
	};
}

/**
 * The open check of this side, or a new one. Joining is the normal case: the
 * second person to press "Check" on the same production ticks into the same
 * list as the first.
 */
export async function openProductionCheck(
	userId: string,
	productionId: string,
	organizationId?: string
): Promise<{ id: string }> {
	const sides = await checkSides(userId, productionId);
	const side = organizationId ? sides.find((s) => s.organizationId === organizationId) : sides[0];
	if (!side) throw new ProductionCheckError('forbidden', 'No access to check this production');

	const production = await prisma.production.findUniqueOrThrow({
		where: { id: productionId },
		select: { name: true, cancelledAt: true }
	});
	if (production.cancelledAt) {
		throw new ProductionCheckError(
			'production_cancelled',
			`"${production.name}" has been cancelled`,
			production.name
		);
	}

	const open = await prisma.productionCheck.findFirst({
		where: { productionId, organizationId: side.organizationId, status: 'OPEN' },
		select: { id: true }
	});
	if (open) return open;
	return prisma.productionCheck.create({
		data: { productionId, organizationId: side.organizationId, createdById: userId },
		select: { id: true }
	});
}

/** Every check of this production the user may see: the open ones first, then the latest closed. */
export async function listProductionChecks(userId: string, productionId: string) {
	const sides = await checkSides(userId, productionId);
	const checks = await prisma.productionCheck.findMany({
		where: { productionId, organizationId: { in: sides.map((s) => s.organizationId) } },
		orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
		take: 20,
		include: {
			organization: { select: { name: true } },
			createdBy: { select: { name: true, email: true } },
			_count: { select: { ticks: true } }
		}
	});
	return {
		sides,
		checks: checks.map((c) => ({
			id: c.id,
			status: c.status as 'OPEN' | 'CLOSED',
			organizationId: c.organizationId,
			organizationName: c.organization.name,
			createdAt: c.createdAt,
			createdBy: userLabel(c.createdBy),
			closedAt: c.closedAt,
			ticks: c._count.ticks
		}))
	};
}

// ---------------------------------------------------------------------------
// Ticking

export async function scanIntoCheck(
	userId: string,
	checkId: string,
	code: string
): Promise<CheckScanResult> {
	const { check, side } = await loadCheck(userId, checkId);
	requireOpen(check);

	const match = await resolveScannedCode(userId, code);
	if (match.kind === 'ambiguous') {
		throw new ProductionCheckError(
			'serial_ambiguous',
			`Serial number "${code}" is on more than one unit — scan the asset tag instead`,
			code
		);
	}
	if (match.kind === 'not_found') {
		throw new ProductionCheckError('asset_not_found', `Tag "${code}" not found`, code);
	}

	const asset = await prisma.asset.findUniqueOrThrow({
		where: { id: match.assetId },
		select: { id: true, assetTag: true, product: { select: { name: true } } }
	});
	const listed = await listedItems(check.productionId, side);
	const listedIds = new Set(listed.map((i) => i.assetId));
	const base = { assetTag: asset.assetTag ?? code, productName: asset.product.name };

	const existing = await prisma.productionCheckTick.findUnique({
		where: { checkId_assetId: { checkId, assetId: asset.id } }
	});
	if (existing)
		return { ...base, result: listedIds.has(asset.id) ? 'already' : 'unexpected', ticked: 0 };

	if (!listedIds.has(asset.id)) {
		await prisma.productionCheckTick.create({
			data: { checkId, assetId: asset.id, userId, via: 'scan', unexpected: true }
		});
		return { ...base, result: 'unexpected', ticked: 1 };
	}

	// Accessories without a tag of their own can't be scanned, and come along
	// with the unit they hang off. A tagged one is scanned for itself — that is
	// what the tag is for.
	const riders = listed
		.filter((i) => i.asset.parentAssetId === asset.id && !i.asset.assetTag)
		.map((i) => i.assetId);
	const ticked = await tick(checkId, userId, [asset.id, ...riders], 'scan');
	return { ...base, result: 'ticked', ticked };
}

/** Tick by hand — the list, for units without a tag or a place without a scanner. */
export async function tickCheckItems(userId: string, checkId: string, assetIds: string[]) {
	const { check, side } = await loadCheck(userId, checkId);
	requireOpen(check);
	const listedIds = new Set((await listedItems(check.productionId, side)).map((i) => i.assetId));
	return {
		ticked: await tick(
			checkId,
			userId,
			assetIds.filter((id) => listedIds.has(id)),
			'manual'
		)
	};
}

async function tick(checkId: string, userId: string, assetIds: string[], via: 'scan' | 'manual') {
	if (assetIds.length === 0) return 0;
	const { count } = await prisma.productionCheckTick.createMany({
		data: assetIds.map((assetId) => ({ checkId, assetId, userId, via })),
		skipDuplicates: true
	});
	return count;
}

/** Whoever ticked a unit owns the tick, as in a stocktake. */
export async function untickCheckItem(userId: string, checkId: string, assetId: string) {
	const { check } = await loadCheck(userId, checkId);
	requireOpen(check);
	const existing = await prisma.productionCheckTick.findUnique({
		where: { checkId_assetId: { checkId, assetId } }
	});
	if (!existing) return;
	if (existing.userId !== userId) {
		throw new ProductionCheckError('tick_not_yours', 'Someone else ticked this unit');
	}
	await prisma.productionCheckTick.delete({ where: { id: existing.id } });
}

/**
 * Sets how many units of a counted line are ticked. Raising it ticks the next
 * units in line as this user's; lowering it takes back only this user's own
 * ticks, so a count never undoes someone else's.
 */
export async function setCheckLineCount(
	userId: string,
	checkId: string,
	key: string,
	count: number
) {
	const { check, side } = await loadCheck(userId, checkId);
	requireOpen(check);
	const [listed, ticks] = await Promise.all([
		listedItems(check.productionId, side),
		prisma.productionCheckTick.findMany({
			where: { checkId },
			select: { assetId: true, userId: true }
		})
	]);
	const tickOf = new Map(ticks.map((t) => [t.assetId, t]));
	const state = (assetId: string) => {
		const t = tickOf.get(assetId);
		return { done: !!t, undoable: !t || t.userId === userId };
	};
	const line = buildLines(listed, check.production.organizationId, side.own, (item) =>
		state(item.assetId)
	).find((l) => l.key === key);
	if (!line) return { done: 0 };

	const { add, remove } = pickForCount(line, count, state);
	await tick(checkId, userId, add, 'manual');
	if (remove.length > 0) {
		await prisma.productionCheckTick.deleteMany({
			where: { checkId, userId, assetId: { in: remove } }
		});
	}
	return { done: line.done + add.length - remove.length };
}

// ---------------------------------------------------------------------------
// Closing and the borrower's steps

/**
 * Writes the outcome into every listed unit's history, one entry each like a
 * case check, and closes the check. The list is read again, so a unit that
 * joined or left the production while the check ran is judged as it is now.
 */
export async function closeProductionCheck(userId: string, checkId: string) {
	const { check, side } = await loadCheck(userId, checkId);
	requireOpen(check);
	const [listed, ticks] = await Promise.all([
		listedItems(check.productionId, side),
		prisma.productionCheckTick.findMany({ where: { checkId }, select: { assetId: true } })
	]);
	const found = new Set(ticks.map((t) => t.assetId));
	const foundCount = listed.filter((i) => found.has(i.assetId)).length;

	await prisma.$transaction([
		prisma.assetTransaction.createMany({
			data: listed.map((item) => {
				const data: ProductionCheckedData = {
					type: 'PRODUCTION_CHECKED',
					productionId: check.productionId,
					productionName: check.production.name,
					checkId,
					result: found.has(item.assetId) ? 'found' : 'missing',
					found: foundCount,
					expected: listed.length
				};
				return {
					assetId: item.assetId,
					userId,
					productionId: check.productionId,
					action: 'PRODUCTION_CHECKED',
					data
				};
			})
		}),
		prisma.productionCheck.update({
			where: { id: checkId },
			data: { status: 'CLOSED', closedAt: new Date(), closedById: userId }
		})
	]);
	return { found: foundCount, missing: listed.length - foundCount };
}

/** The ticked lent units out on the production, for the borrower's two steps. */
async function borrowerTargets(userId: string, checkId: string) {
	const { check, side } = await loadCheck(userId, checkId);
	requireOpen(check);
	if (!side.own || !(await onProductionSide(userId, check.production))) {
		throw new ProductionCheckError(
			'receipt_forbidden',
			'Only the production’s own org or its crew confirm a handover'
		);
	}
	const ticks = await prisma.productionCheckTick.findMany({
		where: { checkId },
		select: { assetId: true }
	});
	const items = await prisma.productionItem.findMany({
		where: {
			productionId: check.productionId,
			status: 'CHECKED_OUT',
			assetId: { in: ticks.map((t) => t.assetId) },
			asset: { organizationId: { not: check.production.organizationId } }
		},
		select: { id: true, assetId: true, receivedAt: true, returnReportedAt: true }
	});
	return { check, items };
}

/** The borrower has the ticked lent units. Units already confirmed are left alone. */
export async function confirmReceipt(userId: string, checkId: string) {
	const { check, items } = await borrowerTargets(userId, checkId);
	const open = items.filter((i) => i.receivedAt === null);
	const data: HandoverReceivedData = {
		type: 'HANDOVER_RECEIVED',
		productionId: check.productionId,
		productionName: check.production.name
	};
	await prisma.$transaction([
		prisma.productionItem.updateMany({
			where: { id: { in: open.map((i) => i.id) } },
			data: { receivedAt: new Date(), receivedById: userId }
		}),
		prisma.assetTransaction.createMany({
			data: open.map((i) => ({
				assetId: i.assetId,
				userId,
				productionId: check.productionId,
				action: 'HANDOVER_RECEIVED',
				data
			}))
		})
	]);
	return {
		count: open.length,
		productionId: check.productionId,
		assetIds: open.map((i) => i.assetId)
	};
}

/** The borrower has sent the ticked lent units back; the lender scanning them in finishes it. */
export async function reportReturn(userId: string, checkId: string) {
	const { check, items } = await borrowerTargets(userId, checkId);
	// Only what the production confirmed having: until then it has nothing to send back.
	const open = items.filter((i) => i.receivedAt !== null && i.returnReportedAt === null);
	const data: ReturnReportedData = {
		type: 'RETURN_REPORTED',
		productionId: check.productionId,
		productionName: check.production.name
	};
	await prisma.$transaction([
		prisma.productionItem.updateMany({
			where: { id: { in: open.map((i) => i.id) } },
			data: { returnReportedAt: new Date(), returnReportedById: userId }
		}),
		prisma.assetTransaction.createMany({
			data: open.map((i) => ({
				assetId: i.assetId,
				userId,
				productionId: check.productionId,
				action: 'RETURN_REPORTED',
				data
			}))
		})
	]);
	return {
		count: open.length,
		productionId: check.productionId,
		assetIds: open.map((i) => i.assetId)
	};
}

// ---------------------------------------------------------------------------
// What is waiting on the user

export interface HandoverTodo {
	productionId: string;
	productionName: string;
	count: number;
}

/**
 * Loans waiting on this user's side: lent units out on their productions that
 * nobody has confirmed receiving, and their own units reported sent back that
 * they have not scanned in yet.
 */
export async function handoverTodos(userId: string) {
	const writable = await writableOrgIds(userId);
	const crew = await prisma.productionCrew.findMany({
		where: { userId, production: { organization: { members: { some: { userId } } } } },
		select: { productionId: true }
	});

	const [unreceived, reported, canSee] = await Promise.all([
		prisma.productionItem.findMany({
			where: {
				status: 'CHECKED_OUT',
				receivedAt: null,
				production: {
					cancelledAt: null,
					OR: [
						{ organizationId: { in: writable } },
						{ id: { in: crew.map((c) => c.productionId) } }
					]
				}
			},
			select: {
				production: { select: { id: true, name: true, organizationId: true } },
				asset: { select: { organizationId: true } }
			}
		}),
		prisma.productionItem.findMany({
			where: {
				status: 'CHECKED_OUT',
				returnReportedAt: { not: null },
				asset: { organizationId: { in: writable } }
			},
			select: {
				production: {
					select: {
						id: true,
						name: true,
						organizationId: true,
						organization: { select: { name: true, shortName: true } }
					}
				},
				asset: { select: { organizationId: true } }
			}
		}),
		productionVisibility(userId)
	]);

	const group = (rows: { production: { id: string }; name: string }[]) => {
		const map = new Map<string, HandoverTodo>();
		for (const row of rows) {
			const entry = map.get(row.production.id) ?? {
				productionId: row.production.id,
				productionName: row.name,
				count: 0
			};
			entry.count++;
			map.set(row.production.id, entry);
		}
		return [...map.values()].sort((a, b) => naturalCompare(a.productionName, b.productionName));
	};

	return {
		toReceive: group(
			unreceived
				.filter((r) => r.asset.organizationId !== r.production.organizationId)
				.map((r) => ({ production: r.production, name: r.production.name }))
		),
		toTakeBack: group(
			reported
				.filter((r) => r.asset.organizationId !== r.production.organizationId)
				.map((r) => ({
					production: r.production,
					name: visibleProductionName(r.production, canSee)
				}))
		)
	};
}
