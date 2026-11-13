import type { Prisma } from '#lib/prisma/client.js';
import type { BookingReplacedData, CheckoutUndoneData } from '#lib/types/asset-transaction.js';
import { bundleLabel, withCaption } from '#lib/product-label.js';
import { naturalCompare } from '#lib/sort.js';
import type { ListCaseRef } from '#lib/pack-cases.js';
import { prisma } from '#lib/server/auth.js';
import {
	isSystemAdmin,
	productionReadWhere,
	productionVisibility,
	visibleProductionName,
	writableOrgIds
} from './access';
import { ACTIVE_ASSET_WHERE, isBookableStatus, isRetiredStatus } from '#lib/asset-status.js';
import { bookedKitFor, kitAssetsWhere } from '#lib/bundle-nesting.js';
import { withAccessories } from './accessories';
import { canPlaceAt } from './locations';
import { kitByTag, resolveScannedCode, type TaggedKit } from './asset-lookup';
import { onProductionSide } from './production-check';
import { overdueInspections, recordReturnChecks, type OverdueInspection } from './inspections';
import { bookedWithPlace, seeksSwap } from '#lib/unit-swap.js';
import { applySwap, loadSwapRows, swapCheck, type SwapNotice, type SwapRow } from './unit-swap';
import { KitSwapRefused, standInForKit, wholeKitsPicked, type KitSwapNotice } from './kit-swap';

// Scan/checkout behaviour lives here rather than in checkout.remote.ts so the
// /api/v1 endpoints and the web UI share one implementation. These functions
// deliberately know nothing about SvelteKit: they take a user id, touch the
// database, and report which records changed. Cache invalidation is the
// caller's job — see `affected` — because query().refresh() only means
// something to the remote-function layer.

export type ScanTargetType = 'location' | 'production';

export interface ScanInput {
	assetTag: string;
	targetType: ScanTargetType;
	targetId: string;
}

export interface ScannedAsset {
	id: string;
	assetTag: string;
	productName: string;
	productCaption: string | null;
	manufacturerName: string | null;
	/** The unit's org and its product's length: what the cable colour is read off. */
	ownerOrgId?: string;
	lengthCm?: number | null;
}

export interface ScanResult {
	asset: ScannedAsset;
	action: 'LOCATION_ASSIGNED' | 'CHECKED_OUT';
	targetName: string;
	/**
	 * Names of productions the asset was automatically returned from — or, for
	 * one of an org the user doesn't belong to, that org's name.
	 */
	returnedFrom: string[];
	/** What the scanned unit belongs with, offered to book along — see `scanGroup`. */
	group: ScanGroup | null;
	/**
	 * Set when the code was a kit's own sticker: every unit in it was booked, and
	 * `asset` stands for the kit (its first unit's id, the kit's name and tag).
	 * See `performKitScan`.
	 */
	kit?: ScanKit | null;
	/** Checking out: what of it is overdue for which inspection. Never a refusal. */
	overdueInspections?: OverdueInspection[];
	/**
	 * Checking out: the scanned unit took the place of a linked unit of the same
	 * product booked here, and the two swapped places — see `findStandIns`.
	 */
	swap?: SwapNotice | null;
	/**
	 * Checking out a kit's number: the kit went out in the place of the booked
	 * kit of its type, and the booking moved to it — see services/kit-swap.ts.
	 */
	kitSwap?: KitSwapNotice | null;
	/**
	 * On a production's handout list: the scanned unit is a pack case — handing
	 * out opens it for packing, taking back asks about what is in it. Its own
	 * booking went like any unit's. See services/production-handout.ts.
	 */
	packCase?: ListCaseRef | null;
	/** On the handout list: the case the scanned unit (or kit) was packed into. */
	packedInto?: string | null;
}

/**
 * `swap`: whether a unit handed out may swap places with a linked one booked
 * here. Off on take-back and for a kit's sticker, whose units are the kit.
 * `kitSwap`: whether a whole kit going out may take the booked kit of its
 * type's place (services/kit-swap.ts). Follows `swap` unless given, so
 * take-back never moves a booking.
 */
export type CheckoutOptions = { swap?: boolean; kitSwap?: boolean };

export interface ScanKit {
	id: string;
	/** The kit's name with its caption. */
	name: string;
	tag: string | null;
	/** The kit's units this scan booked, to be asked about; their accessories came along. */
	units: ScanGroupUnit[];
}

export interface ScanGroupUnit {
	id: string;
	assetTag: string | null;
	productName: string;
	productCaption: string | null;
	manufacturerName: string | null;
	/** The product's picture, as a stored key — see #lib/images. */
	productImagePath: string | null;
	/** Already where the scan put the unit: nothing to book, shown for completeness. */
	done: boolean;
}

export interface ScanGroup {
	/** `bundle`: the rest of its kit. `parent`: the unit it hangs off, and that unit's other accessories. */
	kind: 'bundle' | 'parent';
	name: string;
	units: ScanGroupUnit[];
}

/** Records touched by an operation, so callers can invalidate their own caches. */
export interface AffectedRecords {
	assetIds: string[];
	organizationIds: string[];
	bundleIds: string[];
	productionIds: string[];
}

export function emptyAffected(): AffectedRecords {
	return { assetIds: [], organizationIds: [], bundleIds: [], productionIds: [] };
}

export function mergeAffected(into: AffectedRecords, from: Partial<AffectedRecords>) {
	for (const key of Object.keys(into) as (keyof AffectedRecords)[]) {
		for (const id of from[key] ?? []) {
			if (!into[key].includes(id)) into[key].push(id);
		}
	}
	return into;
}

/**
 * Thrown for conditions the API maps onto specific HTTP status codes. Plain
 * Errors elsewhere in this module stay 500s, which is what we want for genuine
 * faults.
 */
export class CheckoutError extends Error {
	constructor(
		readonly code:
			| 'asset_not_found'
			| 'serial_ambiguous'
			| 'forbidden'
			| 'wrong_organization'
			| 'asset_retired'
			| 'asset_unavailable'
			| 'production_cancelled'
			| 'not_approved'
			| 'not_a_pack_case'
			| 'pack_circle'
			| 'kit_started'
			| 'kit_not_interchangeable'
			| 'kit_unavailable',
		message: string,
		/** The scanned tag, where there is one — a message naming it is worth more. */
		readonly assetTag?: string,
		/** Values for the message by position, where they are more than the tag. */
		readonly params?: string[]
	) {
		super(message);
		this.name = 'CheckoutError';
	}
}

