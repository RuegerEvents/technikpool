import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { withCheckErrors } from '#lib/server/production-check-api.js';
import { reportReturn } from '#lib/server/services/production-check.js';

export const POST: RequestHandler = ({ locals, params }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		return withCheckErrors(async () => {
			const { count } = await reportReturn(user.id, params.checkId);
			return apiJson('HandoverResult', { count });
		});
	});
