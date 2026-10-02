import type { RequestHandler } from './$types';
import { prisma } from '#lib/server/auth.js';
import { handleApi, requireApiUser } from '#lib/server/api.js';
import { toCategory } from '#lib/server/services/api-mappers.js';

// Categories are global, not per-organization — a category is a kind of
// equipment, so there is nothing to scope to the caller's orgs here. The auth
// check stays because the taxonomy is still not public.
export const GET: RequestHandler = ({ locals }) =>
	handleApi(async () => {
		requireApiUser(locals);

		const categories = await prisma.category.findMany({
			orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
		});

		return Response.json(categories.map(toCategory));
	});
