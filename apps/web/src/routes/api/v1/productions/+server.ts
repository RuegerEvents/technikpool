import type { RequestHandler } from './$types';
import { handleApi, requireApiUser } from '$lib/server/api';
import { productionTargets } from '$lib/server/services/checkout';
import { toProduction } from '$lib/server/services/api-mappers';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = ({ locals }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		// Cancelled ones are left out: a scan to them is refused.
		return json((await productionTargets(user.id)).map(toProduction));
	});
