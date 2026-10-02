import type { RequestHandler } from './$types';
import { handleApi, requireApiUser } from '#lib/server/api.js';
import { withCheckErrors } from '#lib/server/production-check-api.js';
import { untickCheckItem } from '#lib/server/services/production-check.js';

export const DELETE: RequestHandler = ({ locals, params }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		return withCheckErrors(async () => {
			await untickCheckItem(user.id, params.checkId, params.assetId);
			return new Response(null, { status: 204 });
		});
	});
