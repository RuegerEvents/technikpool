import type { RequestHandler } from './$types';
import { apiError, apiJson, ApiResponse, handleApi, requireApiUser } from '#lib/server/api.js';
import { jsonBody, stringList } from '#lib/server/stocktake-api.js';
import { lineCount, withHandoutErrors } from '#lib/server/production-handout-api.js';
import { packIntoCase } from '#lib/server/services/production-handout.js';

// Putting units into a pack case on a production, or taking them out — see
// "Pack cases" in CLAUDE.md and `packIntoCase`.

export const POST: RequestHandler = ({ locals, params, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const body = await jsonBody(request);
		const { line, organizationId } = body;
		// Left out is null: a client that drops null fields takes units out this way.
		const caseAssetId = body.caseAssetId ?? null;
		if (caseAssetId !== null && (typeof caseAssetId !== 'string' || !caseAssetId)) {
			throw new ApiResponse(
				apiError(400, 'invalid_request', 'caseAssetId is a case, or null to take units out.')
			);
		}
		const lineSelection =
			line && typeof line === 'object' ? lineCount(line as Record<string, unknown>) : undefined;
		return withHandoutErrors(async () => {
			const { result } = await packIntoCase(
				user.id,
				params.productionId,
				caseAssetId,
				{ assetIds: stringList(body.assetIds), line: lineSelection },
				typeof organizationId === 'string' && organizationId ? organizationId : undefined
			);
			return apiJson('HandoverResult', { count: result.count });
		});
	});