/** HTTP status per failure, for /api/v1. */
export const CHECKOUT_ERROR_STATUS: Record<CheckoutError['code'], number> = {
	asset_not_found: 404,
	serial_ambiguous: 409,
	forbidden: 403,
	wrong_organization: 403,
	asset_retired: 409,
	asset_unavailable: 409,
	production_cancelled: 409,
	not_approved: 409,
	not_a_pack_case: 409,
	pack_circle: 409,
	kit_started: 409,
	kit_not_interchangeable: 409,
	kit_unavailable: 409
};

const RETURNED_FROM_SELECT = {
	id: true,
	name: true,
	organizationId: true,
	organization: { select: { name: true, shortName: true } }
} as const;

// Deduped: the parent and each of its accessories were on the same production,
// and the scanner reports one return, not five. Named by `visibleProductionName`,
// because the production a unit comes back from may be another org's.
async function returnedFromNames(
	userId: string,
	items: {
		production: {
			id: string;
			name: string;
			organizationId: string;
			organization: { name: string; shortName: string | null };
		};
	}[]
) {
	if (items.length === 0) return [];
	const canSee = await productionVisibility(userId);
	return [...new Set(items.map((i) => visibleProductionName(i.production, canSee)))];
}

/**
 * Checking a unit out to a production changes that production, so it takes the
 * same right as any other change to it: MEMBER in the org that runs it. The one
 * exception is the lender, who hands its own units over to someone else's
 * production — but only units that production has booked and the lender has
 * approved (`assertLenderMayHandOver`). Owning the unit is checked separately
 * either way.
 *
 * `borrower` says whether the person scanning is also on the receiving side
 * (see `onProductionSide`): then handing over and receiving are one act, and a
 * lent unit goes out with its receipt already confirmed.
 */
async function productionCheckoutRole(
	userId: string,
	production: { id: string; organizationId: string },
	systemAdmin: boolean
) {
	const borrower = await onProductionSide(userId, production);
	const asProduction =
		systemAdmin || (await writableOrgIds(userId)).includes(production.organizationId);
	return { asProduction, borrower };
}

/**
 * Productions a scan could go to, each with the part this user plays in it:
 * `production` for its own org (anything goes), `lender` for one that has this
 * user's org's units booked and approved (those units only), null for one they
 * can only read. `canCheck` is less: crew may check what they work with.
 * Cancelled ones are left out — nothing is checked out to them.
 */
export async function productionTargets(userId: string) {
	const [writable, admin] = await Promise.all([writableOrgIds(userId), isSystemAdmin(userId)]);
	const productions = await prisma.production.findMany({
		where: { ...(await productionReadWhere(userId, undefined, { lent: true })), cancelledAt: null },
		include: {
			organization: true,
			items: {
				where: {
					status: { in: HANDOVER_STATUSES },
					asset: { organizationId: { in: writable } }
				},
				select: { id: true },
				take: 1
			},
			crew: { where: { userId }, select: { id: true } }
		},
		orderBy: [{ startDate: 'desc' }, { name: 'asc' }]
	});
	return productions.map(({ items, crew, ...production }) => {
		// A system admin may book anything anywhere, but a production their own
		// org only lends to still reads as `lender` — the role is also what the
		// lists label it by, and the scan checks rights on its own.
		const checkoutRole: 'production' | 'lender' | null = writable.includes(
			production.organizationId
		)
			? 'production'
			: items.length > 0
				? 'lender'
				: admin
					? 'production'
					: null;
		return { ...production, checkoutRole, canCheck: checkoutRole !== null || crew.length > 0 };
	});
}

/** What a lender may still hand over: approved, out already, or back and going out again. */
const HANDOVER_STATUSES = ['APPROVED', 'CHECKED_OUT', 'RETURNED'];

/**
 * A lender hands over what the production booked and it approved — and, once a
 * loan stands, more of its own: a cable grabbed while packing has nobody else
 * to approve it, since the lender is who would. "A loan stands" means the
 * production already holds an approved unit of the same org, so the borrower
 * asked for something from it once and any rental terms were agreed then.
 * Returns the units that go on as such additions, for their history.
 */
async function assertLenderMayHandOver(
	productionId: string,
	items: { assetId: string; status: string }[],
	assets: { id: string; organizationId: string }[],
	assetTag?: string,
	standIns: Map<string, unknown> = new Map()
): Promise<Set<string>> {
	const unbooked = assets.filter((asset) => {
		if (standIns.has(asset.id)) return false;
		const item = items.find((i) => i.assetId === asset.id);
		return !item || !HANDOVER_STATUSES.includes(item.status);
	});
	if (unbooked.length === 0) return new Set();
	const orgIds = [...new Set(unbooked.map((a) => a.organizationId))];
	const lending = await prisma.productionItem.findMany({
		where: {
			productionId,
			status: { in: HANDOVER_STATUSES },
			asset: { organizationId: { in: orgIds } }
		},
		select: { asset: { select: { organizationId: true } } },
		distinct: ['assetId']
	});
	const lends = new Set(lending.map((i) => i.asset.organizationId));
	if (unbooked.some((a) => !lends.has(a.organizationId))) {
		throw new CheckoutError(
			'not_approved',
			'Not booked and approved on this production — only the production’s own org can add it',
			assetTag
		);
	}
	return new Set(unbooked.map((a) => a.id));
}

/**
 * The receipt columns of a lent unit going out. Going out again after a
 * return starts a new handover, so whatever the last one confirmed is cleared.
 */
function handoverOnCheckout(lent: boolean, borrower: boolean, userId: string) {
	if (!lent) return {};
	return {
		receivedAt: borrower ? new Date() : null,
		receivedById: borrower ? userId : null,
		returnReportedAt: null,
		returnReportedById: null
	};
}

type StandIn = {
	id: string;
	assetId: string;
	/** Set when the booked unit is linked — in a kit, or on a unit — and the two swap places. */
	swap?: { scanned: SwapRow; partner: SwapRow };
};

