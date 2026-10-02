import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { withCaseCheckErrors } from '#lib/server/case-check-api.js';
import { findCase, getCaseCheck } from '#lib/server/services/case-check.js';
import { toCaseCheck } from '#lib/server/services/api-mappers.js';

export const GET: RequestHandler = ({ locals, params }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		return withCaseCheckErrors(async () => {
			const { ref, scannedAssetId } = await findCase(user.id, params.code);
			const check = await getCaseCheck(user.id, ref);
			return apiJson('CaseCheck', toCaseCheck(check, scannedAssetId));
		});
	});
