import { json } from '@sveltejs/kit';
import type { components } from '$lib/api/schema';

// Helpers for the /api/v1 endpoints. Responses are typed against the generated
// OpenAPI schema, so an endpoint that drifts from openapi.yaml fails `pnpm
// check` rather than the device in someone's hand.

export type Schemas = components['schemas'];

/** Every failure on this surface uses the spec's Error envelope. */
export function apiError(status: number, code: string, message: string) {
	const body: Schemas['Error'] = { error: { code, message } };
	return json(body, { status });
}

/**
 * A thrown Response. Endpoints `throw` this and the catch in `handleApi` turns
 * it back into the response, which keeps guard clauses to one line.
 */
export class ApiResponse extends Error {
	constructor(readonly response: Response) {
		super('api response');
	}
}

export function requireApiUser(locals: App.Locals) {
	if (!locals.user) {
		throw new ApiResponse(
			apiError(401, 'unauthorized', 'A valid bearer token is required for this endpoint.')
		);
	}
	return locals.user;
}

/**
 * Wraps a handler so thrown ApiResponses become responses and anything else
 * becomes a 500 in the same envelope — a native client should never have to
 * parse an HTML error page.
 */
export function handleApi<T>(fn: () => Promise<T>) {
	return fn().catch((err: unknown) => {
		if (err instanceof ApiResponse) return err.response;
		console.error('[api/v1]', err);
		return apiError(500, 'internal_error', (err as Error).message ?? 'Unexpected error');
	});
}

/** Response body typed as the schema the spec promises for this operation. */
export function apiJson<K extends keyof Schemas>(_schema: K, body: Schemas[K]) {
	return json(body);
}
