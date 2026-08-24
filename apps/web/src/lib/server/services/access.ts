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
