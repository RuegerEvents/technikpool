import type { RequestHandler } from './$types';
import { apiError, apiJson, handleApi, requireApiUser, type Schemas } from '$lib/server/api';
import { ApiResponse } from '$lib/server/api';
import {
	CHECKOUT_ERROR_STATUS,
	CheckoutError,
	performBulkCheckout
} from '$lib/server/services/checkout';

const TARGET_TYPES = ['location', 'production'] as const;

// The second half of a scan whose unit belongs with others: the ones picked
// from its `group`, booked to the same target. Same rules as the web's bulk
// checkout, which is what it calls.
export const POST: RequestHandler = ({ locals, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);

		const body = (await request.json().catch(() => null)) as Partial<
			Schemas['ScanBatchRequest']
		> | null;
		const assetIds = Array.isArray(body?.assetIds)
			? body.assetIds.filter((id): id is string => typeof id === 'string')
			: [];
		const targetType = body?.targetType;
		const targetId = typeof body?.targetId === 'string' ? body.targetId : '';

		if (assetIds.length === 0 || !targetId || !targetType || !TARGET_TYPES.includes(targetType)) {
			throw new ApiResponse(
				apiError(
					400,
					'invalid_request',
					'assetIds, targetId and targetType (location|production) are required.'
				)
			);
		}

		try {
			const { result } = await performBulkCheckout(user.id, { assetIds, targetType, targetId });
			return apiJson('ScanBatchResult', result);
		} catch (err) {
			if (err instanceof CheckoutError) {
				return apiError(CHECKOUT_ERROR_STATUS[err.code], err.code, err.message);
			}
			throw err;
		}
	});
