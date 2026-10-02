import { apiError } from '#lib/server/api.js';
import { CASE_CHECK_ERROR_STATUS, CaseCheckError } from '#lib/server/services/case-check.js';

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
