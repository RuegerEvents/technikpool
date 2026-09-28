import { apiError } from '$lib/server/api';
import { CASE_CHECK_ERROR_STATUS, CaseCheckError } from '$lib/server/services/case-check';

// The /api/v1/case-checks handlers' one translation from the service's errors
// to the spec's envelope. Every code is listed in openapi.yaml.

export async function withCaseCheckErrors<T>(fn: () => Promise<T>): Promise<T | Response> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof CaseCheckError) {
			return apiError(CASE_CHECK_ERROR_STATUS[err.code], err.code, err.message);
		}
		throw err;
	}
}
