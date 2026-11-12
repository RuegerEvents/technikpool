import type { RequestHandler } from './$types';
import {
	apiError,
	apiJson,
	ApiResponse,
	handleApi,
	requireApiUser,
	type Schemas
} from '#lib/server/api.js';
import { jsonBody, requireString } from '#lib/server/stocktake-api.js';
import { positiveCount } from '#lib/server/bundle-api.js';
import { withHandoutErrors } from '#lib/server/production-handout-api.js';
import {
	handOutCandidates,
	searchHandoutCandidates
} from '#lib/server/services/production-handout.js';
import { toHandoutAddition } from '#lib/server/services/api-mappers.js';

// Only the hand-out list takes additions: nothing comes back that never went.
function requireCheckout(mode: string) {
	if (mode !== 'checkout') {
		throw new ApiResponse(apiError(404, 'not_found', 'Additions are on the checkout list only.'));
	}
}

export const GET: RequestHandler = ({ locals, params, url }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		requireCheckout(params.mode);
		return withHandoutErrors(async () => {
			const candidates = await searchHandoutCandidates(
				user.id,
				params.productionId,
				url.searchParams.get('q') ?? '',
				url.searchParams.get('organizationId') ?? undefined
			);
			return Response.json(
				candidates.map(toHandoutAddition) satisfies Schemas['HandoutAddition'][]
			);
		});
	});

export const POST: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		requireCheckout(params.mode);
		const body = await jsonBody(request);
		return withHandoutErrors(async () => {
			const { result } = await handOutCandidates(
				user.id,
				params.productionId,
				{
					productId: requireString(body, 'productId'),
					organizationId: requireString(body, 'ownerId'),
					locationId: requireString(body, 'locationId')
				},
				positiveCount(body.count),
				typeof body.organizationId === 'string' ? body.organizationId : undefined
			);
			return apiJson('CountResult', { count: result.count });
		});
	});
