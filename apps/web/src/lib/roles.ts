/**
 * The org roles, as a ladder rather than a set: every rung can do everything
 * the rungs below it can. Ranking them in one place is what lets a single
 * helper answer every authorisation question — see `requireOrgRole` in
 * `server/services/access.ts` — so a new command can't quietly invent a fifth
 * rule, and the UI can ask the same question the server will ask.
 *
 * This module is the contract; the wording that explains each rung to a human
 * lives in `role-descriptions.svelte.ts`, the way error codes and their
 * messages are split (see `errors.ts` / `error-messages.svelte.ts`).
 */
export type OrgRole = 'DEVICE_VIEWER' | 'VIEWER' | 'MEMBER' | 'ADMIN' | 'OWNER';

export const ORG_ROLES = ['DEVICE_VIEWER', 'VIEWER', 'MEMBER', 'ADMIN', 'OWNER'] as const;

const ROLE_RANK: Record<OrgRole, number> = {
	DEVICE_VIEWER: 0,
	VIEWER: 1,
	MEMBER: 2,
	ADMIN: 3,
	OWNER: 4
};

/** The rung a new membership or invitation starts on unless someone picks another. */
export const DEFAULT_ORG_ROLE: OrgRole = 'DEVICE_VIEWER';

export function roleAtLeast(role: OrgRole, min: OrgRole): boolean {
	return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** Position on the ladder, for sorting — higher has more say. */
export function roleRank(role: OrgRole): number {
	return ROLE_RANK[role];
}

/** Every rung that clears `min`, for a `role: { in: … }` filter. */
export function rolesAtLeast(min: OrgRole): OrgRole[] {
	return ORG_ROLES.filter((role) => roleAtLeast(role, min));
}

/**
 * What each rung is for, named after the work rather than the rank:
 *
 * - DEVICE_VIEWER — the equipment and nothing else: devices, bundles, locations,
 *             inspections. No productions, customers or prices — except a
 *             production they are crew on, which they may open. This is the
 *             rung for people who help out but have no business seeing the
 *             business: which customer, which gig, at what price.
 * - VIEWER  — reads everything but billing. Nothing they do changes a record.
 * - MEMBER  — the warehouse floor: scan, check out and back in, plan productions.
 * - ADMIN   — the inventory itself: register and retire units, prices,
 *             inspections, approving another org's loan request, offers and invoices.
 * - OWNER   — the organization: members, roles, settings, category rates.
 */
export const ROLE_FOR = {
	/** Belongs to the org at all: sees its equipment. */
	equipment: 'DEVICE_VIEWER',
	/** Productions, customers, prices — the business, as opposed to the equipment. */
	read: 'VIEWER',
	/** Anything that writes at all — the line VIEWER does not cross. */
	write: 'MEMBER',
	inventory: 'ADMIN',
	organization: 'OWNER'
} as const satisfies Record<string, OrgRole>;

/**
 * Maintains the inventory: registering equipment, approving another org's loan
 * request, prices. The creation forms filter their org pickers with this, so an
 * org that will reject the form is never offered in it.
 */
export function canManageInventory(membership: { role: OrgRole }): boolean {
	return roleAtLeast(membership.role, ROLE_FOR.inventory);
}

/** Whether a role may change anything at all — the one thing VIEWER may not. */
export function canWrite(membership: { role: OrgRole }): boolean {
	return roleAtLeast(membership.role, ROLE_FOR.write);
}
