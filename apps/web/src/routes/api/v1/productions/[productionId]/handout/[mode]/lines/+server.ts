import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '$lib/server/api';
import { jsonBody } from '$lib/server/stocktake-api';
import { handoutMode, lineCount, withHandoutErrors } from '$lib/server/production-handout-api';
import { setHandoutLineCount } from '$lib/server/services/production-handout';

export const PUT: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const mode = handoutMode(params.mode);
		const { key, count } = lineCount(await jsonBody(request));
		return withHandoutErrors(async () => {
			const { result } = await setHandoutLineCount(user.id, params.productionId, mode, key, count);
			return apiJson('ProductionListLineResult', { done: result.done });
		});
	});
