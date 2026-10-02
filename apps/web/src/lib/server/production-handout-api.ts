import { apiError, ApiResponse } from '#lib/server/api.js';
import { CHECKOUT_ERROR_STATUS, CheckoutError } from '#lib/server/services/checkout.js';
import type { HandoutMode } from '#lib/server/services/production-handout.js';

// The /api/v1 handout handlers share one translation from the checkout
// service's errors to the spec's envelope — the same codes /api/v1/scans
// answers with, since a handout is booked by the same code.

export async function withHandoutErrors<T>(fn: () => Promise<T>): Promise<T | Response> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof CheckoutError) {
			return apiError(CHECKOUT_ERROR_STATUS[err.code], err.code, err.message);
		}
		throw err;
	}
}

export function handoutMode(value: string): HandoutMode {
	if (value === 'checkout' || value === 'checkin') return value;
	throw new ApiResponse(apiError(400, 'invalid_request', 'mode is checkout or checkin.'));
}

/** A line count from a request body: `key` and a whole `count` of 0 or more. */
export function lineCount(body: Record<string, unknown>) {
	const { key, count } = body;
	if (
		typeof key !== 'string' ||
		!key ||
		typeof count !== 'number' ||
		!Number.isInteger(count) ||
		count < 0
	) {
		throw new ApiResponse(
			apiError(400, 'invalid_request', 'key and a whole count of 0 or more are required.')
		);
	}
	return { key, count };
}
