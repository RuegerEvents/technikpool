import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { withStocktakeErrors } from '#lib/server/stocktake-api.js';
import { getStocktake } from '#lib/server/services/stocktake.js';
import { toStocktakeDetail } from '#lib/server/services/api-mappers.js';

export const GET: RequestHandler = ({ locals, params }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		return withStocktakeErrors(async () =>
			apiJson(
				'StocktakeDetail',
				toStocktakeDetail(await getStocktake(user.id, params.stocktakeId), user.id)
			)
		);
	});
