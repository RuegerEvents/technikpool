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

async function isUserAdmin(userId: string) {
	const u = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
	return u?.isAdmin ?? false;
}

async function requireOrgManageAccess(orgId: string) {
	const user = await requireAuth();
	if (await isUserAdmin(user.id)) return user;
	const membership = await prisma.orgMembership.findUnique({
		where: { userId_organizationId: { userId: user.id, organizationId: orgId } }
	});
	if (membership?.role !== 'OWNER') {
		throw new Error('Only org owners or system admins can manage this organization');
	}
	return user;
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

export const getOrgWithMembers = query(v.string(), async (orgId: string) => {
	const user = await requireAuth();
	const admin = await isUserAdmin(user.id);
	if (!admin) {
		const m = await prisma.orgMembership.findUnique({
			where: { userId_organizationId: { userId: user.id, organizationId: orgId } }
		});
		if (!m) throw new Error('Not a member of this organization');
	}
	return prisma.organization.findUniqueOrThrow({
		where: { id: orgId },
		include: {
			members: {
				include: {
					user: { select: { id: true, name: true, email: true, isAdmin: true } }
				},
				orderBy: { role: 'asc' }
			}
		}
	});
});

const roleSchema = v.picklist(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);

export const addUserToOrg = command(
	v.object({ orgId: v.string(), email: v.string(), role: roleSchema }),
	async ({ orgId, email, role }) => {
		await requireOrgManageAccess(orgId);
		const target = await prisma.user.findUnique({ where: { email } });
		if (!target) throw new Error('No user found with that email');
		await prisma.orgMembership.upsert({
			where: { userId_organizationId: { userId: target.id, organizationId: orgId } },
			create: { userId: target.id, organizationId: orgId, role },
			update: { role }
		});
		getOrgWithMembers(orgId).refresh();
	}
);

export const removeUserFromOrg = command(
	v.object({ orgId: v.string(), userId: v.string() }),
	async ({ orgId, userId }) => {
		const current = await requireOrgManageAccess(orgId);
		if (userId === current.id) throw new Error('Cannot remove yourself from the organization');
		await prisma.orgMembership.delete({
			where: { userId_organizationId: { userId, organizationId: orgId } }
		});
		getOrgWithMembers(orgId).refresh();
	}
);

export const updateMemberRole = command(
	v.object({ orgId: v.string(), userId: v.string(), role: roleSchema }),
	async ({ orgId, userId, role }) => {
		await requireOrgManageAccess(orgId);
		await prisma.orgMembership.update({
			where: { userId_organizationId: { userId, organizationId: orgId } },
			data: { role }
		});
		getOrgWithMembers(orgId).refresh();
	}
);

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

// ── Admin-only ────────────────────────────────────────────────────────────────

export const getAllOrgs = query(async () => {
	const user = await requireAuth();
	if (!(await isUserAdmin(user.id))) throw new Error('Admin access required');

	const orgs = await prisma.organization.findMany({
		include: {
			members: {
				where: { userId: user.id },
				select: { role: true }
			},
			_count: { select: { members: true } }
		},
		orderBy: { name: 'asc' }
	});

	return orgs.map(({ members, _count, ...org }) => ({
		...org,
		role: (members[0]?.role ?? null) as 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' | null,
		memberCount: _count.members
	}));
});

export const getAllUsers = query(async () => {
	const user = await requireAuth();
	if (!(await isUserAdmin(user.id))) throw new Error('Admin access required');
	return prisma.user.findMany({
		select: { id: true, name: true, email: true, isAdmin: true, createdAt: true },
		orderBy: { createdAt: 'desc' }
	});
});

export const setUserAdmin = command(
	v.object({ userId: v.string(), isAdmin: v.boolean() }),
	async ({ userId, isAdmin }) => {
		const current = await requireAuth();
		if (!(await isUserAdmin(current.id))) throw new Error('Admin access required');
		if (userId === current.id) throw new Error('Cannot change your own admin status');
		await prisma.user.update({ where: { id: userId }, data: { isAdmin } });
		getAllUsers().refresh();
	}
);
