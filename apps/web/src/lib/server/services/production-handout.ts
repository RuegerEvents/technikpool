import { prisma } from '#lib/server/auth.js';
import { BOOKABLE_ASSET_WHERE } from '#lib/asset-status.js';
import type { Prisma } from '#lib/prisma/client.js';
import { naturalCompare } from '#lib/sort.js';
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
	/**
	 * Not booked here: a unit put into a kit after the kit was booked. Listed
	 * with the kit it belongs to, and a tick books it and hands it out at once.
	 * Only on the web's handout list (`HandoutOptions.extras`).
	 */
	kitAddition: boolean;
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
	/** This user may put units on it that it has not booked — see `searchHandoutCandidates`. */
	books: boolean;
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
			startDate: true,
			endDate: true,
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
		byLender: side.own,
		/** May put units on the production that it has not booked — see `kitAdditions`. */
		books: side.own && (admin || writable.includes(production.organizationId))
	};
}

type Scope = Awaited<ReturnType<typeof handoutScope>>;

/**
 * What the web's handout list adds to the plain one, which the scanner reads
 * through /api/v1 unchanged:
 *
 * - on the hand-out list, units taken back while the production still runs.
 *   Taking back by mistake happens, and a unit that is RETURNED was otherwise
 *   on neither list's open side, so nothing offered to send it out again.
 *   Once the production is over, what came back stays back.
 * - units put into a booked kit after it was booked (`kitAdditions`).
 */
export interface HandoutOptions {
	extras?: boolean;
}

function startOfToday() {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return today;
}

/** Still running, or not started: a unit taken back may go out again. */
function stillRunning(production: { endDate: Date | null }) {
	return !production.endDate || production.endDate >= startOfToday();
}

function statusesFor(mode: HandoutMode, production: Scope['production'], options: HandoutOptions) {
	return mode === 'checkout' && options.extras && stillRunning(production)
		? [...MODE_STATUSES.checkout, 'RETURNED']
		: MODE_STATUSES[mode];
}

const CONFLICT_STATUSES = ['PENDING', 'APPROVED', 'CHECKED_OUT'];

/**
 * Units of a kit booked here that the production does not have: put into the
 * kit after it was booked. The production page flags the kit as changed, but
 * whoever packs it puts the whole case on the truck, so the handout list
 * offers them too, under the kit's other units. Only for someone who may book
 * the production (`books`), only units free for its dates, and only top-level
 * units — accessories go out with them.
 */
async function kitAdditions(scope: Scope) {
	if (!scope.books || scope.production.cancelledAt) return [];
	const { production } = scope;
	const kits = await prisma.productionItem.findMany({
		where: {
			productionId: production.id,
			sourceBundleId: { not: null },
			status: { in: ['APPROVED', 'CHECKED_OUT', 'RETURNED'] }
		},
		select: { sourceBundleId: true },
		distinct: ['sourceBundleId']
	});
	if (kits.length === 0) return [];
	const assets = await prisma.asset.findMany({
		where: {
			bundleId: { in: kits.map((k) => k.sourceBundleId!) },
			parentAssetId: null,
			...BOOKABLE_ASSET_WHERE,
			...(scope.organizationIds ? { organizationId: { in: scope.organizationIds } } : {}),
			...freeForProduction(production)
		},
		select: {
			id: true,
			assetTag: true,
			organizationId: true,
			location: { select: { name: true } },
			product: {
				select: {
					name: true,
					caption: true,
					imagePath: true,
					manufacturer: { select: { name: true } }
				}
			}
		}
	});
	return assets;
}

function isDone(item: ListedItem, mode: HandoutMode) {
	return item.status === DONE_STATUS[mode];
}

