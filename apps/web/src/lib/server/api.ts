import { isHttpError, json } from '@sveltejs/kit';
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
 * The published code for a denial that arrived as a SvelteKit `HttpError`.
 *
 * The web client's `AppErrorCode`s are deliberately *not* this surface's codes
 * — `/api/v1`'s are a contract in openapi.yaml and cannot change without a spec
 * revision (see the Errors section of CLAUDE.md). So a shared guard that denies
 * with `appError` contributes its status and its already-translated message,
 * and the code comes from the spec's own vocabulary rather than leaking an
 * internal one. The internal code is logged instead.
 */
function publishedCodeFor(status: number): string {
	switch (status) {
		case 400:
			return 'invalid_request';
		case 401:
			return 'unauthorized';
		case 403:
			return 'forbidden';
		case 404:
			return 'not_found';
		case 409:
			return 'conflict';
		default:
			return 'error';
	}
}

/**
 * Wraps a handler so thrown ApiResponses become responses and anything else
 * becomes the same envelope — a native client should never have to parse an
 * HTML error page.
 *
 * A guard shared with the web denies by throwing SvelteKit's `HttpError`, which
 * is neither an `ApiResponse` nor a fault. Answering those with a 500 would
 * turn every borrowed guard into an outage the client cannot act on, so the
 * status is carried through and only genuine faults are 500s.
 */
export function handleApi<T>(fn: () => Promise<T>) {
	return fn().catch((err: unknown) => {
		if (err instanceof ApiResponse) return err.response;

		if (isHttpError(err)) {
			const body = err.body as { code?: unknown; message?: unknown } | undefined;
			if (typeof body?.code === 'string') console.warn('[api/v1]', err.status, body.code);
			const message = typeof body?.message === 'string' ? body.message : 'The request was refused.';
			return apiError(err.status, publishedCodeFor(err.status), message);
		}

		// A genuine fault. The message is logged rather than returned: a Prisma
		// error names tables and columns, and sometimes the values in them.
		console.error('[api/v1]', err);
		return apiError(500, 'internal_error', 'Unexpected error');
	});
}

/** Response body typed as the schema the spec promises for this operation. */
export function apiJson<K extends keyof Schemas>(_schema: K, body: Schemas[K]) {
	return json(body);
}
