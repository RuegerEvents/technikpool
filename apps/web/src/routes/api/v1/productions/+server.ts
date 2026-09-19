import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/auth';
import { handleApi, requireApiUser } from '$lib/server/api';
import { isSystemAdmin, productionReadWhere } from '$lib/server/services/access';
import { toProduction } from '$lib/server/services/api-mappers';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = ({ locals }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const admin = await isSystemAdmin(user.id);
		const scope = admin ? {} : await productionReadWhere(user.id);

		const productions = await prisma.production.findMany({
			// Cancelled ones are left out: a scan to them is refused.
			where: { cancelledAt: null, ...scope },
			include: { organization: true },
			orderBy: [{ startDate: 'desc' }, { name: 'asc' }]
		});

		return json(productions.map(toProduction));
	});
