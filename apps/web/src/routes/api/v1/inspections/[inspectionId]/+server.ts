import type { RequestHandler } from './$types';
import { apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { deleteInspection } from '#lib/server/services/inspections.js';

export const DELETE: RequestHandler = ({ locals, params }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const { assetId, nextInspectionDue } = await deleteInspection(user.id, params.inspectionId);
		return apiJson('InspectionDeleted', {
			assetId,
			nextInspectionDue: nextInspectionDue?.toISOString() ?? null
		});
	});
