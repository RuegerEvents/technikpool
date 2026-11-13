import { inBookedKit } from '#lib/bundle-nesting.js';
import { naturalCompare } from '#lib/sort.js';

// A whole kit standing in for the booked one: ring 1 is booked, whoever packs
// grabs ring 2 and scans its number. The booking moves to ring 2 — both kits
// keep their contents, nothing is rebuilt — as if ring 2 had been booked. The
// unit-level counterpart is #lib/unit-swap.ts; the two hang off different
// stickers (a unit's tag, a kit's number) and never meet.
//
// Only when handing out (a kit's number on the handout list or in a session,
// or a bulk checkout that holds a whole kit), never on take-back, in a case
// check or in a stocktake. The rules are here, free of Prisma; the database
// half is services/kit-swap.ts.

/** A production's item, as far as a kit swap reads it. */
export type KitBookingItem = {
	id: string;
	assetId: string;
	status: string;
	sourceBundleId: string | null;
	sourceParentAssetId: string | null;
	packedInItemId: string | null;
	asset: { bundleId: string | null; bundle?: { parentBundleId: string | null } | null };
};

/** Bookings that hold nothing any more. */
const RELEASED_STATUSES = ['DECLINED', 'CANCELLED'];
/** Asked for, not yet given: no handout can stand in for those. */
const UNSETTLED_STATUSES = ['DRAFT', 'PENDING'];

/**
 * The kits the production has booked, each with the items of its booking. A
 * kit booked whole carries its inner kits' units as well, and an inner kit
 * booked through its outer one is booked too — with the units it holds. A unit
 * put into another kit since belongs to no kit's booking (`inBookedKit`).
 */
export function bookedKitItems(items: KitBookingItem[]): Map<string, KitBookingItem[]> {
	const kits = new Map<string, KitBookingItem[]>();
	const add = (kitId: string, item: KitBookingItem) =>
		kits.set(kitId, [...(kits.get(kitId) ?? []), item]);
	for (const item of items) {
		if (RELEASED_STATUSES.includes(item.status) || !inBookedKit(item)) continue;
		add(item.sourceBundleId!, item);
		// Booked through the outer kit, the unit's own inner kit is booked too.
		const own = item.asset.bundleId;
		if (own && own !== item.sourceBundleId) add(own, item);
	}
	return kits;
}

/** A booked kit that the scanned one might take the place of. */
export type BookedKit = {
	id: string;
	templateId: string;
	organizationId: string;
	/** Its number: its own tag, else its case's tag, else none. */
	number: string | null;
	items: Pick<KitBookingItem, 'status'>[];
};

/** What the decision reads of the scanned kit. */
export type ScannedKit = {
	id: string;
	templateId: string;
	organizationId: string;
	/** Any of its units has a booking on this production. */
	bookedHere: boolean;
	/** One of its units is out, or booked elsewhere for overlapping days. */
	unavailable: boolean;
};

export type KitSwapRefusal = 'started' | 'not_interchangeable' | 'unavailable';

export type KitSwapDecision =
	| { kind: 'none' }
	| { kind: 'replace'; kit: BookedKit }
	| { kind: 'refused'; reason: KitSwapRefusal; kit: BookedKit };

/** Something of the kit's booking has gone out already (or out and back). */
export function kitStarted(kit: Pick<BookedKit, 'items'>) {
	return kit.items.some((i) => i.status !== 'APPROVED');
}

/** By number, naturally — "Ring 2" before "Ring 10" — and kits without one last. */
export function compareKitNumbers(
	a: Pick<BookedKit, 'id' | 'number'>,
	b: Pick<BookedKit, 'id' | 'number'>
) {
	if (a.number !== null && b.number !== null) {
		return naturalCompare(a.number, b.number) || naturalCompare(a.id, b.id);
	}
	if (a.number !== null) return -1;
	if (b.number !== null) return 1;
	return naturalCompare(a.id, b.id);
}

/**
 * Whether the scanned kit takes the place of a booked one, and of which.
 *
 * - Not when it is booked here itself (it just goes out), nor when no kit of
 *   its type and org is booked (it goes on as an addition, as before).
 * - Of the booked kits of its type whose booking is settled, the lowest
 *   number that nothing has gone out of yet.
 * - Refused when every such kit is started (`started`: hand out unit by
 *   unit), when it holds a product marked not interchangeable, and when it is
 *   not wholly free — out somewhere, or booked elsewhere for the same days.
 *   A refusal names the kit it would have replaced.
 */
export function kitSwapDecision(scanned: ScannedKit, booked: BookedKit[]): KitSwapDecision {
	if (scanned.bookedHere) return { kind: 'none' };
	const candidates = booked
		.filter(
			(k) =>
				k.id !== scanned.id &&
				k.templateId === scanned.templateId &&
				k.organizationId === scanned.organizationId &&
				k.items.length > 0 &&
				!k.items.some((i) => UNSETTLED_STATUSES.includes(i.status))
		)
		.sort(compareKitNumbers);
	if (candidates.length === 0) return { kind: 'none' };
	const fresh = candidates.filter((k) => !kitStarted(k));
	if (fresh.length === 0) return { kind: 'refused', reason: 'started', kit: candidates[0] };
	const kit = fresh[0];
	// "Not interchangeable" is not asked here: it guards a pair inside a kit
	// (a camera and its calibrated lens), and a whole kit going instead of
	// another keeps every pair of it together.
	if (scanned.unavailable) return { kind: 'refused', reason: 'unavailable', kit };
	return { kind: 'replace', kit };
}

/** A unit of the scanned kit, for the booking it gets. */
export type KitSwapUnit = { id: string; parentAssetId: string | null; bookable: boolean };

/**
 * The booking move: the replaced kit's items go, and the scanned kit's units
 * are booked as booking it would — every bookable unit, its inner kits' and
 * its accessories included, under the scanned kit's own id. A unit held back
 * as unavailable stays behind, as it would there. The case the replaced kit
 * was packed into, if all of it was in one, takes the new one.
 */
export function kitSwapPlan(
	replaced: Pick<KitBookingItem, 'id' | 'assetId' | 'packedInItemId'>[],
	scanned: { id: string; units: KitSwapUnit[] }
) {
	const cases = new Set(replaced.map((i) => i.packedInItemId));
	const packedInItemId = cases.size === 1 ? [...cases][0] : null;
	return {
		removeItemIds: replaced.map((i) => i.id),
		releasedAssetIds: replaced.map((i) => i.assetId),
		create: scanned.units
			.filter((u) => u.bookable)
			.map((u) => ({
				assetId: u.id,
				sourceBundleId: scanned.id,
				sourceParentAssetId: u.parentAssetId,
				packedInItemId
			}))
	};
}

/**
 * The kits among a bulk selection that it holds whole: every top-level unit
 * of the kit that could go is picked. An inner kit whose outer kit is whole
 * is part of that one and not a kit of its own here.
 */
export function wholeKits(
	kits: { id: string; parentBundleId: string | null; unitIds: string[] }[],
	selected: Set<string>
) {
	const whole = kits.filter(
		(k) => k.unitIds.length > 0 && k.unitIds.every((id) => selected.has(id))
	);
	const ids = new Set(whole.map((k) => k.id));
	return whole.filter((k) => !k.parentBundleId || !ids.has(k.parentBundleId)).map((k) => k.id);
}