type StandInCandidate = {
	id: string;
	productId: string;
	organizationId: string;
	parentAssetId: string | null;
	bundleId: string | null;
	bundle?: { parentBundleId: string | null } | null;
};

/**
 * Booked units the scanned ones can take the place of. A booking names one
 * unit, but six power strips are six power strips: whoever packs grabs the six
 * at the front of the shelf. Without this a different unit of the same product
 * went on as a seventh line while the booked one stayed APPROVED, and the lender
 * — who may only hand over what is booked — was refused it outright.
 *
 * A stand-in is an APPROVED item (booked, not out yet) of the same product and
 * the same owner. Not one booked as part of a kit, whose case holds that very
 * unit, and not an accessory, which goes wherever its parent goes. Each booked
 * item stands in for one scanned unit at most, lowest unit number first.
 *
 * Failing that, with `swap` on, a booked unit that *is* linked: booked as part
 * of the kit it is in, or as an accessory of the unit it hangs off. Then the
 * two swap places as well (`applySwap`): the scanned unit goes into the kit or
 * onto the unit, and the booked one takes the scanned one's old place. That is
 * how ring 2's adapter goes out with ring 1. Under the rules of #lib/unit-swap
 * — same product and org, the scanned unit free, the product not marked "not
 * interchangeable", and no booking of either clashing. A scanned unit whose own
 * kit or parent is booked here joins that booking instead.
 */
async function findStandIns(
	production: { id: string; startDate: Date | null; endDate: Date | null },
	assets: StandInCandidate[],
	/** Everything going out in this act: a unit booked for itself stands in for nobody. */
	goingOut: string[],
	options: CheckoutOptions = {}
): Promise<Map<string, StandIn>> {
	const candidates = assets.filter((a) => !a.parentAssetId);
	const standIns = new Map<string, StandIn>();
	if (candidates.length > 0) await looseStandIns(production.id, candidates, goingOut, standIns);
	if (options.swap === false) return standIns;
	await swapStandIns(
		production,
		assets.filter((a) => !standIns.has(a.id)),
		goingOut,
		standIns
	);
	return standIns;
}

async function looseStandIns(
	productionId: string,
	candidates: StandInCandidate[],
	goingOut: string[],
	standIns: Map<string, StandIn>
) {
	const items = await prisma.productionItem.findMany({
		where: {
			productionId,
			status: 'APPROVED',
			sourceBundleId: null,
			sourceParentAssetId: null,
			assetId: { notIn: goingOut },
			asset: {
				OR: candidates.map((a) => ({ productId: a.productId, organizationId: a.organizationId }))
			}
		},
		select: {
			id: true,
			assetId: true,
			asset: { select: { productId: true, organizationId: true } }
		},
		orderBy: { asset: { orgIndex: 'asc' } }
	});
	const taken = new Set<string>();
	for (const asset of candidates) {
		const item = items.find(
			(i) =>
				!taken.has(i.id) &&
				i.asset.productId === asset.productId &&
				i.asset.organizationId === asset.organizationId
		);
		if (!item) continue;
		taken.add(item.id);
		standIns.set(asset.id, { id: item.id, assetId: item.assetId });
	}
}

/** The linked half of `findStandIns`. */
async function swapStandIns(
	production: { id: string; startDate: Date | null; endDate: Date | null },
	rest: StandInCandidate[],
	goingOut: string[],
	standIns: Map<string, StandIn>
) {
	if (rest.length === 0) return;
	const productionId = production.id;
	// Joining its own kit's or parent's booking beats taking another's place,
	// and an accessory going out with its parent travels with it.
	const kits = await bookedKits(
		productionId,
		rest.flatMap((a) => [a.bundleId, a.bundle?.parentBundleId ?? null])
	);
	const parentIds = rest.flatMap((a) => (a.parentAssetId ? [a.parentAssetId] : []));
	const parentsBooked = new Set(
		parentIds.length === 0
			? []
			: (
					await prisma.productionItem.findMany({
						where: { productionId, assetId: { in: parentIds } },
						select: { assetId: true }
					})
				).map((i) => i.assetId)
	);
	const seekers = rest.filter((a) =>
		seeksSwap(a, { bookedKits: kits, bookedUnits: parentsBooked, goingOut })
	);
	if (seekers.length === 0) return;

	const items = await prisma.productionItem.findMany({
		where: {
			productionId,
			status: 'APPROVED',
			assetId: { notIn: goingOut },
			OR: [{ sourceBundleId: { not: null } }, { sourceParentAssetId: { not: null } }],
			asset: {
				OR: seekers.map((a) => ({ productId: a.productId, organizationId: a.organizationId }))
			}
		},
		select: {
			id: true,
			assetId: true,
			sourceBundleId: true,
			sourceParentAssetId: true,
			asset: {
				select: {
					productId: true,
					organizationId: true,
					bundleId: true,
					parentAssetId: true,
					bundle: { select: { parentBundleId: true } }
				}
			}
		},
		orderBy: { asset: { orgIndex: 'asc' } }
	});
	const linked = items.filter((i) => bookedWithPlace(i, i.asset));
	if (linked.length === 0) return;

	const rows = new Map(
		(await loadSwapRows([...seekers.map((a) => a.id), ...linked.map((i) => i.assetId)])).map(
			(r) => [r.id, r]
		)
	);
	const taken = new Set<string>();
	for (const asset of seekers) {
		const scanned = rows.get(asset.id);
		if (!scanned) continue;
		for (const item of linked) {
			if (taken.has(item.id)) continue;
			if (item.asset.productId !== asset.productId) continue;
			if (item.asset.organizationId !== asset.organizationId) continue;
			const partner = rows.get(item.assetId);
			if (!partner || (await swapCheck(scanned, partner, production))) continue;
			taken.add(item.id);
			standIns.set(asset.id, { id: item.id, assetId: item.assetId, swap: { scanned, partner } });
			break;
		}
	}
}

/** Where a unit is after its stand-in moved it, for what it is offered to book along. */
function placedAfter<T extends { bundleId: string | null; parentAssetId: string | null }>(
	asset: T,
	standIn: StandIn | undefined
): T {
	const partner = standIn?.swap?.partner;
	return partner
		? { ...asset, bundleId: partner.bundleId, parentAssetId: partner.parentAssetId }
		: asset;
}

