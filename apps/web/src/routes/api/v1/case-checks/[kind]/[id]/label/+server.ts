import type { RequestHandler } from './$types';
import { apiError, apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { withCaseCheckErrors } from '#lib/server/case-check-api.js';
import { caseLabelData } from '#lib/server/services/case-check.js';
import { caseLabelQuery, caseLabelResponse } from '#lib/server/case-label-request.js';

const KINDS = ['bundle', 'asset'] as const;

export const GET: RequestHandler = ({ locals, params, url }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const kind = KINDS.find((k) => k === params.kind);
		if (!kind) return apiError(400, 'invalid_request', 'kind must be bundle or asset');
		const query = caseLabelQuery(url);
		if (typeof query === 'string') return apiError(400, 'invalid_request', query);
		const includeCase = url.searchParams.get('includeCase') === 'true';

		return withCaseCheckErrors(async () => {
			const { hasCase, ...data } = await caseLabelData(
				user.id,
				{ kind, id: params.id },
				{ includeCase }
			);
			return apiJson('CaseLabel', await caseLabelResponse(data, query, hasCase));
		});
	});
