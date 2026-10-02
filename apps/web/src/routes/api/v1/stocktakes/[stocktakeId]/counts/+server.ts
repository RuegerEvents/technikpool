import type { RequestHandler } from './$types';
import { apiError, handleApi, requireApiUser } from '#lib/server/api.js';
import { jsonBody, requireString, withStocktakeErrors } from '#lib/server/stocktake-api.js';
import { setStocktakeCount } from '#lib/server/services/stocktake.js';

export const PUT: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const body = await jsonBody(request);
		const productId = requireString(body, 'productId');
		const locationId = requireString(body, 'locationId');
		const count = body.count;
		if (typeof count !== 'number') {
			return apiError(400, 'invalid_request', 'count is required.');
		}
		const previous = body.previous;
		if (previous !== undefined && typeof previous !== 'number') {
			return apiError(400, 'invalid_request', 'previous is a number.');
		}
		return withStocktakeErrors(async () => {
			await setStocktakeCount(user.id, params.stocktakeId, {
				productId,
				locationId,
				count,
				previous
			});
			return new Response(null, { status: 204 });
		});
	});
