import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '$lib/server/api';
import { withStocktakeErrors } from '$lib/server/stocktake-api';
import { getStocktake } from '$lib/server/services/stocktake';
import { toStocktakeDetail } from '$lib/server/services/api-mappers';

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
