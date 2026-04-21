import { query, command, getRequestEvent } from '$app/server';
import { prisma } from '$lib/server/auth';
import * as v from 'valibot';

async function requireAuth() {
	const event = await getRequestEvent();
	if (!event?.locals.user) {
		throw new Error('Unauthorized');
	}
	return event.locals.user;
}

export const getMyOrgs = query(async () => {
	const user = await requireAuth();

	const memberships = await prisma.orgMembership.findMany({
		where: { userId: user.id },
		include: { organization: true }
	});

	return memberships.map((m) => ({
		...m.organization,
		role: m.role
	}));
});

export const getOrg = query(v.string(), async (orgId: string) => {
	const user = await requireAuth();

	const membership = await prisma.orgMembership.findUnique({
		where: {
			userId_organizationId: {
				userId: user.id,
				organizationId: orgId
			}
		},
		include: { organization: true }
	});

	if (!membership) {
		throw new Error('Not a member of this organization');
	}

	return membership.organization;
});

export const getOrgUsers = query(async () => {
	const user = await requireAuth();

	const memberships = await prisma.orgMembership.findMany({
		where: { userId: user.id },
		select: { organizationId: true }
	});
	const orgIds = memberships.map((m) => m.organizationId);

	const orgMembers = await prisma.orgMembership.findMany({
		where: { organizationId: { in: orgIds } },
		include: { user: { select: { id: true, name: true, email: true } } },
		distinct: ['userId']
	});

	return orgMembers.map((m) => m.user);
});

export const createOrg = command(v.string(), async (name: string) => {
	const user = await requireAuth();

	const org = await prisma.organization.create({
		data: {
			name,
			members: {
				create: {
					userId: user.id,
					role: 'OWNER'
				}
			}
		}
	});

	getMyOrgs().refresh();
	return org;
});
