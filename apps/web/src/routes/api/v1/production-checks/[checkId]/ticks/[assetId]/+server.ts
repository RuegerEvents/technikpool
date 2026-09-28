import type { RequestHandler } from './$types';
import { handleApi, requireApiUser } from '$lib/server/api';
import { withCheckErrors } from '$lib/server/production-check-api';
import { untickCheckItem } from '$lib/server/services/production-check';

export const DELETE: RequestHandler = ({ locals, params }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		return withCheckErrors(async () => {
			await untickCheckItem(user.id, params.checkId, params.assetId);
			return new Response(null, { status: 204 });
		});
	});
