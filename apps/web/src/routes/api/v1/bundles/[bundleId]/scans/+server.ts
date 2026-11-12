import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { jsonBody, requireString } from '#lib/server/stocktake-api.js';
import { bundleResponse } from '#lib/server/bundle-api.js';
import { scanIntoBundle } from '#lib/server/services/bundles.js';

export const POST: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const body = await jsonBody(request);
		const scan = await scanIntoBundle(
			user.id,
			params.bundleId,
			requireString(body, 'code'),
			body.moveFromOtherBundle === true
		);
		return apiJson('BundleScanResult', {
			outcome: scan.outcome,
			assetId: 'assetId' in scan ? scan.assetId : null,
			otherBundle: scan.outcome === 'in_other_bundle' ? scan.otherBundle : null,
			bundle: await bundleResponse(user.id, params.bundleId)
		});
	});
