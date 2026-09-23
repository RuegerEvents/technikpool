import { apiError, ApiResponse } from '$lib/server/api';
import { STOCKTAKE_ERROR_STATUS, StocktakeError } from '$lib/server/services/stocktake';

// The /api/v1/stocktakes handlers share one translation from the service's
// errors to the spec's envelope. The codes are the service's own, and every
// one of them is listed in openapi.yaml.

export async function withStocktakeErrors<T>(fn: () => Promise<T>): Promise<T | Response> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof StocktakeError) {
			return apiError(STOCKTAKE_ERROR_STATUS[err.code], err.code, err.message);
		}
		throw err;
	}
}

/** Parses a JSON body, answering 400 for anything that isn't an object. */
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		throw new ApiResponse(apiError(400, 'invalid_request', 'A JSON object body is required.'));
	}
	return body as Record<string, unknown>;
}

export function stringList(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export function requireString(body: Record<string, unknown>, key: string): string {
	const value = body[key];
	if (typeof value !== 'string' || !value.trim()) {
		throw new ApiResponse(apiError(400, 'invalid_request', `${key} is required.`));
	}
	return value;
}
