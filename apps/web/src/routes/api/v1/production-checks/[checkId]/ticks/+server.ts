import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '$lib/server/api';
import { jsonBody, stringList } from '$lib/server/stocktake-api';
import { withCheckErrors } from '$lib/server/production-check-api';
import { tickCheckItems } from '$lib/server/services/production-check';

export const POST: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const assetIds = stringList((await jsonBody(request)).assetIds);
		return withCheckErrors(async () => {
			const { ticked } = await tickCheckItems(user.id, params.checkId, assetIds);
			return apiJson('ProductionCheckTickResult', { ticked });
		});
	});
