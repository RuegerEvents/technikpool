import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { assetDetail } from '#lib/server/asset-detail-api.js';

export const GET: RequestHandler = ({ locals, params }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		return apiJson('AssetDetail', await assetDetail(user.id, params.assetId));
	});
