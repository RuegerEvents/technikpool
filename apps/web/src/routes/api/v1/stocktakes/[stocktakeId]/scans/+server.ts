import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { jsonBody, requireString, withStocktakeErrors } from '#lib/server/stocktake-api.js';
import { scanIntoStocktake } from '#lib/server/services/stocktake.js';
import { toStocktakeScanResult } from '#lib/server/services/api-mappers.js';

export const POST: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const body = await jsonBody(request);
		const code = requireString(body, 'code');
		const locationId = requireString(body, 'locationId');
		return withStocktakeErrors(async () => {
			const result = await scanIntoStocktake(user.id, params.stocktakeId, { code, locationId });
			// Only an open stocktake takes scans, so nothing on it is "missing" yet.
			return apiJson('StocktakeScanResult', toStocktakeScanResult(result, false, user.id));
		});
	});
