import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { jsonBody, stringList } from '#lib/server/stocktake-api.js';
import { withCheckErrors } from '#lib/server/production-check-api.js';
import { tickCheckItems } from '#lib/server/services/production-check.js';

export const POST: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const assetIds = stringList((await jsonBody(request)).assetIds);
		return withCheckErrors(async () => {
			const { ticked } = await tickCheckItems(user.id, params.checkId, assetIds);
			return apiJson('ProductionCheckTickResult', { ticked });
		});
	});
