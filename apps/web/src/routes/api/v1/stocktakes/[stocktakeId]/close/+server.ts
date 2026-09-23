import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '$lib/server/api';
import { withStocktakeErrors } from '$lib/server/stocktake-api';
import { closeStocktake, getStocktakeSummary } from '$lib/server/services/stocktake';
import { toStocktakeSummary } from '$lib/server/services/api-mappers';

export const POST: RequestHandler = ({ locals, params }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		return withStocktakeErrors(async () => {
			await closeStocktake(user.id, params.stocktakeId);
			const summary = await getStocktakeSummary(user.id, params.stocktakeId);
			return apiJson('StocktakeSummary', toStocktakeSummary(summary));
		});
	});
