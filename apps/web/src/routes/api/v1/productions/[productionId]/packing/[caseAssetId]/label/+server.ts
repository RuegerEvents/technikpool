import type { RequestHandler } from './$types';
import { apiError, apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { withHandoutErrors } from '#lib/server/production-handout-api.js';
import { packCaseLabelData } from '#lib/server/services/production-handout.js';
import { caseLabelQuery, caseLabelResponse } from '#lib/server/case-label-request.js';

// A pack case's label for one production — the case label's renderer with
// the production's contents. See `packCaseLabelData`.

export const GET: RequestHandler = ({ locals, params, url }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const query = caseLabelQuery(url);
		if (typeof query === 'string') return apiError(400, 'invalid_request', query);

		return withHandoutErrors(async () => {
			const data = await packCaseLabelData(user.id, params.productionId, params.caseAssetId);
			// The pack case is the label's own box and never among its contents.
			return apiJson('CaseLabel', await caseLabelResponse(data, query, false));
		});
	});
