import type { RequestHandler } from './$types';
import { apiError, apiJson, handleApi, requireApiUser } from '$lib/server/api';
import {
	jsonBody,
	requireString,
	stringList,
	withStocktakeErrors
} from '$lib/server/stocktake-api';
import { tickStocktakeItems } from '$lib/server/services/stocktake';

const VIA = ['manual', 'parent', 'bundle'] as const;

export const POST: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const body = await jsonBody(request);
		const locationId = requireString(body, 'locationId');
		const assetIds = stringList(body.assetIds);
		const via = VIA.find((v) => v === body.via);
		if (assetIds.length === 0 || !via) {
			return apiError(
				400,
				'invalid_request',
				'assetIds and via (manual|parent|bundle) are required.'
			);
		}
		return withStocktakeErrors(async () =>
			apiJson(
				'StocktakeTickResult',
				await tickStocktakeItems(user.id, params.stocktakeId, { assetIds, locationId, via })
			)
		);
	});
