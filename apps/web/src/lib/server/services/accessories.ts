import { prisma } from '$lib/server/auth';
import { ACTIVE_ASSET_WHERE } from '$lib/asset-status';

// An accessory is an Asset with `parentAssetId` set — a converter's power
// supply, a fixture's omega brackets, a stagebox's case. It stays a full asset
// because it is DGUV equipment in its own right; what follows the parent is
// only where it lives and what it is booked onto.
//
// This module holds the two operations both surfaces need: keeping an
// accessory's physical facts in step with its parent, and expanding a set of
// asset ids to include what travels with them. It lives beside checkout.ts for
// the same reason that does — the remote functions and /api/v1 must not each
// grow their own version.

/** The subset of a Prisma client the sync helper needs — the real one or a `$transaction` handle. */
type AssetWriter = { asset: { updateMany: typeof prisma.asset.updateMany } };

/**
 * Push a parent's physical facts down onto its accessories. An accessory is
 * wherever its parent is and in whatever kit its parent is in — those two
 * columns are the parent's to decide, so every write that moves a parent calls
 * this with the same values it just wrote.
 */
export async function syncAccessories(
	tx: AssetWriter,
	parentAssetId: string,
	data: { locationId?: string; bundleId?: string | null }
) {
	if (data.locationId === undefined && data.bundleId === undefined) return;
	await tx.asset.updateMany({ where: { parentAssetId }, data });
}

/**
 * Which active accessories hang off each of these assets. Booking, removing and
 * scanning all need the same expansion, and all of them need it as one query
 * rather than one per parent.
 */
export async function accessoryIdsOf(assetIds: string[]): Promise<Map<string, string[]>> {
	const byParent = new Map<string, string[]>();
	if (assetIds.length === 0) return byParent;

	const accessories = await prisma.asset.findMany({
		where: { parentAssetId: { in: assetIds }, ...ACTIVE_ASSET_WHERE },
		select: { id: true, parentAssetId: true }
	});
	for (const a of accessories) {
		const parentId = a.parentAssetId!;
		const list = byParent.get(parentId);
		if (list) list.push(a.id);
		else byParent.set(parentId, [a.id]);
	}
	return byParent;
}

/** The same expansion as a flat, deduped list: the assets plus everything attached to them. */
export async function withAccessories(assetIds: string[]): Promise<string[]> {
	const byParent = await accessoryIdsOf(assetIds);
	return [...new Set([...assetIds, ...[...byParent.values()].flat()])];
}
