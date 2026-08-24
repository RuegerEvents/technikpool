import type { RequestHandler } from './$types';
import { apiError, apiJson, handleApi, requireApiUser, type Schemas } from '$lib/server/api';
import { ApiResponse } from '$lib/server/api';
import { CheckoutError, performScan } from '$lib/server/services/checkout';

const TARGET_TYPES = ['location', 'production'] as const;

/** HTTP status per service-level failure. Anything else stays a 500. */
const STATUS_BY_CODE: Record<CheckoutError['code'], number> = {
	asset_not_found: 404,
	forbidden: 403,
	wrong_organization: 403,
	asset_retired: 409
};

export const POST: RequestHandler = ({ locals, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);

		const body = (await request.json().catch(() => null)) as Partial<Schemas['ScanRequest']> | null;
		const assetTag = typeof body?.assetTag === 'string' ? body.assetTag.trim() : '';
		const targetType = body?.targetType;
		const targetId = typeof body?.targetId === 'string' ? body.targetId : '';

		if (!assetTag || !targetId || !targetType || !TARGET_TYPES.includes(targetType)) {
			throw new ApiResponse(
				apiError(
					400,
					'invalid_request',
					'assetTag, targetId and targetType (location|production) are required.'
				)
			);
		}

		try {
			const { result } = await performScan(user.id, { assetTag, targetType, targetId });
			return apiJson('ScanResult', result);
		} catch (err) {
			if (err instanceof CheckoutError) {
				return apiError(STATUS_BY_CODE[err.code], err.code, err.message);
			}
			throw err;
		}
	});
