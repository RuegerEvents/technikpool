import { getRequestEvent } from '$app/server';
import { prisma } from '$lib/server/auth';

// Authorisation primitives shared by the remote functions and the /api/v1
// endpoints. Both surfaces must scope reads identically — the API is not
// allowed to see more than the web UI does — so they resolve org access
// through exactly these helpers.

export async function requireAuth() {
	const event = await getRequestEvent();
	if (!event?.locals.user) {
		throw new Error('Unauthorized');
	}
	return event.locals.user;
}

export async function userOrgIds(userId: string) {
	const memberships = await prisma.orgMembership.findMany({
		where: { userId },
		select: { organizationId: true }
	});
	return memberships.map((m) => m.organizationId);
}

export async function isSystemAdmin(userId: string) {
	const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
	return user?.isAdmin ?? false;
}

/**
 * The organization ids a read should be scoped to, given an optional filter.
 *
 * Without a filter that is everything the user belongs to. With one, the user
 * has to belong to it — a filter narrows a query, it never widens it. Refusing
 * rather than silently falling back matters because these ids travel in query
 * strings and are trivially edited by hand.
 */
export async function scopedOrgIds(userId: string, organizationId?: string): Promise<string[]> {
	const orgIds = await userOrgIds(userId);
	if (!organizationId) return orgIds;
	if (orgIds.includes(organizationId)) return [organizationId];
	if (await isSystemAdmin(userId)) return [organizationId];
	throw new Error('Unauthorized');
}
