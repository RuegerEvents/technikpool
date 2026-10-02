import type { RequestHandler } from './$types';
import { apiError, apiJson, ApiResponse, handleApi, requireApiUser } from '#lib/server/api.js';
import { jsonBody, stringList } from '#lib/server/stocktake-api.js';
import { handoutMode, withHandoutErrors } from '#lib/server/production-handout-api.js';
import { setHandoutDone } from '#lib/server/services/production-handout.js';

export const POST: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const mode = handoutMode(params.mode);
		const body = await jsonBody(request);
		if (typeof body.done !== 'boolean') {
			throw new ApiResponse(apiError(400, 'invalid_request', 'done is required.'));
		}
		const done = body.done;
		const assetIds = stringList(body.assetIds);
		return withHandoutErrors(async () => {
			const { result } = await setHandoutDone(user.id, params.productionId, mode, assetIds, done);
			return apiJson('HandoverResult', { count: result.count });
		});
	});
