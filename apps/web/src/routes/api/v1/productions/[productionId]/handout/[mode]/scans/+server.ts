import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { jsonBody, requireString } from '#lib/server/stocktake-api.js';
import { handoutMode, withHandoutErrors } from '#lib/server/production-handout-api.js';
import { scanIntoHandout } from '#lib/server/services/production-handout.js';

export const POST: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const mode = handoutMode(params.mode);
		const code = requireString(await jsonBody(request), 'code').trim();
		return withHandoutErrors(async () => {
			const { result } = await scanIntoHandout(user.id, params.productionId, mode, code);
			return apiJson('ScanResult', result);
		});
	});
