import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { bundleResponse } from '#lib/server/bundle-api.js';

export const GET: RequestHandler = ({ locals, params }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		return apiJson('BundleDetail', await bundleResponse(user.id, params.bundleId));
	});
