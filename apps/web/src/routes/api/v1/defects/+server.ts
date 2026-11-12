import type { RequestHandler } from './$types';
import { prisma } from '#lib/server/auth.js';
import { apiError, ApiResponse, handleApi, requireApiUser, type Schemas } from '#lib/server/api.js';
import { resolveScannedCode } from '#lib/server/services/asset-lookup.js';
import { API_ASSET_INCLUDE } from '#lib/server/services/asset-tags.js';
import { toAsset } from '#lib/server/services/api-mappers.js';
import { reportDefect } from '#lib/server/services/inspections.js';

// DefectRequest in openapi.yaml: a failed visual check of a scanned unit.
export const POST: RequestHandler = ({ locals, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const body = (await request.json().catch(() => null)) as Partial<
			Schemas['DefectRequest']
		> | null;
		const code = typeof body?.code === 'string' ? body.code.trim() : '';
		const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
		if (!code || !notes || notes.length > 2000) {
			throw new ApiResponse(
				apiError(400, 'invalid_request', 'code and notes (what is wrong) are required.')
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

		const { statusChanged } = await reportDefect(user.id, match.assetId, notes);
		const asset = await prisma.asset.findUniqueOrThrow({
			where: { id: match.assetId },
			include: API_ASSET_INCLUDE
		});
		const response: Schemas['DefectReported'] = { asset: toAsset(asset), statusChanged };
		return Response.json(response, { status: 201 });
	});
