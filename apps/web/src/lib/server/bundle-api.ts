import { apiError, ApiResponse } from '#lib/server/api.js';
import { bundleDetail } from '#lib/server/services/bundles.js';
import { toBundleDetail } from '#lib/server/services/api-mappers.js';

// Shared by the /api/v1/bundles handlers: the kit as the client draws it after
// any change, and a whole positive count from a request body.

export async function bundleResponse(userId: string, bundleId: string) {
	return toBundleDetail(await bundleDetail(userId, bundleId));
}

export function positiveCount(value: unknown): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
		throw new ApiResponse(
			apiError(400, 'invalid_request', 'count must be a whole number of 1 or more.')
		);
	}
	return value;
}
