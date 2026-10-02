import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '$lib/server/api';
import { handoutMode, withHandoutErrors } from '$lib/server/production-handout-api';
import { getHandout } from '$lib/server/services/production-handout';
import { toProductionHandout } from '$lib/server/services/api-mappers';

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
