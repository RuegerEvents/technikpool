import { prisma } from '#lib/server/auth.js';
import { BOOKABLE_ASSET_WHERE } from '#lib/asset-status.js';
import type { Prisma } from '#lib/prisma/client.js';
import { searchMatcher } from '#lib/search.js';
import { naturalCompare } from '#lib/sort.js';
import {
	isSystemAdmin,
	productionVisibility,
	visibleProductionName,
	writableOrgIds
} from './access';
import { kitByTag, resolveScannedCode, type TaggedKit } from './asset-lookup';
import { inBookedKit, kitAssetsWhere } from '#lib/bundle-nesting.js';
import {
	caseNumber,
	caseTitle,
	isPackCaseUnit,
	packRefusal,
	pickToPack,
	type ListCaseRef
} from '#lib/pack-cases.js';
import { makerAndName, withCaption } from '#lib/product-label.js';
import { caseLabelLines, type CaseLabelData } from '#lib/server/case-label-zpl.js';
import { withAccessories } from './accessories';
import {
	CheckoutError,
	emptyAffected,
	kitScanResult,
	kitScanUnits,
	mergeAffected,
	performBulkCheckout,
	performScan,
	undoCheckout,
	type AffectedRecords,
	type ScanResult
} from './checkout';
import {
	buildLines,
	groupOf,
	KIT_SELECT,
	kitOf,
	lenderLabel,
	listItems,
	loadPacking,
	nestAndSort,
	pickForCount,
	type ListCase,
	type ListGroup,
	type ListKit,
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
	/** The kit the unit is in, for a heading over its units. */
	kit: ListKit | null;
	status: 'APPROVED' | 'CHECKED_OUT' | 'RETURNED';
	/**
	 * Not booked here: a unit put into a kit after the kit was booked. Listed
	 * with the kit it belongs to, and a tick books it and hands it out at once.
	 * Only with `HandoutOptions.extras`, which the web and /api/v1 both ask for.
	 */
	kitAddition: boolean;
	done: boolean;
	received: boolean;
	returnReported: boolean;
	/** Some inspection of it is overdue. Handing it out warns, never refuses. */
	inspectionOverdue: boolean;
	/**
	 * The pack case it is listed under: the one it travels in, or for a case
	 * itself, its own — see #lib/pack-cases.ts. Null: loose.
	 */
	packCase: ListCase | null;
	/** Its product is a pack container: scanning it opens it for packing. */
	isPackCase: boolean;
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
	// A lender adds its own units once a loan stands: the production holds an
	// approved one of its units already (see `assertLenderMayHandOver`).
	const lends =
		!side.own &&
		(await prisma.productionItem.count({
			where: {
				productionId,
				status: { in: ['APPROVED', 'CHECKED_OUT', 'RETURNED'] },
				asset: { organizationId: side.organizationId }
			}
		})) > 0;
	return {
		production,
		sides,
		side,
		organizationIds: side.own ? (admin ? undefined : writable) : [side.organizationId],
		byLender: side.own,
		/**
		 * May put units on the production that it has not booked — see
		 * `kitAdditions`: the production's own org, or a lender with a loan on it.
		 */
		books: (side.own && (admin || writable.includes(production.organizationId))) || lends
	};
}

type Scope = Awaited<ReturnType<typeof handoutScope>>;