/**
 * Hands a booked item over to the unit actually scanned, which goes out on it.
 * The booked unit stays on the shelf and is free again, so its accessories that
 * were booked with it go too, and its history says where its booking went.
 * A linked one swaps places with the scanned unit first; its SWAPPED entry
 * then says where the booking went.
 */
async function checkOutInPlaceOf(
	tx: Prisma.TransactionClient,
	standIn: StandIn,
	scanned: { id: string; assetTag: string | null; orgIndex: number },
	production: { id: string; name: string },
	handover: ReturnType<typeof handoverOnCheckout>,
	userId: string
): Promise<SwapNotice | null> {
	const swap = standIn.swap
		? await applySwap(tx, userId, standIn.swap.scanned, standIn.swap.partner, {
				kind: 'handout',
				production
			})
		: null;
	await tx.productionItem.update({
		where: { id: standIn.id },
		data: { assetId: scanned.id, status: 'CHECKED_OUT', ...handover }
	});
	await tx.productionItem.deleteMany({
		where: {
			productionId: production.id,
			sourceParentAssetId: standIn.assetId,
			status: 'APPROVED'
		}
	});
	if (swap) return swap;
	await tx.assetTransaction.create({
		data: {
			assetId: standIn.assetId,
			userId,
			productionId: production.id,
			action: 'BOOKING_REPLACED',
			data: {
				type: 'BOOKING_REPLACED',
				productionId: production.id,
				productionName: production.name,
				replacedByAssetId: scanned.id,
				// Same product by definition, so the tag is what tells the two apart.
				replacedByLabel: scanned.assetTag ?? `#${scanned.orgIndex}`
			} satisfies BookingReplacedData
		}
	});
	return null;
}

/** `standInForKit`, its refusal as this module's error. */
async function kitStandIn(
	userId: string,
	production: { id: string; name: string; startDate: Date | null; endDate: Date | null },
	kitId: string
) {
	try {
		return await standInForKit(userId, production, kitId);
	} catch (err) {
		if (!(err instanceof KitSwapRefused)) throw err;
		const code =
			err.reason === 'started'
				? 'kit_started'
				: err.reason === 'not_interchangeable'
					? 'kit_not_interchangeable'
					: 'kit_unavailable';
		throw new CheckoutError(code, err.message, undefined, [err.bookedKit, err.scannedKit]);
	}
}

/**
 * Nothing is checked out to a cancelled production. Units already out on it
 * still come back through a scan to a location, which never gets here.
 */
function assertProductionOpen(production: { name: string; cancelledAt: Date | null }) {
	if (production.cancelledAt) {
		throw new CheckoutError(
			'production_cancelled',
			`"${production.name}" has been cancelled and takes no checkouts`
		);
	}
}

async function assertAssetAccess(userId: string, organizationId: string) {
	const [orgIds, systemAdmin] = await Promise.all([writableOrgIds(userId), isSystemAdmin(userId)]);
	if (!systemAdmin && !orgIds.includes(organizationId)) {
		throw new CheckoutError('forbidden', 'No access to this asset');
	}
	return systemAdmin;
}

/**
 * Move one scanned asset to a location, or check it out to a production.
 *
 * Assigning an asset to a location also returns it from any production it is
 * currently checked out to — putting kit back on the shelf is what "returned"
 * means in practice, and expecting a second explicit action was a reliable way
 * to leave stale CHECKED_OUT rows behind.
 */
