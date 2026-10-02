import type { RequestHandler } from './$types';
import { prisma } from '#lib/server/auth.js';
import { handleApi, requireApiUser } from '#lib/server/api.js';
import { isSystemAdmin, userOrgIds } from '#lib/server/services/access.js';
import { toLocation } from '#lib/server/services/api-mappers.js';

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

		return Response.json(locations.map(toLocation));
	});
