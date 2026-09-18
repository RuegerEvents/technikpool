import type { LayoutServerLoad } from './$types';
import { prisma } from '$lib/server/auth';
import { ROLE_FOR, rolesAtLeast } from '$lib/roles';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	let isAdmin = false;
	let canBill = false;
	if (locals.user?.id) {
		const dbUser = await prisma.user.findUnique({
			where: { id: locals.user.id },
			select: { isAdmin: true }
		});
		isAdmin = dbUser?.isAdmin ?? false;
		// Offers and invoices are read by the rung that writes them, so the nav
		// only offers them to someone who will find anything there.
		canBill =
			isAdmin ||
			(await prisma.orgMembership.count({
				where: { userId: locals.user.id, role: { in: rolesAtLeast(ROLE_FOR.inventory) } }
			})) > 0;
	}
	return {
		user: locals.user,
		session: locals.session,
		isAdmin,
		canBill,
		locale: cookies.get('locale') ?? 'de'
	};
};
