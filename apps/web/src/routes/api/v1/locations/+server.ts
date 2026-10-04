import type { RequestHandler } from './$types';
import { prisma } from '#lib/server/auth.js';
import { handleApi, requireApiUser } from '#lib/server/api.js';
import { isSystemAdmin } from '#lib/server/services/access.js';
import { placeableLocationWhere } from '#lib/server/services/locations.js';
import { toLocation } from '#lib/server/services/api-mappers.js';

export const GET: RequestHandler = ({ locals }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const admin = await isSystemAdmin(user.id);

		const locations = await prisma.location.findMany({
			where: admin ? {} : await placeableLocationWhere(user.id),
			include: { address: true, organization: true },
			orderBy: { name: 'asc' }
		});

		return Response.json(locations.map(toLocation));
	});
