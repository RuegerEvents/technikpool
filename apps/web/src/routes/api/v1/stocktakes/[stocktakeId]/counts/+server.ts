import type { RequestHandler } from './$types';
import { apiError, handleApi, requireApiUser } from '$lib/server/api';
import { jsonBody, requireString, withStocktakeErrors } from '$lib/server/stocktake-api';
import { setStocktakeCount } from '$lib/server/services/stocktake';

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
		return withStocktakeErrors(async () => {
			await setStocktakeCount(user.id, params.stocktakeId, { productId, locationId, count });
			return new Response(null, { status: 204 });
		});
	});
