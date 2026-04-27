import type { LayoutServerLoad } from './$types';
import { prisma } from '$lib/server/auth';

export const load: LayoutServerLoad = async ({ locals }) => {
	let isAdmin = false;
	if (locals.user?.id) {
		const dbUser = await prisma.user.findUnique({
			where: { id: locals.user.id },
			select: { isAdmin: true }
		});
		isAdmin = dbUser?.isAdmin ?? false;
	}
	return {
		user: locals.user,
		session: locals.session,
		isAdmin
	};
};
