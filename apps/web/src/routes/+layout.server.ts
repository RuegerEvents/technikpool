import type { LayoutServerLoad } from './$types';
import { prisma } from '$lib/server/auth';
import { orgLabel } from '$lib/utils';
import { ROLE_FOR, roleAtLeast, roleRank } from '$lib/roles';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	let isAdmin = false;
	let canBill = false;
	let canReadRecords = false;
	let hasOrg = false;
	let homeOrgId: string | null = null;
	let homeOrg: { id: string; name: string; color: string; avatarLabel: string } | null = null;
	if (locals.user?.id) {
		const [dbUser, memberships] = await Promise.all([
			prisma.user.findUnique({
				where: { id: locals.user.id },
				select: { isAdmin: true, homeOrgId: true }
			}),
			prisma.orgMembership.findMany({
				where: { userId: locals.user.id },
				select: { role: true, organizationId: true },
				orderBy: { createdAt: 'asc' }
			})
		]);
		isAdmin = dbUser?.isAdmin ?? false;
		// Everything but the profile is scoped to the orgs someone belongs to — a
		// system admin's reads included — so without one every list is empty.
		// `+layout.ts` keeps such an account on the dashboard, which explains that.
		hasOrg = memberships.length > 0;
		// Offers and invoices are read by the rung that writes them, so the nav
		// only offers them to someone who will find anything there.
		canBill = isAdmin || memberships.some((m) => roleAtLeast(m.role, ROLE_FOR.inventory));
		// Customers likewise: a DEVICE_VIEWER everywhere would only be refused.
		// Productions stay in the nav for them — the list holds the ones they
		// are crew on.
		canReadRecords = isAdmin || memberships.some((m) => roleAtLeast(m.role, ROLE_FOR.read));
		// The org a list starts on: the one set as home, while still a member of
		// it, else the one this user has the most say in — the oldest on a tie,
		// since the sort is stable and the memberships come oldest first.
		homeOrgId =
			memberships.find((m) => m.organizationId === dbUser?.homeOrgId)?.organizationId ??
			memberships.toSorted((a, b) => roleRank(b.role) - roleRank(a.role))[0]?.organizationId ??
			null;
		// The user menu names it, so it has to be read here rather than by a query.
		if (homeOrgId) {
			const org = await prisma.organization.findUniqueOrThrow({
				where: { id: homeOrgId },
				select: { id: true, name: true, shortName: true, color: true, avatarLabel: true }
			});
			homeOrg = { id: org.id, name: orgLabel(org), color: org.color, avatarLabel: org.avatarLabel };
		}
	}
	return {
		user: locals.user,
		session: locals.session,
		isAdmin,
		canBill,
		canReadRecords,
		homeOrgId,
		homeOrg,
		hasOrg,
		locale: cookies.get('locale') ?? 'de'
	};
};
