import type { RequestHandler } from './$types';
import { apiError, apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { withCaseCheckErrors } from '#lib/server/case-check-api.js';
import { jsonBody, stringList } from '#lib/server/stocktake-api.js';
import { recordCaseCheck } from '#lib/server/services/case-check.js';

const KINDS = ['bundle', 'asset'] as const;

export const POST: RequestHandler = ({ locals, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const body = await jsonBody(request);
		const kind = KINDS.find((k) => k === body.kind);
		const id = typeof body.id === 'string' ? body.id : '';
		if (!kind || !id || !Array.isArray(body.foundAssetIds)) {
			return apiError(
				400,
				'invalid_request',
				'kind (bundle|asset), id and foundAssetIds are required.'
			);
		}
		const foundAssetIds = stringList(body.foundAssetIds);
		return withCaseCheckErrors(async () =>
			apiJson('CaseCheckResult', await recordCaseCheck(user.id, { kind, id }, foundAssetIds))
		);
	});
