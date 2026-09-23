import type { RequestHandler } from './$types';
import { apiError, handleApi, requireApiUser } from '$lib/server/api';
import { jsonBody, withStocktakeErrors } from '$lib/server/stocktake-api';
import { setStocktakeItemNote, untickStocktakeItem } from '$lib/server/services/stocktake';

export const DELETE: RequestHandler = ({ locals, params }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		return withStocktakeErrors(async () => {
			await untickStocktakeItem(user.id, params.stocktakeId, params.assetId);
			return new Response(null, { status: 204 });
		});
	});

export const PUT: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const body = await jsonBody(request);
		if (typeof body.needsAttention !== 'boolean') {
			return apiError(400, 'invalid_request', 'needsAttention is required.');
		}
		const needsAttention = body.needsAttention;
		return withStocktakeErrors(async () => {
			await setStocktakeItemNote(user.id, params.stocktakeId, {
				assetId: params.assetId,
				note: typeof body.note === 'string' ? body.note : null,
				needsAttention
			});
			return new Response(null, { status: 204 });
		});
	});
