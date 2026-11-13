import type { AppErrorCode } from '#lib/errors.js';

// A kit inside a kit: the PowerCon adapter set in the FOH case. One level
// deep, and the rules for it are here, free of Prisma, because the server
// enforces them and the web's picker offers only what passes.
//
// Booking keeps one id per item, `ProductionItem.sourceBundleId`: the kit the
// unit was booked *as*. A unit of the inner kit booked through the outer one
// carries the outer kit's id; the inner kit it sits in is still its own
// `Asset.bundleId`, with the outer one as that kit's `parentBundleId`. So a list
// can head it by both without a second column, and every booking made before
// kits could nest reads exactly as it did.

/** What the guards need to know of a kit. */
export type NestingKit = {
	id: string;
	organizationId: string;
	/** The kit it sits inside, if any. */
	parentBundleId: string | null;
	/** How many kits sit inside it. */
	childCount: number;
};

/**
 * Why `inner` may not go inside `outer`, or null when it may. Moving it out of
 * a third kit is a question for the caller (`bundle_in_other_bundle`), not a
 * refusal: it is the same move a unit makes between kits.
 */
export function nestingRefusal(
	outer: NestingKit,
	inner: NestingKit
): { code: AppErrorCode; params?: string[] } | null {
	if (outer.id === inner.id) return { code: 'bundle_nest_self' };
	if (outer.organizationId !== inner.organizationId) return { code: 'bundle_nest_org_mismatch' };
	// One level deep, both ways: the outer kit may not itself be inside one,
	// and the inner kit may not have kits of its own.
	if (outer.parentBundleId !== null) return { code: 'bundle_nest_outer_nested' };
	if (inner.childCount > 0) return { code: 'bundle_nest_inner_has_kits' };
	return null;
}

/** The kit a unit is in, as far as nesting goes. */
type KitMember = {
	bundleId: string | null;
	bundle?: { parentBundleId: string | null } | null;
};

/** Whether the unit is in `kitId` — directly, or in a kit inside it. */
export function inKit(asset: KitMember, kitId: string) {
	return asset.bundleId === kitId || asset.bundle?.parentBundleId === kitId;
}

/**
 * Whether a booked unit is still in the kit it was booked as. A unit put into
 * another kit since is a line of its own again, on the production's page and on
 * the bill.
 */
export function inBookedKit(item: { sourceBundleId: string | null; asset: KitMember }) {
	return item.sourceBundleId !== null && inKit(item.asset, item.sourceBundleId);
}

/**
 * The kit a unit going out joins the booking of, among the `booked` kits: the
 * outer one first, since booking that is what brought the inner one along.
 */
export function bookedKitFor(asset: KitMember, booked: Set<string>) {
	const outer = asset.bundle?.parentBundleId ?? null;
	if (outer && booked.has(outer)) return outer;
	if (asset.bundleId && booked.has(asset.bundleId)) return asset.bundleId;
	return null;
}

/** Prisma's `AssetWhereInput` for every unit a kit carries, its inner kits' included. */
export function kitAssetsWhere(bundleId: string) {
	return { OR: [{ bundleId }, { bundle: { parentBundleId: bundleId } }] };
}