export async function performScan(
	userId: string,
	input: ScanInput,
	options: CheckoutOptions = {}
): Promise<{ result: ScanResult; affected: AffectedRecords }> {
	// A kit's number first — its own tag, or the tag of the container that is
	// its case, which means the kit rather than the box (#lib/bundle-case.ts).
	const numberedKit = await kitByTag(input.assetTag);
	if (numberedKit) return await performKitScan(userId, numberedKit, input);

	const match = await resolveScannedCode(userId, input.assetTag);

	if (match.kind === 'ambiguous') {
		throw new CheckoutError(
			'serial_ambiguous',
			`Serial number "${input.assetTag}" is on more than one unit — scan the asset tag instead`,
			input.assetTag
		);
	}
	if (match.kind === 'not_found') {
		throw new CheckoutError('asset_not_found', `Tag "${input.assetTag}" not found`, input.assetTag);
	}

	const asset = await prisma.asset.findUniqueOrThrow({
		where: { id: match.assetId },
		include: {
			product: { include: { manufacturer: true } },
			location: true,
			bundle: { select: { parentBundleId: true } }
		}
	});

	const systemAdmin = await assertAssetAccess(userId, asset.organizationId);

	if (isRetiredStatus(asset.status)) {
		throw new CheckoutError(
			'asset_retired',
			`Tag "${input.assetTag}" is sold or decommissioned and can no longer be booked`
		);
	}

	const scannedAsset: ScannedAsset = {
		id: asset.id,
		assetTag: asset.assetTag ?? input.assetTag,
		productName: asset.product.name,
		productCaption: asset.product.caption,
		manufacturerName: asset.product.manufacturer?.name ?? null,
		ownerOrgId: asset.organizationId,
		lengthCm: asset.product.lengthCm
	};

	// Scanning a unit does the same thing to whatever is attached to it: the
	// case, the power supply, the brackets moved because it moved. Each gets its
	// own AssetTransaction, so the audit trail per cable survives. Scanning an
	// accessory on its own moves only itself — a cable found loose on a shelf is
	// a real situation, and it says so by not carrying the parent along.
	const accessories = await prisma.asset.findMany({
		where: { parentAssetId: asset.id, ...ACTIVE_ASSET_WHERE },
		select: { id: true }
	});
	const touchedIds = [asset.id, ...accessories.map((a) => a.id)];

	const affected = emptyAffected();
	mergeAffected(affected, { assetIds: touchedIds, organizationIds: [asset.organizationId] });

	if (input.targetType === 'location') {
		const location = await prisma.location.findUniqueOrThrow({ where: { id: input.targetId } });
		if (!(await canPlaceAt(userId, location, asset.organizationId))) {
			throw new CheckoutError('wrong_organization', 'Location belongs to a different organisation');
		}

		const checkedOutItems = await prisma.productionItem.findMany({
			where: { assetId: { in: touchedIds }, status: 'CHECKED_OUT' },
			include: { production: { select: RETURNED_FROM_SELECT } }
		});

		await prisma.$transaction(async (tx) => {
			await tx.asset.updateMany({
				where: { id: { in: touchedIds } },
				data: { locationId: input.targetId }
			});

			await tx.assetTransaction.createMany({
				data: touchedIds.map((assetId) => ({
					assetId,
					userId,
					action: 'LOCATION_ASSIGNED',
					data: { type: 'LOCATION_ASSIGNED', locationId: location.id, locationName: location.name }
				}))
			});

			for (const item of checkedOutItems) {
				// Back is out of its case: the case is empty once all of it is back.
				await tx.productionItem.update({
					where: { id: item.id },
					data: { status: 'RETURNED', packedInItemId: null }
				});
				await tx.assetTransaction.create({
					data: {
						assetId: item.assetId,
						userId,
						productionId: item.production.id,
						action: 'RETURNED',
						data: {
							type: 'RETURNED',
							fromProductionId: item.production.id,
							fromProductionName: item.production.name,
							toLocationId: location.id,
							toLocationName: location.name
						}
					}
				});
			}

			// Booked back without a defect reported: looked at and found fine.
			await recordReturnChecks(
				tx,
				userId,
				checkedOutItems.map((i) => i.assetId)
			);

			// A bundle's location follows the assets inside it.
			if (asset.bundleId) {
				await tx.assetBundle.update({
					where: { id: asset.bundleId },
					data: { locationId: input.targetId }
				});
			}
		});

		mergeAffected(affected, {
			bundleIds: asset.bundleId ? [asset.bundleId] : [],
			productionIds: checkedOutItems.map((i) => i.production.id)
		});

		return {
			result: {
				asset: scannedAsset,
				action: 'LOCATION_ASSIGNED',
				targetName: location.name,
				returnedFrom: await returnedFromNames(userId, checkedOutItems),
				group: await scanGroup(asset, input)
			},
			affected
		};
	}

	// Only checking out is refused. Assigning a location still works: a unit held
	// back from planning is still a unit someone has to be able to put on a shelf.
	if (!isBookableStatus(asset.status)) {
		throw new CheckoutError(
			'asset_unavailable',
			`Tag "${input.assetTag}" is marked unavailable and cannot be checked out`
		);
	}

	const production = await prisma.production.findUniqueOrThrow({ where: { id: input.targetId } });
	const role = await productionCheckoutRole(userId, production, systemAdmin);
	assertProductionOpen(production);

	const existingItems = await prisma.productionItem.findMany({
		where: { productionId: input.targetId, assetId: { in: touchedIds } },
		select: { id: true, assetId: true, status: true }
	});
	const alreadyBooked = new Set(existingItems.map((i) => i.assetId));
	const standIn = alreadyBooked.has(asset.id)
		? undefined
		: (await findStandIns(production, [asset], touchedIds, options)).get(asset.id);
	// Accessories follow the unit they hang off, booked or not.
	const addedByLender =
		!role.asProduction && !standIn
			? await assertLenderMayHandOver(production.id, existingItems, [asset], input.assetTag)
			: new Set<string>();

	const lent = asset.organizationId !== production.organizationId;
	const kit = alreadyBooked.has(asset.id)
		? null
		: bookedKitFor(
				asset,
				await bookedKits(production.id, [asset.bundleId, asset.bundle?.parentBundleId ?? null])
			);
	const swap = await prisma.$transaction(async (tx) => {
		await checkOutExisting(tx, existingItems, lent, role.borrower, userId);
		let swap: SwapNotice | null = null;
		if (standIn) {
			const handover = handoverOnCheckout(lent, role.borrower, userId);
			swap = await checkOutInPlaceOf(tx, standIn, asset, production, handover, userId);
		}
		// The scanned unit itself went out on the item it took over.
		const newIds = touchedIds.filter(
			(id) => !alreadyBooked.has(id) && !(standIn && id === asset.id)
		);
		if (newIds.length > 0) {
			await tx.productionItem.createMany({
				data: newIds.map((assetId) => ({
					productionId: input.targetId,
					assetId,
					sourceParentAssetId: accessories.some((accessory) => accessory.id === assetId)
						? asset.id
						: null,
					sourceBundleId: assetId === asset.id ? kit : null,
					status: 'CHECKED_OUT',
					...handoverOnCheckout(lent, role.borrower, userId)
				}))
			});
		}
		await tx.assetTransaction.createMany({
			data: touchedIds.map((assetId) => ({
				assetId,
				userId,
				productionId: input.targetId,
				action: 'CHECKED_OUT',
				data: {
					type: 'CHECKED_OUT',
					productionId: production.id,
					productionName: production.name,
					...(addedByLender.has(assetId) ? { addedByLender: true } : {})
				}
			}))
		});
		return swap;
	});

	mergeAffected(affected, { productionIds: [production.id] });
	if (standIn?.swap) {
		const { partner } = standIn.swap;
		mergeAffected(affected, {
			assetIds: [partner.id],
			bundleIds: [asset.bundleId, partner.bundleId].filter((id): id is string => id !== null)
		});
	}

	return {
		result: {
			asset: scannedAsset,
			action: 'CHECKED_OUT',
			targetName: production.name,
			returnedFrom: [],
			group: await scanGroup(placedAfter(asset, standIn), input),
			overdueInspections: await overdueInspections(touchedIds),
			swap
		},
		affected
	};
}

/**
 * The units of a kit a scan of its sticker books, by name: the top-level ones
 * this user may book, those of the kits inside it included — accessories come
 * along with their unit, as always.
 * `only` narrows them to the ones a list has. A unit marked unavailable stays
 * behind when the scan goes to a production, as a scan of it alone would.
 */