/**
 * What a handout list adds to the plain one — asked for by the web's list and
 * by /api/v1's, so the scanner sees the same; the production page's summary
 * counts without it:
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
	const kitIds = kits.map((k) => k.sourceBundleId!);
	const assets = await prisma.asset.findMany({
		where: {
			// The kits inside a booked kit came along with it.
			OR: [{ bundleId: { in: kitIds } }, { bundle: { parentBundleId: { in: kitIds } } }],
			parentAssetId: null,
			...BOOKABLE_ASSET_WHERE,
			...(scope.organizationIds ? { organizationId: { in: scope.organizationIds } } : {}),
			...freeForProduction(production)
		},
		select: {
			id: true,
			assetTag: true,
			organizationId: true,
			nextInspectionDue: true,
			bundle: { select: KIT_SELECT },
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

function overdue(due: Date | null) {
	return !!due && due.getTime() < Date.now();
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
	const [listed, total, additions, packing] = await Promise.all([
		listItems(productionId, statuses, organizationIds),
		prisma.productionItem.count({
			where: { productionId, status: { in: statuses } }
		}),
		mode === 'checkout' && options.extras ? kitAdditions(scope) : [],
		loadPacking(productionId)
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
			kit: kitOf(asset.bundle),
			status: 'APPROVED' as const,
			kitAddition: true,
			done: false,
			received: false,
			returnReported: false,
			inspectionOverdue: overdue(asset.nextInspectionDue),
			packCase: null,
			isPackCase: false
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
				kit: kitOf(item.asset.bundle),
				status: item.status as HandoutItem['status'],
				kitAddition: false,
				done: isDone(item, mode),
				received: lent && item.receivedAt !== null,
				returnReported: lent && item.returnReportedAt !== null,
				inspectionOverdue: overdue(item.asset.nextInspectionDue),
				packCase: packing.caseOf(item),
				isPackCase: isPackCaseUnit(item.asset)
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
		lines: buildLines(
			listed,
			productionOrgId,
			byLender,
			(item) => ({ done: isDone(item, mode), undoable: true }),
			packing
		),
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
	code: string,
	options: { packInto?: string | null } = {}
) {
	await handoutScope(userId, productionId);
	if (mode === 'checkout') {
		const scanned = await performScan(userId, {
			assetTag: code,
			targetType: 'production',
			targetId: productionId
		});
		return packScanned(userId, productionId, scanned, options.packInto ?? null);
	}
	// A kit's number — its own tag or its case's — brings the whole kit back.
	const kit = await kitByTag(code);
	if (kit) return await takeBackKit(userId, productionId, kit);
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
		// Taking back never swaps a unit into a kit: it only books what was booked.
		const step = await performScan(
			userId,
			{ assetTag: code, targetType: 'production', targetId: productionId },
			{ swap: false }
		);
		mergeAffected(affected, step.affected);
	}

	const back = await performScan(userId, {
		assetTag: code,
		targetType: 'location',
		targetId: asset.locationId
	});
	// A pack case is back; what is in it is asked about next (see `packCase`).
	return {
		result: { ...back.result, packCase: await packCaseRef(asset.id) },
		affected: mergeAffected(affected, back.affected)
	};
}

/**
 * A kit's sticker on the take-back list: its units that are on this production
 * and not back yet go onto their shelves, as if each were ticked. None of them
 * there answers with no units, which a client reports as not from here — as
 * for a single unit.
 */
