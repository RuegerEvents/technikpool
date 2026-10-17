import type { RequestHandler } from './$types';
import { prisma } from '#lib/server/auth.js';
import { apiError, ApiResponse, handleApi, requireApiUser, type Schemas } from '#lib/server/api.js';
import { isSystemAdmin, requireOrgInventory, userOrgIds } from '#lib/server/services/access.js';
import { resolveScannedCode } from '#lib/server/services/asset-lookup.js';
import { API_ASSET_INCLUDE } from '#lib/server/services/asset-tags.js';
import { toAsset, toInspection } from '#lib/server/services/api-mappers.js';
import { parseInspectionDate, recordInspections } from '#lib/server/services/inspections.js';
import { INSPECTION_RESULTS, type InspectionResult } from '#lib/inspection-due.js';
import { isRetiredStatus } from '#lib/asset-status.js';

export const POST: RequestHandler = ({ locals, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);

		const body = (await request.json().catch(() => null)) as Partial<
			Schemas['InspectionRequest']
		> | null;
		const code = typeof body?.code === 'string' ? body.code.trim() : '';
		const performedAt = typeof body?.performedAt === 'string' ? body.performedAt : '';
		const result = body?.result;
		if (!code || !performedAt || !result || !INSPECTION_RESULTS.includes(result)) {
			throw new ApiResponse(
				apiError(
					400,
					'invalid_request',
					'code, performedAt (YYYY-MM-DD) and result (PASSED|FAILED) are required.'
				)
			);
		}

		const match = await resolveScannedCode(user.id, code);
		if (match.kind === 'ambiguous') {
			throw new ApiResponse(
				apiError(
					409,
					'serial_ambiguous',
					`Serial number "${code}" is on more than one unit — scan the asset tag instead`
				)
			);
		}
		if (match.kind === 'not_found') {
			throw new ApiResponse(apiError(404, 'asset_not_found', `Tag "${code}" not found`));
		}

		const target = await prisma.asset.findUniqueOrThrow({
			where: { id: match.assetId },
			select: { status: true, organizationId: true }
		});
		if (!(await isSystemAdmin(user.id))) {
			const orgIds = await userOrgIds(user.id);
			if (!orgIds.includes(target.organizationId)) {
				throw new ApiResponse(apiError(403, 'forbidden', 'No access to this asset'));
			}
		}
		// ADMIN or OWNER first, so a MEMBER hears that they may not, whatever the unit's state.
		await requireOrgInventory(target.organizationId);
		if (isRetiredStatus(target.status)) {
			throw new ApiResponse(
				apiError(409, 'asset_retired', 'This unit is sold or decommissioned and is not inspected.')
			);
		}

		const [recorded] = await recordInspections(user.id, {
			assetIds: [match.assetId],
			performedAt: parseInspectionDate(performedAt),
			result: result as InspectionResult,
			inspectorName: typeof body?.inspectorName === 'string' ? body.inspectorName : null,
			notes: typeof body?.notes === 'string' ? body.notes : null
		});

		const [inspection, asset] = await Promise.all([
			prisma.inspection.findUniqueOrThrow({ where: { id: recorded.id } }),
			prisma.asset.findUniqueOrThrow({
				where: { id: match.assetId },
				include: API_ASSET_INCLUDE
			})
		]);
		const response: Schemas['InspectionRecorded'] = {
			inspection: toInspection(inspection),
			asset: toAsset(asset),
			inspectionIntervalMonths: asset.inspectionIntervalMonths,
			nextInspectionDue: asset.nextInspectionDue?.toISOString() ?? null,
			markedBroken: recorded.markedBroken
		};
		return Response.json(response, { status: 201 });
	});
