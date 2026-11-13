import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { jsonBody, requireString } from '#lib/server/stocktake-api.js';
import { handoutMode, withHandoutErrors } from '#lib/server/production-handout-api.js';
import { scanIntoHandout } from '#lib/server/services/production-handout.js';
import { toScanResult } from '#lib/server/services/api-mappers.js';

export const POST: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const mode = handoutMode(params.mode);
		const body = await jsonBody(request);
		const code = requireString(body, 'code').trim();
		// The case open on the device, handing out — see HandoutScanRequest.
		const packInto =
			mode === 'checkout' && typeof body.packInto === 'string' && body.packInto
				? body.packInto
				: null;
		return withHandoutErrors(async () => {
			const { result } = await scanIntoHandout(user.id, params.productionId, mode, code, {
				packInto
			});
			return apiJson('ScanResult', toScanResult(result));
		});
	});
