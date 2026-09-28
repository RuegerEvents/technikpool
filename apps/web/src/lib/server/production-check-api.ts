import { apiError } from '$lib/server/api';
import {
	PRODUCTION_CHECK_ERROR_STATUS,
	ProductionCheckError
} from '$lib/server/services/production-check';

// The /api/v1 production-check handlers share one translation from the
// service's errors to the spec's envelope. The codes are the service's own, and
// every one of them is listed in openapi.yaml.

export async function withCheckErrors<T>(fn: () => Promise<T>): Promise<T | Response> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof ProductionCheckError) {
			return apiError(PRODUCTION_CHECK_ERROR_STATUS[err.code], err.code, err.message);
		}
		throw err;
	}
}
