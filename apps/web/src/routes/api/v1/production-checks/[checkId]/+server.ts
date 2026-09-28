import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '$lib/server/api';
import { withCheckErrors } from '$lib/server/production-check-api';
import { getProductionCheck } from '$lib/server/services/production-check';
import { toProductionCheck } from '$lib/server/services/api-mappers';

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
