import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '$lib/server/api';
import { jsonBody } from '$lib/server/stocktake-api';
import { lineCount } from '$lib/server/production-handout-api';
import { withCheckErrors } from '$lib/server/production-check-api';
import { setCheckLineCount } from '$lib/server/services/production-check';

export const PUT: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const { key, count } = lineCount(await jsonBody(request));
		return withCheckErrors(async () => {
			const { done } = await setCheckLineCount(user.id, params.checkId, key, count);
			return apiJson('ProductionListLineResult', { done });
		});
	});
