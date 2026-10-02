import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { withCheckErrors } from '#lib/server/production-check-api.js';
import { getProductionCheck } from '#lib/server/services/production-check.js';
import { toProductionCheck } from '#lib/server/services/api-mappers.js';

export const GET: RequestHandler = ({ locals, params }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		return withCheckErrors(async () =>
			apiJson(
				'ProductionCheck',
				toProductionCheck(await getProductionCheck(user.id, params.checkId))
			)
		);
	});
