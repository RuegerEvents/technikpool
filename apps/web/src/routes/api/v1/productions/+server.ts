import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/auth';
import { handleApi, requireApiUser } from '$lib/server/api';
import { isSystemAdmin, userOrgIds } from '$lib/server/services/access';
import { toProduction } from '$lib/server/services/api-mappers';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = ({ locals }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const admin = await isSystemAdmin(user.id);
		const orgIds = await userOrgIds(user.id);

		const productions = await prisma.production.findMany({
			where: admin ? {} : { organizationId: { in: orgIds } },
			include: { organization: true },
			orderBy: [{ startDate: 'desc' }, { name: 'asc' }]
		});

		return json(productions.map(toProduction));
	});
