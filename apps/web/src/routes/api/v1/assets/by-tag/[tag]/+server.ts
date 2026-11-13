import type { RequestHandler } from './$types';
import { apiError, apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { ApiResponse } from '#lib/server/api.js';
import { resolveScannedCode } from '#lib/server/services/asset-lookup.js';
import { assetDetail } from '#lib/server/asset-detail-api.js';

export const GET: RequestHandler = ({ locals, params }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);

		// An asset tag, or a serial number that picks out exactly one unit —
		// see `resolveScannedCode` for why the two are not treated alike.
		const match = await resolveScannedCode(user.id, params.tag);

		if (match.kind === 'ambiguous') {
			throw new ApiResponse(
				apiError(
					409,
					'serial_ambiguous',
					`Serial number "${params.tag}" is on more than one unit — scan the asset tag instead`
				)
			);
		}
		if (match.kind === 'not_found') {
			throw new ApiResponse(apiError(404, 'asset_not_found', `Tag "${params.tag}" not found`));
		}

		return apiJson('AssetDetail', await assetDetail(user.id, match.assetId));
	});