export async function getHandout(
	userId: string,
	productionId: string,
	mode: HandoutMode,
	organizationId?: string,
	options: HandoutOptions = {}
): Promise<HandoutView> {
	const scope = await handoutScope(userId, productionId, organizationId);
	const { production, sides, side, organizationIds, byLender } = scope;
	const statuses = statusesFor(mode, production, options);
	const [listed, total, additions] = await Promise.all([
		listItems(productionId, statuses, organizationIds),
		prisma.productionItem.count({
			where: { productionId, status: { in: statuses } }
		}),
		mode === 'checkout' && options.extras ? kitAdditions(scope) : []
	]);
	const productionOrgId = production.organizationId;

	const items: HandoutItem[] = nestAndSort([
		...additions.map((asset) => ({
			assetId: asset.id,
			assetTag: asset.assetTag,
			productName: asset.product.name,
			productCaption: asset.product.caption,
			productImagePath: asset.product.imagePath,
			manufacturerName: asset.product.manufacturer?.name ?? null,
			lentBy: null,
			accessoryOf: null,
			group: asset.location
				? { kind: 'location' as const, name: asset.location.name }
				: { kind: 'none' as const, name: null },
			status: 'APPROVED' as const,
			kitAddition: true,
			done: false,
			received: false,
			returnReported: false
		})),
		...listed.map((item) => {
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
				kitAddition: false,
				done: isDone(item, mode),
				received: lent && item.receivedAt !== null,
				returnReported: lent && item.returnReportedAt !== null
			};
		})
	]);

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
		othersCount: total - listed.length,
		books: scope.books
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
	const additions = await kitAdditions(scope);
	return {
		cancelled: scope.production.cancelledAt !== null,
		approved: count('APPROVED'),
		checkedOut: count('CHECKED_OUT'),
		returned: count('RETURNED'),
		/** Units put into a booked kit since, which the handout list offers too. */
		kitAdditions: additions.length,
		/** Whether what was taken back may still go out again — see `HandoutOptions`. */
		running: stillRunning(scope.production)
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
	count: number,
	options: HandoutOptions = {}
) {
	const { production, organizationIds, byLender } = await handoutScope(userId, productionId);
	const listed = await listItems(
		productionId,
		statusesFor(mode, production, options),
		organizationIds
	);
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
// Handing out what was never booked, found by name

export interface HandoutCandidate {
	/** Product, shelf and owner: units under one key are interchangeable here. */
	key: string;
	productId: string;
	organizationId: string;
	locationId: string;
	productName: string;
	productCaption: string | null;
	productImagePath: string | null;
	manufacturerName: string | null;
	locationName: string;
	organizationName: string;
	/** Free for the production's dates, not out anywhere, not on it already. */
	available: number;
	/** Of those, how many carry no tag — the ones a scan cannot reach. */
	untagged: number;
}

function freeForProduction(production: Scope['production']) {
	return {
		productionItems: {
			none: {
				OR: [
					{ productionId: production.id },
					{ status: 'CHECKED_OUT' },
					...(production.startDate && production.endDate
						? [
								{
									status: { in: CONFLICT_STATUSES },
									production: {
										startDate: { not: null, lte: production.endDate },
										endDate: { not: null, gte: production.startDate }
									}
								}
							]
						: [])
				]
			}
		}
	} satisfies Prisma.AssetWhereInput;
}

/**
 * Units of this user's orgs whose product matches `text`, for handing out
 * something the list does not have: a scan adds a tagged unit, but a cable
 * without a tag has nothing to scan. Kit members and accessories are left out —
 * they go with their kit or their unit. Grouped by product, shelf and owner,
 * as the counted lines are.
 */
export async function searchHandoutCandidates(
	userId: string,
	productionId: string,
	text: string
): Promise<HandoutCandidate[]> {
	const scope = await handoutScope(userId, productionId);
	const words = text.trim().split(/\s+/).filter(Boolean);
	if (!scope.books || scope.production.cancelledAt || words.join('').length < 2) return [];
	const assets = await prisma.asset.findMany({
		where: {
			...(scope.organizationIds ? { organizationId: { in: scope.organizationIds } } : {}),
			parentAssetId: null,
			bundleId: null,
			...BOOKABLE_ASSET_WHERE,
			...freeForProduction(scope.production),
			AND: words.map((word) => ({
				OR: [
					{ product: { name: { contains: word, mode: 'insensitive' as const } } },
					{ product: { caption: { contains: word, mode: 'insensitive' as const } } },
					{
						product: { manufacturer: { name: { contains: word, mode: 'insensitive' as const } } }
					},
					{ assetTag: { contains: word, mode: 'insensitive' as const } }
				]
			}))
		},
		select: {
			assetTag: true,
			productId: true,
			organizationId: true,
			locationId: true,
			location: { select: { name: true } },
			organization: { select: { name: true, shortName: true } },
			product: {
				select: {
					name: true,
					caption: true,
					imagePath: true,
					manufacturer: { select: { name: true } }
				}
			}
		},
		take: 2000
	});
	const groups = new Map<string, HandoutCandidate>();
	for (const asset of assets) {
		const key = `${asset.productId}|${asset.locationId}|${asset.organizationId}`;
		const group = groups.get(key) ?? {
			key,
			productId: asset.productId,
			organizationId: asset.organizationId,
			locationId: asset.locationId,
			productName: asset.product.name,
			productCaption: asset.product.caption,
			productImagePath: asset.product.imagePath,
			manufacturerName: asset.product.manufacturer?.name ?? null,
			locationName: asset.location.name,
			organizationName: asset.organization.shortName || asset.organization.name,
			available: 0,
			untagged: 0
		};
		group.available += 1;
		if (!asset.assetTag) group.untagged += 1;
		groups.set(key, group);
	}
	return [...groups.values()]
		.sort(
			(a, b) =>
				naturalCompare(a.productName, b.productName) ||
				naturalCompare(a.locationName, b.locationName)
		)
		.slice(0, 40);
}

/**
 * Hands out up to `count` units of one search result. Untagged units go first —
 * those are what the search is for; a tagged one is better scanned, so that
 * the tag on the shelf and the one on the list agree — then by unit number.
 */
export async function handOutCandidates(
	userId: string,
	productionId: string,
	group: { productId: string; organizationId: string; locationId: string },
	count: number
) {
	const scope = await handoutScope(userId, productionId);
	if (!scope.books) throw new CheckoutError('forbidden', 'No access to this production');
	const free = await prisma.asset.findMany({
		where: {
			productId: group.productId,
			organizationId: group.organizationId,
			locationId: group.locationId,
			parentAssetId: null,
			bundleId: null,
			...BOOKABLE_ASSET_WHERE,
			...freeForProduction(scope.production)
		},
		select: { id: true, assetTag: true, orgIndex: true }
	});
	// Someone else may have taken some in the meantime: what is left goes, and
	// the count says how many that was.
	const picked = free
		.sort(
			(a, b) => Number(a.assetTag !== null) - Number(b.assetTag !== null) || a.orgIndex - b.orgIndex
		)
		.slice(0, count);
	if (picked.length === 0) return { result: { count: 0 }, affected: emptyAffected() };
	const { result, affected } = await performBulkCheckout(userId, {
		assetIds: picked.map((a) => a.id),
		targetType: 'production',
		targetId: productionId
	});
	return { result: { count: result.count }, affected };
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