async function takeBackKit(userId: string, productionId: string, kit: TaggedKit) {
	const production = await prisma.production.findUniqueOrThrow({
		where: { id: productionId },
		select: { name: true }
	});
	const open = await prisma.productionItem.findMany({
		where: {
			productionId,
			status: { in: ['APPROVED', 'CHECKED_OUT'] },
			asset: { ...kitAssetsWhere(kit.id), parentAssetId: null }
		},
		select: { assetId: true }
	});
	const units = await kitScanUnits(userId, kit, 'location', new Set(open.map((i) => i.assetId)));
	const affected =
		units.length > 0
			? (
					await setHandoutDone(
						userId,
						productionId,
						'checkin',
						units.map((u) => u.id),
						true
					)
				).affected
			: emptyAffected();
	return {
		result: kitScanResult(kit, units, {
			action: 'LOCATION_ASSIGNED',
			targetName: units[0]?.location.name ?? '',
			returnedFrom: units.length > 0 ? [production.name] : []
		}),
		affected
	};
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
		// An untick on the take-back list books the unit out again as it was.
		const { result, affected } = await performBulkCheckout(
			userId,
			{ assetIds, targetType: 'production', targetId: productionId },
			{ swap: mode === 'checkout' }
		);
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
		const step = await performBulkCheckout(
			userId,
			{
				assetIds: unshipped.map((i) => i.assetId),
				targetType: 'production',
				targetId: productionId
			},
			{ swap: false }
		);
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
	const [listed, packing] = await Promise.all([
		listItems(productionId, statusesFor(mode, production, options), organizationIds),
		loadPacking(productionId)
	]);
	const byId = new Map(listed.map((i) => [i.assetId, i]));
	const state = (assetId: string) => ({
		done: byId.has(assetId) && isDone(byId.get(assetId)!, mode),
		undoable: true
	});
	const line = buildLines(
		listed,
		production.organizationId,
		byLender,
		(item) => state(item.assetId),
		packing
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
// Pack cases
//
// A case is opened on the client — it is whoever packs that has a case open,
// not the production — so the server only hears where a unit goes: a scan
// carries the open case (`packInto`), and `packIntoCase` puts units into one,
// or takes them out. Packing is handing out: what goes into a case, the case
// included, is checked out with it. See #lib/pack-cases.ts for the rules.

/** The scanned unit as a pack case, or null when its product is none. */
async function packCaseRef(assetId: string): Promise<ListCaseRef | null> {
	const asset = await prisma.asset.findUnique({
		where: { id: assetId },
		select: {
			id: true,
			assetTag: true,
			orgIndex: true,
			bundleId: true,
			product: { select: { name: true, caption: true, isContainer: true } }
		}
	});
	// A container in a bundle is the bundle's case, scanned as the kit.
	if (!asset || !isPackCaseUnit(asset)) return null;
	return {
		assetId: asset.id,
		name: withCaption(asset.product.name, asset.product.caption),
		tag: asset.assetTag,
		orgIndex: asset.orgIndex
	};
}

/**
 * After a scan on the hand-out list: a case is said to be one, so the client
 * opens it (or asks whether it goes into the one open). Anything else goes
 * into the open case, a kit's sticker with everything it booked.
 */
async function packScanned(
	userId: string,
	productionId: string,
	scanned: { result: ScanResult; affected: AffectedRecords },
	packInto: string | null
) {
	const { result, affected } = scanned;
	const kitUnits = result.kit ? result.kit.units.map((u) => u.id) : null;
	if (!kitUnits) {
		const packCase = await packCaseRef(result.asset.id);
		if (packCase) return { result: { ...result, packCase }, affected };
	}
	const assetIds = kitUnits ?? [result.asset.id];
	if (!packInto || assetIds.length === 0) return scanned;
	const step = await packIntoCase(userId, productionId, packInto, { assetIds });
	return {
		result: { ...result, packedInto: packInto },
		affected: mergeAffected(affected, step.affected)
	};
}

/** What goes into a case: units by id, and part of a counted line by its key. */
export interface PackSelection {
	assetIds?: string[];
	line?: { key: string; count: number };
}

const PACKABLE_STATUSES = ['APPROVED', 'CHECKED_OUT'];

/**
 * Puts units into the case `caseAssetId`, or with null takes them out of
 * whichever they are in. Accessories go with their unit, a case with what is
 * in it. Units of the user's side only; the case may be anyone's on the
 * production. Refused for something that is not a case booked here, and for
 * a case into itself or into something it holds.
 */
export async function packIntoCase(
	userId: string,
	productionId: string,
	caseAssetId: string | null,
	selection: PackSelection,
	organizationId?: string
): Promise<{ result: { count: number }; affected: AffectedRecords }> {
	const scope = await handoutScope(userId, productionId, organizationId);
	if (scope.production.cancelledAt) {
		throw new CheckoutError('production_cancelled', `${scope.production.name} has been cancelled`);
	}
	const packing = await loadPacking(productionId);

	const ids = [...(selection.assetIds ?? [])];
	if (selection.line) {
		const { key, count } = selection.line;
		const listed = await listItems(productionId, PACKABLE_STATUSES, scope.organizationIds);
		const out = new Set(listed.filter((i) => i.status === 'CHECKED_OUT').map((i) => i.assetId));
		const line = buildLines(
			listed,
			scope.production.organizationId,
			scope.byLender,
			(item) => ({ done: out.has(item.assetId), undoable: true }),
			packing
		).find((l) => l.key === key);
		if (line) ids.push(...pickToPack(line.assetIds, count, (id) => out.has(id)));
	}
	if (ids.length === 0) return { result: { count: 0 }, affected: emptyAffected() };

	const items = await prisma.productionItem.findMany({
		where: {
			productionId,
			assetId: { in: await withAccessories(ids) },
			status: { in: PACKABLE_STATUSES }
		},
		select: { id: true, assetId: true, status: true, asset: { select: { organizationId: true } } }
	});
	const sideIds = scope.organizationIds;
	if (sideIds && items.some((i) => !sideIds.includes(i.asset.organizationId))) {
		throw new CheckoutError('forbidden', 'Not a unit of this side');
	}

	const target = caseAssetId ? packing.byAsset.get(caseAssetId) : null;
	const affected = emptyAffected();
	if (caseAssetId) {
		const caseItem = target
			? await prisma.productionItem.findUnique({
					where: { id: target.itemId },
					select: { status: true }
				})
			: null;
		if (!target || !caseItem || !PACKABLE_STATUSES.includes(caseItem.status)) {
			throw new CheckoutError('not_a_pack_case', 'That is no pack case on this production');
		}
		const refusal = packRefusal(
			items.map((i) => i.id),
			{ itemId: target.itemId, isPackCase: target.isPackCase },
			(itemId) => packing.byItem.get(itemId)?.packedInItemId ?? null
		);
		if (refusal === 'not_a_case') {
			throw new CheckoutError('not_a_pack_case', 'That is no pack case on this production');
		}
		if (refusal) {
			throw new CheckoutError(
				'pack_circle',
				'A case cannot go into itself or into something it holds'
			);
		}
		// Packed is handed out: what is not out yet goes now, the case as well.
		const toHandOut = [
			...items.filter((i) => i.status === 'APPROVED').map((i) => i.assetId),
			...(caseItem.status === 'APPROVED' ? [target.ref.assetId] : [])
		];
		if (toHandOut.length > 0) {
			const step = await setHandoutDone(userId, productionId, 'checkout', toHandOut, true);
			mergeAffected(affected, step.affected);
		}
	}

	await prisma.productionItem.updateMany({
		where: { id: { in: items.map((i) => i.id) } },
		data: { packedInItemId: target?.itemId ?? null }
	});
	mergeAffected(affected, { productionIds: [productionId] });
	return { result: { count: items.length }, affected };
}

/**
 * The label for a pack case on this production (Kistenetikett for the
 * production, not for the case's own contents): "Kiste 3" large, the
 * production and the case's product under it, the case's tag as the code, and
 * what is in it now — a case inside as one line ("1× Kiste 5 (Transflex)"),
 * as a kit inside is one. Rendered by case-label-zpl.ts like any case label.
 */
export async function packCaseLabelData(
	userId: string,
	productionId: string,
	caseAssetId: string
): Promise<CaseLabelData & { logoPath: string | null }> {
	const { production } = await handoutScope(userId, productionId);
	const packing = await loadPacking(productionId);
	const node = packing.byAsset.get(caseAssetId);
	if (!node?.isPackCase) {
		throw new CheckoutError('not_a_pack_case', 'That is no pack case on this production');
	}
	const [owner, contents] = await Promise.all([
		prisma.asset.findUniqueOrThrow({
			where: { id: caseAssetId },
			select: { organization: { select: { name: true, shortName: true, logoPath: true } } }
		}),
		prisma.productionItem.findMany({
			where: { productionId, packedInItemId: node.itemId, status: { in: PACKABLE_STATUSES } },
			select: {
				id: true,
				assetId: true,
				sourceBundleId: true,
				asset: {
					select: {
						parentAssetId: true,
						bundleId: true,
						bundle: {
							select: {
								id: true,
								parentBundleId: true,
								template: { select: { name: true, caption: true } },
								parentBundle: {
									select: { id: true, template: { select: { name: true, caption: true } } }
								}
							}
						},
						product: {
							select: { name: true, isContainer: true, manufacturer: { select: { name: true } } }
						}
					}
				}
			}
		})
	]);
	const inside = new Set(contents.map((c) => c.assetId));
	const items = contents
		.map((c) => {
			const inner = packing.byItem.get(c.id);
			// The kit it was booked with, the outer one for a unit of an inner kit.
			const kit = inBookedKit(c)
				? c.asset.bundleId === c.sourceBundleId
					? c.asset.bundle
					: (c.asset.bundle?.parentBundle ?? null)
				: null;
			return {
				assetId: c.assetId,
				name: makerAndName(c.asset.product.manufacturer?.name, c.asset.product.name),
				accessoryOf:
					c.asset.parentAssetId && inside.has(c.asset.parentAssetId) ? c.asset.parentAssetId : null,
				innerKit: inner?.isPackCase
					? { id: c.assetId, name: `Kiste ${caseTitle(inner.ref)}` }
					: kit
						? { id: kit.id, name: withCaption(kit.template.name, kit.template.caption) }
						: null
			};
		})
		// Units by name, each followed by its accessories.
		.sort((a, b) => naturalCompare(a.name, b.name));
	const ordered = [...items.filter((i) => !i.accessoryOf), ...items.filter((i) => i.accessoryOf)];
	const org = owner.organization;
	return {
		title: `Kiste ${caseNumber(node.ref)}`,
		caption: `${production.name} · ${node.ref.name}`,
		code: node.ref.tag,
		orgName: org.shortName || org.name,
		logoPath: org.logoPath,
		lines: caseLabelLines(ordered)
	};
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
	text: string,
	organizationId?: string
): Promise<HandoutCandidate[]> {
	const scope = await handoutScope(userId, productionId, organizationId);
	if (!scope.books || scope.production.cancelledAt || text.replace(/\s/g, '').length < 2) return [];
	// Matched here rather than in SQL, by the same rules as every search box
	// (`#lib/search.ts`): "powercon 1m" finds "TRUE1 → powerCON 1 m" with a
	// word left out, a length written either way, and its cable ends counted.
	const matchSearch = searchMatcher(text);
	const all = await prisma.asset.findMany({
		where: {
			...(scope.organizationIds ? { organizationId: { in: scope.organizationIds } } : {}),
			parentAssetId: null,
			bundleId: null,
			...BOOKABLE_ASSET_WHERE,
			...freeForProduction(scope.production)
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
					cableType: true,
					manufacturer: { select: { name: true } },
					connectorARef: { select: { name: true } },
					connectorBRef: { select: { name: true } }
				}
			}
		}
	});
	const assets = all.filter((asset) =>
		matchSearch(
			asset.product.name,
			asset.product.caption,
			asset.product.manufacturer?.name,
			asset.product.cableType,
			asset.product.connectorARef?.name,
			asset.product.connectorBRef?.name,
			asset.assetTag
		)
	);
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
	count: number,
	organizationId?: string
) {
	const scope = await handoutScope(userId, productionId, organizationId);
	if (!scope.books) throw new CheckoutError('forbidden', 'No access to this production');
	if (scope.organizationIds && !scope.organizationIds.includes(group.organizationId)) {
		throw new CheckoutError('forbidden', 'Not a unit of this side');
	}
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
