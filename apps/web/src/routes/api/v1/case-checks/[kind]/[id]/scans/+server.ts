import type { RequestHandler } from './$types';
import { apiError, apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { withCaseCheckErrors } from '#lib/server/case-check-api.js';
import { jsonBody, requireString, stringList } from '#lib/server/stocktake-api.js';
import { scanIntoCase } from '#lib/server/services/case-check.js';
import { toCaseCheck } from '#lib/server/services/api-mappers.js';

const KINDS = ['bundle', 'asset'] as const;

// A code the client did not find on the case's list: a unit that swaps into a
// missing one's place, one already on the list, or something else.
export const POST: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const kind = KINDS.find((k) => k === params.kind);
		if (!kind) return apiError(400, 'invalid_request', 'kind must be bundle or asset');
		const body = await jsonBody(request);
		const code = requireString(body, 'code');
		if (!Array.isArray(body.foundAssetIds)) {
			return apiError(400, 'invalid_request', 'foundAssetIds is required.');
		}
		const found = stringList(body.foundAssetIds);
		return withCaseCheckErrors(async () => {
			const outcome = await scanIntoCase(user.id, { kind, id: params.id }, code, found);
			return apiJson('CaseCheckScanResult', {
				outcome: outcome.outcome,
				assetId: outcome.outcome === 'foreign' ? null : outcome.assetId,
				name: outcome.outcome === 'foreign' ? outcome.name : null,
				swap: outcome.outcome === 'swapped' ? { ...outcome.swap } : null,
				check: outcome.outcome === 'swapped' ? toCaseCheck(outcome.check, null) : null
			});
		});
	});
