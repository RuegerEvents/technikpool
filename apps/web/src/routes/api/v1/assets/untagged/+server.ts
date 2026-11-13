import type { RequestHandler } from './$types';
import { apiError, ApiResponse, handleApi, requireApiUser, type Schemas } from '#lib/server/api.js';
import { jsonBody, requireString } from '#lib/server/stocktake-api.js';
import { positiveCount } from '#lib/server/bundle-api.js';
import {
	ASSET_TAG_ERROR_STATUS,
	AssetTagError,
	registerUntaggedUnits
} from '#lib/server/services/asset-tags.js';
import { toAsset } from '#lib/server/services/api-mappers.js';

/** `UntaggedAssetsRequest.count`'s maximum in openapi.yaml — the web's cable batch allows as many. */
const MAX_COUNT = 200;

export const POST: RequestHandler = ({ locals, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const body = await jsonBody(request);
		const count = positiveCount(body.count);
		if (count > MAX_COUNT) {
			throw new ApiResponse(
				apiError(400, 'invalid_request', `count must be at most ${MAX_COUNT}.`)
			);
		}
		const input = {
			organizationId: requireString(body, 'organizationId').trim(),
			locationId: requireString(body, 'locationId').trim(),
			productId: requireString(body, 'productId').trim(),
			bundleId:
				typeof body.bundleId === 'string' && body.bundleId.trim() ? body.bundleId.trim() : null
		};
		try {
			const assets = await registerUntaggedUnits(user.id, input, count);
			return Response.json({ assets: assets.map(toAsset) } satisfies Schemas['AssetCreateResult'], {
				status: 201
			});
		} catch (err) {
			if (err instanceof AssetTagError) {
				return apiError(ASSET_TAG_ERROR_STATUS[err.code], err.code, err.message);
			}
			throw err;
		}
	});
