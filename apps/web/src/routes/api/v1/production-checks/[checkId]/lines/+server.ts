import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { jsonBody } from '#lib/server/stocktake-api.js';
import { lineCount } from '#lib/server/production-handout-api.js';
import { withCheckErrors } from '#lib/server/production-check-api.js';
import { setCheckLineCount } from '#lib/server/services/production-check.js';

export const PUT: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const { key, count } = lineCount(await jsonBody(request));
		return withCheckErrors(async () => {
			const { done } = await setCheckLineCount(user.id, params.checkId, key, count);
			return apiJson('ProductionListLineResult', { done });
		});
	});
