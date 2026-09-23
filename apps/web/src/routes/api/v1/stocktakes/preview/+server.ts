import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '$lib/server/api';
import {
	jsonBody,
	requireString,
	stringList,
	withStocktakeErrors
} from '$lib/server/stocktake-api';
import { previewStocktake } from '$lib/server/services/stocktake';

export const POST: RequestHandler = ({ locals, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const body = await jsonBody(request);
		const organizationId = requireString(body, 'organizationId');
		return withStocktakeErrors(async () =>
			apiJson(
				'StocktakePreview',
				await previewStocktake(user.id, {
					organizationId,
					scope: {
						locationIds: stringList(body.locationIds),
						categoryIds: stringList(body.categoryIds),
						productIds: []
					}
				})
			)
		);
	});
