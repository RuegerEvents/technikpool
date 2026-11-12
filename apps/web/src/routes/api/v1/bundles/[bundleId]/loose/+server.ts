import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser, type Schemas } from '#lib/server/api.js';
import { jsonBody, requireString } from '#lib/server/stocktake-api.js';
import { bundleResponse, positiveCount } from '#lib/server/bundle-api.js';
import { addLooseToBundle, searchLooseForBundle } from '#lib/server/services/bundles.js';
import { toLooseGroup } from '#lib/server/services/api-mappers.js';

export const GET: RequestHandler = ({ locals, params, url }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const groups = await searchLooseForBundle(
			user.id,
			params.bundleId,
			url.searchParams.get('q') ?? ''
		);
		return Response.json(groups.map(toLooseGroup) satisfies Schemas['LooseGroup'][]);
	});

export const POST: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const body = await jsonBody(request);
		const { count } = await addLooseToBundle(
			user.id,
			params.bundleId,
			{
				productId: requireString(body, 'productId'),
				locationId: requireString(body, 'locationId')
			},
			positiveCount(body.count)
		);
		return apiJson('LooseAddResult', {
			count,
			bundle: await bundleResponse(user.id, params.bundleId)
		});
	});
