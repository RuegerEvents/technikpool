import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { apiJson, handleApi, requireApiUser } from '$lib/server/api';
import {
	jsonBody,
	requireString,
	stringList,
	withStocktakeErrors
} from '$lib/server/stocktake-api';
import {
	createStocktake,
	getStocktakeSummary,
	listStocktakes
} from '$lib/server/services/stocktake';
import { toStocktakeSummary } from '$lib/server/services/api-mappers';

export const GET: RequestHandler = ({ locals, url }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const status = url.searchParams.get('status');
		const stocktakes = await listStocktakes(user.id, {
			status: status === 'OPEN' || status === 'CLOSED' ? status : undefined
		});
		return json(stocktakes.map(toStocktakeSummary));
	});

export const POST: RequestHandler = ({ locals, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const body = await jsonBody(request);
		const organizationId = requireString(body, 'organizationId');
		return withStocktakeErrors(async () => {
			const created = await createStocktake(user.id, {
				organizationId,
				name: typeof body.name === 'string' ? body.name : null,
				scope: {
					locationIds: stringList(body.locationIds),
					categoryIds: stringList(body.categoryIds),
					productIds: []
				}
			});
			const summary = await getStocktakeSummary(user.id, created.id);
			return apiJson('StocktakeSummary', toStocktakeSummary(summary));
		});
	});
