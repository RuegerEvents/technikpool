import { bookedKitFor, inBookedKit } from '#lib/bundle-nesting.js';

// Swapping linked units: the 5→3 adapter of DMX ring 2 grabbed for ring 1, the
// power supply of node B packed with node A. Units stay fixed-linked (a unit in
// its kit, an accessory on its unit), but whoever packs takes the one at hand.
// So when a unit X of the same product and org as a linked unit Y is handed
// out or found in Y's case, the two change places: X takes Y's place, and Y
// takes X's old one (a counter-swap) — or, X having been loose, Y becomes loose.
//
// Only when handing out and in a case check (services/unit-swap.ts), never on
// take-back or in a stocktake. The rules are here, free of Prisma, so they can
// be tested on their own.

/** What the rules read of a unit. */
export type SwapUnit = {
	id: string;
	productId: string;
	organizationId: string;
	bundleId: string | null;
	parentAssetId: string | null;
	locationId: string;
	status: string;
	/** Its active accessories. A unit with any cannot itself become one. */
	accessoryCount: number;
};

/** Where a unit sits, as the three columns a swap writes. */
export type Placement = {
	bundleId: string | null;
	parentAssetId: string | null;
	locationId: string;
};

export type SwapRefusal =
	| 'same_unit'
	| 'other_product'
	| 'other_org'
	| 'not_interchangeable'
	| 'partner_not_linked'
	| 'same_place'
	| 'unavailable'
	| 'out'
	| 'partner_out'
	| 'nested'
	| 'booking_clash';

/** In a kit or on a unit — something a swap could take it out of. */
export function isLinked(unit: Pick<SwapUnit, 'bundleId' | 'parentAssetId'>) {
	return unit.bundleId !== null || unit.parentAssetId !== null;
}

/**
 * Why the scanned unit may not take the partner's place, or null when it may.
 * `scannedOut`/`partnerOut`: checked out somewhere right now. A partner that
 * is out has its place with it, wherever that is. Booking clashes are judged apart (`bookingClash`), since they need both units'
 * bookings.
 */
export function swapRefusal(
	scanned: SwapUnit,
	partner: SwapUnit,
	facts: { notInterchangeable: boolean; scannedOut: boolean; partnerOut: boolean }
): SwapRefusal | null {
	if (scanned.id === partner.id) return 'same_unit';
	if (scanned.productId !== partner.productId) return 'other_product';
	if (scanned.organizationId !== partner.organizationId) return 'other_org';
	if (facts.notInterchangeable) return 'not_interchangeable';
	// A loose booked unit is the stand-in rule's business, which moves nothing.
	if (!isLinked(partner)) return 'partner_not_linked';
	// Already where the partner is: in the same kit, or on the same unit.
	if (scanned.bundleId === partner.bundleId && scanned.parentAssetId === partner.parentAssetId) {
		return 'same_place';
	}
	// Fit to go in someone's case: not held back, and not broken or in
	// maintenance either, which a plain booking would still allow.
	if (scanned.status !== 'AVAILABLE') return 'unavailable';
	if (facts.scannedOut) return 'out';
	if (facts.partnerOut) return 'partner_out';
	// Accessories are one level deep: a unit with accessories of its own never
	// becomes one, and neither unit can take the place of its own parent.
	if (partner.parentAssetId === scanned.id || scanned.parentAssetId === partner.id) return 'nested';
	if (partner.parentAssetId !== null && scanned.accessoryCount > 0) return 'nested';
	if (scanned.parentAssetId !== null && partner.accessoryCount > 0) return 'nested';
	return null;
}

/**
 * Where each unit goes. The scanned one takes the partner's place, location
 * included; the partner takes the scanned one's old place, or becomes loose on
 * its own shelf when the scanned one was loose.
 */
export function swapPlacements(
	scanned: SwapUnit,
	partner: SwapUnit
): { scanned: Placement; partner: Placement } {
	return {
		scanned: {
			bundleId: partner.bundleId,
			parentAssetId: partner.parentAssetId,
			locationId: partner.locationId
		},
		partner: isLinked(scanned)
			? {
					bundleId: scanned.bundleId,
					parentAssetId: scanned.parentAssetId,
					locationId: scanned.locationId
				}
			: { bundleId: null, parentAssetId: null, locationId: partner.locationId }
	};
}

/**
 * Whether a unit going out looks for a linked place to take at all. Not when
 * its own kit is booked on the production (it joins that booking — see
 * `bookedKitFor`), nor an accessory whose parent is booked there or going out
 * in the same act: it travels with its parent.
 */
export function seeksSwap(
	unit: {
		bundleId: string | null;
		parentAssetId: string | null;
		bundle?: { parentBundleId: string | null } | null;
	},
	production: { bookedKits: Set<string>; bookedUnits: Set<string>; goingOut: string[] }
) {
	if (bookedKitFor(unit, production.bookedKits)) return false;
	const parent = unit.parentAssetId;
	if (parent && (production.bookedUnits.has(parent) || production.goingOut.includes(parent))) {
		return false;
	}
	return true;
}

/** A booking of one unit, as far as a swap cares. */
export type SwapBooking = {
	productionId: string;
	startDate: Date | null;
	endDate: Date | null;
};

/**
 * Whether a booked item belongs to the unit's place rather than to the unit:
 * booked as part of the kit it is still in, or as an accessory of the unit it
 * still hangs off. Those bookings follow the place in a swap; the rest stay
 * with the unit.
 */
export function bookedWithPlace(
	item: { sourceBundleId: string | null; sourceParentAssetId: string | null },
	unit: {
		bundleId: string | null;
		parentAssetId: string | null;
		bundle?: { parentBundleId: string | null } | null;
	}
) {
	if (item.sourceParentAssetId !== null && item.sourceParentAssetId === unit.parentAssetId) {
		return true;
	}
	return inBookedKit({ sourceBundleId: item.sourceBundleId, asset: unit });
}

/**
 * Whether a unit that keeps `kept` can also take on `incoming`: no production
 * twice, and no two whose dates overlap. A production without both dates
 * overlaps nothing, as everywhere else bookings are checked.
 */
export function bookingClash(kept: SwapBooking[], incoming: SwapBooking[]) {
	return kept.some((a) =>
		incoming.some(
			(b) =>
				a.productionId === b.productionId ||
				(a.startDate !== null &&
					a.endDate !== null &&
					b.startDate !== null &&
					b.endDate !== null &&
					a.startDate <= b.endDate &&
					b.startDate <= a.endDate)
		)
	);
}

/**
 * Each unit's bookings split into those that follow its place and those that
 * stay with it, then crossed: after the swap the scanned unit keeps its own and
 * takes on the partner's place-bound ones, and the other way round.
 */
export function swapBookingClash(
	scanned: { unit: Parameters<typeof bookedWithPlace>[1]; bookings: PlacedBooking[] },
	partner: { unit: Parameters<typeof bookedWithPlace>[1]; bookings: PlacedBooking[] }
) {
	const split = (side: typeof scanned) => ({
		moving: side.bookings.filter((b) => bookedWithPlace(b, side.unit)),
		kept: side.bookings.filter((b) => !bookedWithPlace(b, side.unit))
	});
	const s = split(scanned);
	const p = split(partner);
	return bookingClash(s.kept, p.moving) || bookingClash(p.kept, s.moving);
}

export type PlacedBooking = SwapBooking & {
	sourceBundleId: string | null;
	sourceParentAssetId: string | null;
};
