import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/auth';
import { handleApi, requireApiUser } from '$lib/server/api';
import { isSystemAdmin, userOrgIds } from '$lib/server/services/access';
import { toLocation } from '$lib/server/services/api-mappers';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = ({ locals }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const admin = await isSystemAdmin(user.id);
		const orgIds = await userOrgIds(user.id);

		const locations = await prisma.location.findMany({
			where: admin ? {} : { organizationId: { in: orgIds } },
			include: { address: true, organization: true },
			orderBy: { name: 'asc' }
		});

		return json(locations.map(toLocation));
	});
