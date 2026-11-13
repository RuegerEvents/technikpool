import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { bundleResponse } from '#lib/server/bundle-api.js';
import { removeBundleFromBundle } from '#lib/server/services/bundles.js';

export const DELETE: RequestHandler = ({ locals, params }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		await removeBundleFromBundle(user.id, params.bundleId, params.innerBundleId);
		return apiJson('BundleDetail', await bundleResponse(user.id, params.bundleId));
	});
