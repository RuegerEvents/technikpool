import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '$lib/server/api';
import { jsonBody, requireString } from '$lib/server/stocktake-api';
import { withCheckErrors } from '$lib/server/production-check-api';
import { scanIntoCheck } from '$lib/server/services/production-check';

export const POST: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const code = requireString(await jsonBody(request), 'code');
		return withCheckErrors(async () => {
			const result = await scanIntoCheck(user.id, params.checkId, code);
			return apiJson('ProductionCheckScanResult', {
				result: result.result,
				assetTag: result.assetTag,
				productName: result.productName,
				ticked: result.ticked
			});
		});
	});
