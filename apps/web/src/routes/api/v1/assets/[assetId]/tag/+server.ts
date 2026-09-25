import type { RequestHandler } from './$types';
import { apiError, apiJson, handleApi, requireApiUser, type Schemas } from '$lib/server/api';
import { ApiResponse } from '$lib/server/api';
import { toAsset } from '$lib/server/services/api-mappers';
import {
	ASSET_TAG_ERROR_STATUS,
	AssetTagError,
	assignAssetTag
} from '$lib/server/services/asset-tags';

export const PUT: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const body = (await request.json().catch(() => null)) as Partial<
			Schemas['AssetTagRequest']
		> | null;
		const assetTag = typeof body?.assetTag === 'string' ? body.assetTag.trim() : '';
		if (!assetTag) {
			throw new ApiResponse(apiError(400, 'invalid_request', 'assetTag is required.'));
		}
		try {
			const asset = await assignAssetTag(user.id, { assetId: params.assetId, assetTag });
			return apiJson('Asset', toAsset(asset));
		} catch (err) {
			if (err instanceof AssetTagError) {
				return apiError(ASSET_TAG_ERROR_STATUS[err.code], err.code, err.message);
			}
			throw err;
		}
	});
