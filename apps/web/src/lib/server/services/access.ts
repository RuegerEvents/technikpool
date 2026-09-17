import { getRequestEvent } from '$app/server';
import { prisma } from '$lib/server/auth';
import { appError, type AppErrorCode } from '$lib/errors';
import { ROLE_FOR, roleAtLeast, rolesAtLeast, type OrgRole } from '$lib/roles';

// Authorisation primitives shared by the remote functions and the /api/v1
// endpoints. Both surfaces must scope reads identically — the API is not
// allowed to see more than the web UI does — so they resolve org access
// through exactly these helpers.

export async function requireAuth() {
	const event = await getRequestEvent();
	if (!event?.locals.user) {
		appError(403, 'unauthorized');
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
 * System admin (User.isAdmin) is a deliberately separate permission from being
 * ADMIN/OWNER of an org — anyone can create an org and own it, so "admin of
 * some org" grants nothing beyond that org's own data. Global, shared state
 * (manufacturers, categories) gates on this instead.
 */
export async function requireSystemAdmin() {
	const user = await requireAuth();
	if (!(await isSystemAdmin(user.id))) {
		appError(403, 'admin_required');
	}
	return user;
}

/**
 * The role a user holds in an org, or null if they hold none. System admin is
 * deliberately not folded in here — a caller that needs the bypass gets it from
 * `requireOrgRole`, and a caller that wants the literal membership (the member
 * list, an audit entry) wants the truth.
 */
export async function orgRole(userId: string, organizationId: string): Promise<OrgRole | null> {
	const membership = await prisma.orgMembership.findUnique({
		where: { userId_organizationId: { userId, organizationId } },
		select: { role: true }
	});
	return membership?.role ?? null;
}

/**
 * The one gate every org-scoped mutation goes through.
 *
 * `min` is the lowest rung that may do the thing (see `ROLE_FOR`), and a system
 * admin passes every one of them: `user.isAdmin` is granted by hand to people
 * who run the whole instance, and a check it did not clear was, every time so
 * far, an oversight rather than a decision. That bypass lives *here and
 * nowhere else* — it used to be copied into some checks and forgotten in nine
 * others, which is exactly the kind of difference nobody notices until an
 * admin is locked out of one page and not another.
 */
export async function requireOrgRole(
	organizationId: string,
	min: OrgRole,
	code: AppErrorCode = 'unauthorized'
) {
	const user = await requireAuth();
	if (await isSystemAdmin(user.id)) return user;

	const role = await orgRole(user.id, organizationId);
	if (!role) appError(403, 'not_org_member');
	if (!roleAtLeast(role, min)) appError(403, code);
	return user;
}

/** Belongs to the org at all. Reads only — a VIEWER clears this and nothing above it. */
export function requireOrgRead(organizationId: string, code?: AppErrorCode) {
	return requireOrgRole(organizationId, ROLE_FOR.read, code);
}

/** Changes anything at all: scanning, check-out, planning a production. Not a VIEWER. */
export function requireOrgWrite(organizationId: string, code?: AppErrorCode) {
	return requireOrgRole(organizationId, ROLE_FOR.write, code);
}

/** Maintains the inventory: units, prices, inspections, approvals, billing documents. */
export function requireOrgInventory(organizationId: string, code?: AppErrorCode) {
	return requireOrgRole(organizationId, ROLE_FOR.inventory, code);
}

/** Runs the organization: members, roles, settings, category rates. */
export function requireOrgOwner(
	organizationId: string,
	code: AppErrorCode = 'org_manage_forbidden'
) {
	return requireOrgRole(organizationId, ROLE_FOR.organization, code);
}

/** The ids of orgs the user can manage (ADMIN or OWNER role). */
export async function managedOrgIds(userId: string) {
	return orgIdsAtLeast(userId, ROLE_FOR.inventory);
}

/**
 * The orgs a user may change anything in — `userOrgIds` minus the ones they
 * only read. `checkout.ts` scopes with this rather than with a `requireOrg…`
 * guard because it is framework-agnostic and reports failures its own way.
 */
export async function writableOrgIds(userId: string) {
	return orgIdsAtLeast(userId, ROLE_FOR.write);
}

async function orgIdsAtLeast(userId: string, min: OrgRole) {
	const memberships = await prisma.orgMembership.findMany({
		where: { userId, role: { in: rolesAtLeast(min) } },
		select: { organizationId: true }
	});
	return memberships.map((m) => m.organizationId);
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
	appError(403, 'unauthorized');
}
