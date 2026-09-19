import type { LayoutServerLoad } from './$types';
import { prisma } from '$lib/server/auth';
import { ROLE_FOR, roleAtLeast } from '$lib/roles';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	let isAdmin = false;
	let canBill = false;
	let canReadRecords = false;
	let hasOrg = false;
	if (locals.user?.id) {
		const [dbUser, memberships] = await Promise.all([
			prisma.user.findUnique({
				where: { id: locals.user.id },
				select: { isAdmin: true }
			}),
			prisma.orgMembership.findMany({
				where: { userId: locals.user.id },
				select: { role: true }
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
	}
	return {
		user: locals.user,
		session: locals.session,
		isAdmin,
		canBill,
		canReadRecords,
		hasOrg,
		locale: cookies.get('locale') ?? 'de'
	};
};
