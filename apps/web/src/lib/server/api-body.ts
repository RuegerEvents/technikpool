import * as v from 'valibot';
import { apiError, ApiResponse } from '#lib/server/api.js';

/**
 * A JSON request body checked against `schema`. Anything else — no JSON, a
 * wrong type, a field the schema does not know — is a `400 invalid_request`
 * that names the first problem and where it is.
 */
export async function parseApiBody<S extends v.GenericSchema>(
	request: Request,
	schema: S
): Promise<v.InferOutput<S>> {
	const raw: unknown = await request.json().catch(() => undefined);
	if (raw === undefined) {
		throw new ApiResponse(apiError(400, 'invalid_request', 'The body must be JSON.'));
	}
	const result = v.safeParse(schema, raw);
	if (!result.success) {
		const issue = result.issues[0];
		const path = v.getDotPath(issue);
		throw new ApiResponse(
			apiError(400, 'invalid_request', path ? `${path}: ${issue.message}` : issue.message)
		);
	}
	return result.output;
}