export async function kitScanUnits(
	userId: string,
	kit: TaggedKit,
	targetType: ScanTargetType,
	only?: Set<string>
) {
	const [orgIds, systemAdmin] = await Promise.all([writableOrgIds(userId), isSystemAdmin(userId)]);
	const name = withCaption(kit.template.name, kit.template.caption);
	const units = await prisma.asset.findMany({
		where: { ...kitAssetsWhere(kit.id), parentAssetId: null, ...ACTIVE_ASSET_WHERE },
		select: {
			id: true,
			assetTag: true,
			status: true,
			organizationId: true,
			locationId: true,
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
	const mine = units.filter((u) => systemAdmin || orgIds.includes(u.organizationId));
	if (units.length > 0 && mine.length === 0) {
		throw new CheckoutError('forbidden', `No access to kit "${name}"`, kit.tag ?? undefined);
	}
	return mine
		.filter((u) => !only || only.has(u.id))
		.filter((u) => targetType === 'location' || isBookableStatus(u.status))
		.sort(
			(a, b) =>
				naturalCompare(a.product.name, b.product.name) ||
				naturalCompare(a.assetTag ?? '', b.assetTag ?? '')
		);
}

type KitScanUnit = Awaited<ReturnType<typeof kitScanUnits>>[number];

/** The answer to a kit's sticker, in the shape of any other scan's. */
export function kitScanResult(
	kit: TaggedKit,
	units: KitScanUnit[],
	rest: Pick<ScanResult, 'action' | 'targetName' | 'returnedFrom'>
): ScanResult {
	const name = withCaption(kit.template.name, kit.template.caption);
	return {
		asset: {
			id: units[0]?.id ?? kit.id,
			assetTag: kit.tag ?? '',
			productName: name,
			productCaption: null,
			manufacturerName: null
		},
		...rest,
		group: null,
		kit: {
			id: kit.id,
			name,
			tag: kit.tag,
			units: units.map((u) => ({
				id: u.id,
				assetTag: u.assetTag,
				productName: u.product.name,
				productCaption: u.product.caption,
				manufacturerName: u.product.manufacturer?.name ?? null,
				productImagePath: u.product.imagePath,
				done: true
			}))
		}
	};
}

/**
 * A kit's sticker scanned in a session: every unit in it goes to the target at
 * once — the case is on the trolley, and its sticker stands for what is in it.
 * Through `performBulkCheckout`, so every rule of booking a unit applies to each.
 */
async function performKitScan(
	userId: string,
	kit: TaggedKit,
	input: ScanInput
): Promise<{ result: ScanResult; affected: AffectedRecords }> {
	const units = await kitScanUnits(userId, kit, input.targetType);
	if (units.length === 0) {
		throw new CheckoutError(
			'asset_unavailable',
			`Nothing in kit "${withCaption(kit.template.name, kit.template.caption)}" can be booked`,
			kit.tag ?? undefined
		);
	}
	const ids = units.map((u) => u.id);
	const returning =
		input.targetType === 'location'
			? await prisma.productionItem.findMany({
					where: { assetId: { in: ids }, status: 'CHECKED_OUT' },
					include: { production: { select: RETURNED_FROM_SELECT } }
				})
			: [];
	// The kit's own units are the kit: none of them takes another unit's
	// place — the kit as a whole may take the booked kit's.
	const { result, affected } = await performBulkCheckout(
		userId,
		{ ...input, assetIds: ids },
		{ swap: false, kitSwap: true }
	);
	return {
		result: {
			...kitScanResult(kit, units, {
				action: input.targetType === 'location' ? 'LOCATION_ASSIGNED' : 'CHECKED_OUT',
				targetName: result.targetName,
				returnedFrom: await returnedFromNames(userId, returning)
			}),
			...(input.targetType === 'production'
				? {
						overdueInspections: await overdueInspections(affected.assetIds),
						kitSwap: result.kitSwaps.find((k) => k.kitId === kit.id) ?? null
					}
				: {})
		},
		affected
	};
}

/**
 * The kits among `bundleIds` that the production has booked. A unit going out
 * that belongs to one of them — put into the kit after it was booked — joins
 * the kit's booking rather than becoming a line of its own, so the production
 * lists and bills the kit whole.
 */
async function bookedKits(productionId: string, bundleIds: (string | null)[]) {
	const ids = [...new Set(bundleIds.filter((id): id is string => id !== null))];
	if (ids.length === 0) return new Set<string>();
	const items = await prisma.productionItem.findMany({
		where: { productionId, sourceBundleId: { in: ids } },
		select: { sourceBundleId: true },
		distinct: ['sourceBundleId']
	});
	return new Set(items.map((i) => i.sourceBundleId!));
}

/**
 * Sets booked items to CHECKED_OUT. Only an item actually going out starts a
 * new handover — a second scan of a unit that is already out must not wipe the
 * receipt the borrower confirmed in between.
 */
async function checkOutExisting(
	tx: Prisma.TransactionClient,
	items: { id: string; status: string }[],
	lent: boolean,
	borrower: boolean,
	userId: string
) {
	if (items.length === 0) return;
	const ids = items.map((i) => i.id);
	await tx.productionItem.updateMany({
		where: { id: { in: ids }, status: { not: 'CHECKED_OUT' } },
		data: { status: 'CHECKED_OUT', ...handoverOnCheckout(lent, borrower, userId) }
	});
	if (lent && borrower) {
		await tx.productionItem.updateMany({
			where: { id: { in: ids }, receivedAt: null },
			data: { receivedAt: new Date(), receivedById: userId }
		});
	}
}

const GROUP_UNIT_SELECT = {
	id: true,
	assetTag: true,
	status: true,
	locationId: true,
	parentAssetId: true,
	product: {
		select: { name: true, caption: true, imagePath: true, manufacturer: { select: { name: true } } }
	},
	productionItems: { where: { status: 'CHECKED_OUT' }, select: { productionId: true } }
} as const;

/**
 * What a scanned unit belongs with, asked about after it is booked rather than
 * before, so a scan never waits on a tap. A kit member brings the rest of its
 * kit; an accessory brings the unit it hangs off and that unit's other
 * accessories. The other members' own accessories are not listed: booking a
 * unit takes them along anyway. Null when there is nothing to ask about.
 */
async function scanGroup(
	asset: { id: string; bundleId: string | null; parentAssetId: string | null },
	target: { targetType: ScanTargetType; targetId: string }
): Promise<ScanGroup | null> {
	let kind: ScanGroup['kind'];
	let name: string;
	let rows;
	if (asset.parentAssetId) {
		const parent = await prisma.asset.findUniqueOrThrow({
			where: { id: asset.parentAssetId },
			select: { assetTag: true, product: { select: { name: true, caption: true } } }
		});
		kind = 'parent';
		const parentName = withCaption(parent.product.name, parent.product.caption);
		name = parent.assetTag ? `${parentName} (${parent.assetTag})` : parentName;
		rows = await prisma.asset.findMany({
			where: {
				OR: [
					{ id: asset.parentAssetId },
					{ parentAssetId: asset.parentAssetId, id: { not: asset.id } }
				],
				...ACTIVE_ASSET_WHERE
			},
			select: GROUP_UNIT_SELECT
		});
	} else if (asset.bundleId) {
		const bundle = await prisma.assetBundle.findUniqueOrThrow({
			where: { id: asset.bundleId },
			select: { tag: true, template: { select: { name: true, caption: true } } }
		});
		kind = 'bundle';
		name = bundleLabel(bundle);
		rows = await prisma.asset.findMany({
			where: {
				bundleId: asset.bundleId,
				parentAssetId: null,
				id: { not: asset.id },
				...ACTIVE_ASSET_WHERE
			},
			select: GROUP_UNIT_SELECT
		});
	} else {
		return null;
	}

	const toProduction = target.targetType === 'production';
	const units = rows
		// A unit held back as unavailable can't be checked out, so offering it
		// would only lead to a refusal.
		.filter((row) => !toProduction || isBookableStatus(row.status))
		.map((row) => ({
			id: row.id,
			assetTag: row.assetTag,
			productName: row.product.name,
			productCaption: row.product.caption,
			manufacturerName: row.product.manufacturer?.name ?? null,
			productImagePath: row.product.imagePath,
			done: toProduction
				? row.productionItems.some((item) => item.productionId === target.targetId)
				: row.locationId === target.targetId && row.productionItems.length === 0
		}))
		// The parent first, then by name.
		.sort(
			(a, b) =>
				Number(rows.find((r) => r.id === a.id)?.parentAssetId !== null) -
					Number(rows.find((r) => r.id === b.id)?.parentAssetId !== null) ||
				naturalCompare(a.productName, b.productName)
		);
	return units.length > 0 ? { kind, name, units } : null;
}

export interface BulkCheckoutInput {
	assetIds: string[];
	targetType: ScanTargetType;
	targetId: string;
}

/** Move a hand-picked set of assets in one go (the web UI's bulk action). */
export async function performBulkCheckout(
	userId: string,
	input: BulkCheckoutInput,
	options: CheckoutOptions = {}
): Promise<{
	result: { count: number; targetName: string; swaps: SwapNotice[]; kitSwaps: KitSwapNotice[] };
	affected: AffectedRecords;
}> {
	const [orgIds, systemAdmin] = await Promise.all([writableOrgIds(userId), isSystemAdmin(userId)]);

	// Everything attached to a picked unit is picked with it, before anything
	// else looks at the list — so the access and retirement checks, the
	// per-asset writes and `movedBundleIds` below all see one flat set.
	const assetIds = await withAccessories(input.assetIds);
	const selected = new Set(input.assetIds);

	const assets = await prisma.asset.findMany({
		where: { id: { in: assetIds } },
		select: {
			id: true,
			assetTag: true,
			orgIndex: true,
			productId: true,
			organizationId: true,
			bundleId: true,
			bundle: { select: { parentBundleId: true } },
			parentAssetId: true,
			status: true
		}
	});

	for (const asset of assets) {
		if (!systemAdmin && !orgIds.includes(asset.organizationId)) {
			throw new CheckoutError('forbidden', 'No access to one or more assets');
		}
		if (isRetiredStatus(asset.status)) {
			throw new CheckoutError(
				'asset_retired',
				'One or more assets are sold or decommissioned and can no longer be booked'
			);
		}
		// Only what was actually picked. An accessory travels with its parent — it is
		// never booked on its own — so a bracket marked unavailable does not hold back
		// the fixture it is bolted to, and could not be left behind physically anyway.
		if (
			input.targetType === 'production' &&
			selected.has(asset.id) &&
			!isBookableStatus(asset.status)
		) {
			throw new CheckoutError(
				'asset_unavailable',
				'One or more assets are marked unavailable and cannot be checked out'
			);
		}
	}

	const affected = emptyAffected();
	mergeAffected(affected, {
		assetIds: assets.map((a) => a.id),
		organizationIds: assets.map((a) => a.organizationId)
	});

	if (input.targetType === 'location') {
		const location = await prisma.location.findUniqueOrThrow({ where: { id: input.targetId } });

		// Only move a bundle's location when the whole bundle is in this batch —
		// a half-moved bundle isn't anywhere in particular.
		const bundleIds = [...new Set(assets.map((a) => a.bundleId).filter(Boolean))] as string[];
		const movedBundleIds: string[] = [];
		for (const bundleId of bundleIds) {
			const bundleAssets = await prisma.asset.findMany({
				where: { bundleId },
				select: { id: true }
			});
			if (bundleAssets.every((ba) => assetIds.includes(ba.id))) movedBundleIds.push(bundleId);
		}

		for (const asset of assets) {
			if (!(await canPlaceAt(userId, location, asset.organizationId))) {
				throw new CheckoutError(
					'wrong_organization',
					'Location belongs to a different organisation'
				);
			}

			const checkedOutItems = await prisma.productionItem.findMany({
				where: { assetId: asset.id, status: 'CHECKED_OUT' },
				include: { production: { select: RETURNED_FROM_SELECT } }
			});

			await prisma.$transaction(async (tx) => {
				await tx.asset.update({ where: { id: asset.id }, data: { locationId: input.targetId } });
				await tx.assetTransaction.create({
					data: {
						assetId: asset.id,
						userId,
						action: 'LOCATION_ASSIGNED',
						data: {
							type: 'LOCATION_ASSIGNED',
							locationId: location.id,
							locationName: location.name
						}
					}
				});
				for (const item of checkedOutItems) {
					await tx.productionItem.update({
						where: { id: item.id },
						data: { status: 'RETURNED', packedInItemId: null }
					});
					await tx.assetTransaction.create({
						data: {
							assetId: asset.id,
							userId,
							productionId: item.production.id,
							action: 'RETURNED',
							data: {
								type: 'RETURNED',
								fromProductionId: item.production.id,
								fromProductionName: item.production.name,
								toLocationId: location.id,
								toLocationName: location.name
							}
						}
					});
				}
				if (checkedOutItems.length > 0) await recordReturnChecks(tx, userId, [asset.id]);
			});

			mergeAffected(affected, { productionIds: checkedOutItems.map((i) => i.production.id) });
		}

		if (movedBundleIds.length > 0) {
			await prisma.assetBundle.updateMany({
				where: { id: { in: movedBundleIds } },
				data: { locationId: input.targetId }
			});
		}
		// Every bundle a unit left, moved or not: the bundle views place a case by
		// where its units are, so a half-moved one reads differently too.
		mergeAffected(affected, { bundleIds });

		return {
			result: { count: assets.length, targetName: location.name, swaps: [], kitSwaps: [] },
			affected
		};
	}

	const production = await prisma.production.findUniqueOrThrow({ where: { id: input.targetId } });
	const role = await productionCheckoutRole(userId, production, systemAdmin);
	assertProductionOpen(production);

	// A whole kit going out takes over the booking of the booked one of its
	// type first, so what follows finds it booked and checks it out.
	const kitSwaps: KitSwapNotice[] = [];
	if (options.kitSwap ?? options.swap !== false) {
		for (const kitId of await wholeKitsPicked(assets, selected)) {
			const moved = await kitStandIn(userId, production, kitId);
			if (!moved) continue;
			kitSwaps.push(moved.notice);
			mergeAffected(affected, {
				assetIds: moved.releasedAssetIds,
				bundleIds: [moved.notice.kitId, moved.notice.replacedKitId]
			});
		}
	}

	const existingItems = await prisma.productionItem.findMany({
		where: { productionId: input.targetId, assetId: { in: assets.map((a) => a.id) } },
		select: { id: true, assetId: true, status: true }
	});
	const standIns = await findStandIns(
		production,
		assets.filter((a) => selected.has(a.id) && !existingItems.some((i) => i.assetId === a.id)),
		assetIds,
		options
	);
	const addedByLender = role.asProduction
		? new Set<string>()
		: await assertLenderMayHandOver(
				production.id,
				existingItems,
				assets.filter((a) => selected.has(a.id)),
				undefined,
				standIns
			);
	const kits = await bookedKits(
		production.id,
		assets.flatMap((a) => [a.bundleId, a.bundle?.parentBundleId ?? null])
	);

	const swaps: SwapNotice[] = [];
	for (const asset of assets) {
		const existing = existingItems.find((i) => i.assetId === asset.id);
		const standIn = standIns.get(asset.id);
		const lent = asset.organizationId !== production.organizationId;

		if (existing) {
			await prisma.$transaction((tx) =>
				checkOutExisting(tx, [existing], lent, role.borrower, userId)
			);
		} else if (standIn) {
			const handover = handoverOnCheckout(lent, role.borrower, userId);
			const swap = await prisma.$transaction((tx) =>
				checkOutInPlaceOf(tx, standIn, asset, production, handover, userId)
			);
			if (swap && standIn.swap) {
				swaps.push(swap);
				const { partner } = standIn.swap;
				mergeAffected(affected, {
					assetIds: [partner.id],
					bundleIds: [asset.bundleId, partner.bundleId].filter((id): id is string => id !== null)
				});
			}
		} else {
			await prisma.productionItem.create({
				data: {
					productionId: input.targetId,
					assetId: asset.id,
					sourceParentAssetId: asset.parentAssetId,
					sourceBundleId: bookedKitFor(asset, kits),
					status: 'CHECKED_OUT',
					...handoverOnCheckout(lent, role.borrower, userId)
				}
			});
		}

		await prisma.assetTransaction.create({
			data: {
				assetId: asset.id,
				userId,
				productionId: input.targetId,
				action: 'CHECKED_OUT',
				data: {
					type: 'CHECKED_OUT',
					productionId: production.id,
					productionName: production.name,
					...(addedByLender.has(asset.id) ? { addedByLender: true } : {})
				}
			}
		});
	}

	mergeAffected(affected, { productionIds: [production.id] });

	return {
		result: { count: assets.length, targetName: production.name, swaps, kitSwaps },
		affected
	};
}

/**
 * Takes checked-out units back to booked (APPROVED) without them having been
 * anywhere: the undo of a tick on the handout list, for a unit ticked by
 * mistake or put back before the truck left. Accessories come along, as they
 * went out along. A lent unit's handover starts over, so its receipt columns
 * are cleared.
 */
export async function undoCheckout(
	userId: string,
	productionId: string,
	assetIds: string[]
): Promise<{ result: { count: number }; affected: AffectedRecords }> {
	const [orgIds, systemAdmin] = await Promise.all([writableOrgIds(userId), isSystemAdmin(userId)]);
	const ids = await withAccessories(assetIds);
	const production = await prisma.production.findUniqueOrThrow({
		where: { id: productionId },
		select: { id: true, name: true }
	});
	const items = await prisma.productionItem.findMany({
		where: { productionId, assetId: { in: ids }, status: 'CHECKED_OUT' },
		select: { id: true, assetId: true, asset: { select: { organizationId: true } } }
	});
	for (const item of items) {
		if (!systemAdmin && !orgIds.includes(item.asset.organizationId)) {
			throw new CheckoutError('forbidden', 'No access to one or more assets');
		}
	}
	if (items.length > 0) {
		const data: CheckoutUndoneData = {
			type: 'CHECKOUT_UNDONE',
			productionId: production.id,
			productionName: production.name
		};
		await prisma.$transaction([
			prisma.productionItem.updateMany({
				where: { id: { in: items.map((i) => i.id) } },
				data: {
					status: 'APPROVED',
					// Not going after all, so in no case either.
					packedInItemId: null,
					receivedAt: null,
					receivedById: null,
					returnReportedAt: null,
					returnReportedById: null
				}
			}),
			prisma.assetTransaction.createMany({
				data: items.map((i) => ({
					assetId: i.assetId,
					userId,
					productionId,
					action: 'CHECKOUT_UNDONE',
					data
				}))
			})
		]);
	}
	return {
		result: { count: items.length },
		affected: {
			assetIds: items.map((i) => i.assetId),
			organizationIds: [...new Set(items.map((i) => i.asset.organizationId))],
			bundleIds: [],
			productionIds: [productionId]
		}
	};
}
