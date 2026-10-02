import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { handoutMode, withHandoutErrors } from '#lib/server/production-handout-api.js';
import { getHandout } from '#lib/server/services/production-handout.js';
import { toProductionHandout } from '#lib/server/services/api-mappers.js';

export const GET: RequestHandler = ({ locals, params, url }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const mode = handoutMode(params.mode);
		return withHandoutErrors(async () =>
			apiJson(
				'ProductionHandout',
				toProductionHandout(
					await getHandout(
						user.id,
						params.productionId,
						mode,
						url.searchParams.get('organizationId') ?? undefined
					)
				)
			)
		);
	});
