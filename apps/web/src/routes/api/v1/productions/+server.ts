import type { RequestHandler } from './$types';
import { handleApi, requireApiUser } from '#lib/server/api.js';
import { productionTargets } from '#lib/server/services/checkout.js';
import { toProduction } from '#lib/server/services/api-mappers.js';

export const GET: RequestHandler = ({ locals }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		// Cancelled ones are left out: a scan to them is refused.
		return Response.json((await productionTargets(user.id)).map(toProduction));
	});
