import { prisma } from '#lib/server/auth.js';
import type { Prisma } from '#lib/prisma/client.js';
import { ACTIVE_ASSET_WHERE } from '#lib/asset-status.js';
import { isSystemAdmin, userOrgIds } from './access';

// Where an org's units may be kept. A location belongs to one org, but units
// of another may be stored there — a friend's garage, a partner's warehouse —
// so "our locations" is not the same as "where our things are".
//
// The trust is membership: anyone who belongs to the location's org at all
// (DEVICE_VIEWER is enough) may put their own org's units there. A location
// that already holds an org's units stays open to that org's other members,
// who need not belong to the friend's org to move the next case in beside it.
// Seeing those units stays with their own org; the friend sees nothing new.

/** Locations holding active units of these orgs, whoever owns the location. */
function holdingUnitsOf(orgIds: string[]): Prisma.LocationWhereInput {
	return { assets: { some: { organizationId: { in: orgIds }, ...ACTIVE_ASSET_WHERE } } };
}

/** The locations one org's units are kept at or may be counted at: its own, and any holding them. */
export function orgLocationWhere(organizationId: string): Prisma.LocationWhereInput {
	return { OR: [{ organizationId }, holdingUnitsOf([organizationId])] };
}

/** Every location a user can pick for a unit: their orgs', and any holding their orgs' units. */
export async function placeableLocationWhere(userId: string): Promise<Prisma.LocationWhereInput> {
	const orgIds = await userOrgIds(userId);
	return { OR: [{ organizationId: { in: orgIds } }, holdingUnitsOf(orgIds)] };
}

/** Whether this user may put a unit of `assetOrgId` at the location. */
export async function canPlaceAt(
	userId: string,
	location: { id: string; organizationId: string },
	assetOrgId: string
): Promise<boolean> {
	if (location.organizationId === assetOrgId) return true;
	if (await isSystemAdmin(userId)) return true;
	if ((await userOrgIds(userId)).includes(location.organizationId)) return true;
	const holding = await prisma.asset.findFirst({
		where: { locationId: location.id, organizationId: assetOrgId, ...ACTIVE_ASSET_WHERE },
		select: { id: true }
	});
	return holding !== null;
}
