import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { withStocktakeErrors } from '#lib/server/stocktake-api.js';
import { closeStocktake, getStocktakeSummary } from '#lib/server/services/stocktake.js';
import { toStocktakeSummary } from '#lib/server/services/api-mappers.js';

export const POST: RequestHandler = ({ locals, params }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		return withStocktakeErrors(async () => {
			await closeStocktake(user.id, params.stocktakeId);
			const summary = await getStocktakeSummary(user.id, params.stocktakeId);
			return apiJson('StocktakeSummary', toStocktakeSummary(summary));
		});
	});
