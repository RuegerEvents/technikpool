import { ROLE_FOR, canManageInventory, roleAtLeast, type OrgRole } from '#lib/roles.js';

// Who sees which tab of the organization page, and who may change what in it.
// One place, so the tab bar never offers a tab whose page would turn the
// visitor away. The server checks every command again.

export type OrgAccess = {
	membership: { id: string; role: OrgRole; userId: string } | null;
	/** OWNER, or a system admin: members, settings, billing details, locations, deleting. */
	canManage: boolean;
	/** ADMIN+: asset tags, rental terms, cable colours, services, qualifications. */
	canInventory: boolean;
	/** VIEWER+: the equipment value is prices. */
	canSeeValue: boolean;
};

export function orgAccess(
	org: { members: { id: string; role: OrgRole; userId: string }[] } | undefined,
	userId: string | undefined,
	isAdmin: boolean
): OrgAccess {
	const membership = org?.members.find((m) => m.userId === userId) ?? null;
	const canManage = isAdmin || membership?.role === 'OWNER';
	return {
		membership,
		canManage,
		canInventory: canManage || (!!membership && canManageInventory(membership)),
		canSeeValue: isAdmin || (!!membership && roleAtLeast(membership.role, ROLE_FOR.read))
	};
}
