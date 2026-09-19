import { getRequestEvent } from '$app/server';
import type { Prisma } from '$lib/prisma/client';
import { prisma } from '$lib/server/auth';
import { appError, type AppErrorCode } from '$lib/errors';
import { ROLE_FOR, roleAtLeast, rolesAtLeast, type OrgRole } from '$lib/roles';
import { orgLabel } from '$lib/utils';

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

/**
 * Every org the user belongs to, at any rung — what the equipment is scoped
 * to. Productions, customers and prices are not: see `readableOrgIds` and
 * `productionReadWhere`.
 */
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
 * ADMIN/OWNER of an org: "admin of some org" grants nothing beyond that org's
 * own data. Global, shared state (manufacturers, categories, who gets an org
 * or an account at all) gates on this instead.
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

/**
 * Reads the org's business: productions, customers, prices. A VIEWER clears
 * this; a DEVICE_VIEWER, who sees the equipment only, does not. A production
 * goes through `requireProductionRead` instead, which also lets its crew in.
 */
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

/**
 * Whether a user may open a given production: a VIEWER or above of the org
 * that holds it, anyone of that org who is on its crew — which is how a
 * DEVICE_VIEWER gets to see the job they are working — or a system admin.
 * Resolved once and handed back as a predicate, so a list that mixes
 * productions of several orgs is masked row by row without a query per row.
 *
 * What a list does with a production this says no to is the caller's business,
 * but it must never *drop* it: a unit booked by someone else's production is
 * still booked, and leaving it out makes it look free. Name it with
 * `visibleProductionName` instead.
 */
export async function productionVisibility(userId: string) {
	const [readable, crewOn, admin] = await Promise.all([
		readableOrgIds(userId),
		crewProductionIds(userId),
		isSystemAdmin(userId)
	]);
	const orgs = new Set(readable);
	const crew = new Set(crewOn);
	return (production: ProductionRef) =>
		admin || orgs.has(production.organizationId) || crew.has(production.id);
}

type ProductionRef = { id: string; organizationId: string };

/**
 * The productions a user is crew on, in orgs they still belong to. Crew is only
 * picked from members, but a membership can end while the crew row stays — and
 * leaving the org is where access to its productions ends.
 */
async function crewProductionIds(userId: string) {
	const rows = await prisma.productionCrew.findMany({
		where: {
			userId,
			production: { organization: { members: { some: { userId } } } }
		},
		select: { productionId: true }
	});
	return rows.map((r) => r.productionId);
}

/** Throws unless the user may open this production — see `productionVisibility`. */
export async function requireProductionRead(production: ProductionRef) {
	const user = await requireAuth();
	const canSee = await productionVisibility(user.id);
	if (canSee(production)) return user;
	const role = await orgRole(user.id, production.organizationId);
	appError(403, role ? 'unauthorized' : 'not_org_member');
}

/**
 * The `where` that scopes a list of productions to the ones a user may open,
 * optionally narrowed to one org — the list counterpart of
 * `productionVisibility`. Like `scopedOrgIds`, a filter for an org the user
 * doesn't belong to is refused rather than ignored.
 */
export async function productionReadWhere(
	userId: string,
	organizationId?: string
): Promise<Prisma.ProductionWhereInput> {
	const memberOf = await scopedOrgIds(userId, organizationId);
	const [readable, admin] = await Promise.all([readableOrgIds(userId), isSystemAdmin(userId)]);
	const readableSet = new Set(readable);
	const fullOrgIds = admin ? memberOf : memberOf.filter((id) => readableSet.has(id));
	const crewOrgIds = memberOf.filter((id) => !fullOrgIds.includes(id));
	return {
		OR: [
			{ organizationId: { in: fullOrgIds } },
			{ organizationId: { in: crewOrgIds }, crew: { some: { userId } } }
		]
	};
}

/**
 * Of these productions, the ones a user may open. For refreshing after a change
 * that reaches into a production the user may not read — returning a lent unit,
 * approving a loan request — where refreshing it would be refused, and fail a
 * command whose write has already gone through.
 */
export async function visibleProductionIds(userId: string, productionIds: string[]) {
	if (productionIds.length === 0) return [];
	const [canSee, productions] = await Promise.all([
		productionVisibility(userId),
		prisma.production.findMany({
			where: { id: { in: productionIds } },
			select: { id: true, organizationId: true }
		})
	]);
	return productions.filter(canSee).map((p) => p.id);
}

/**
 * A production's name, or — for someone who may not open it — the org that
 * holds it, which is all they get to know about it.
 */
export function visibleProductionName(
	production: {
		id: string;
		name: string;
		organizationId: string;
		organization: { name: string; shortName: string | null };
	},
	canSee: (production: ProductionRef) => boolean
) {
	return canSee(production) ? production.name : orgLabel(production.organization);
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

/**
 * The orgs whose business a user may read — productions, customers, prices —
 * which is `userOrgIds` minus the ones they only see the equipment of.
 */
export async function readableOrgIds(userId: string) {
	return orgIdsAtLeast(userId, ROLE_FOR.read);
}

/**
 * Whether a user reads this org's business — `readableOrgIds` for one org,
 * with the system admin's bypass. For a read of the equipment that carries a
 * price along, which is left out rather than refused.
 */
export async function readsOrgRecords(userId: string, organizationId: string) {
	if (await isSystemAdmin(userId)) return true;
	const role = await orgRole(userId, organizationId);
	return !!role && roleAtLeast(role, ROLE_FOR.read);
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
