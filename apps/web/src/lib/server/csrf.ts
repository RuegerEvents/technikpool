// SvelteKit's own CSRF check refuses a POST/PUT/PATCH/DELETE from another
// origin when it carries a form content type *or none at all*. A request
// without a body has no content type, so in production it refused every
// bodyless `/api/v1` call from a client that sends no Origin — the scanner
// deleting an inspection or closing a stocktake, a script undoing a catalog
// change — while the dev server, which skips the check, let them through.
//
// So Kit's check is switched off (`csrf.trustedOrigins: ['*']` in
// vite.config.ts) and this one stands in for it, with one exception: a request
// that authenticates with `Authorization: Bearer`. A cross-site form or a
// plain `fetch` from another page cannot set that header without a CORS
// preflight, which this app never answers, so such a request is never a
// forgery. Everything else is refused exactly as Kit would have.

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const FORM_TYPES = [
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain',
	'application/x-sveltekit-formdata'
];

function isFormContentType(contentType: string | null) {
	if (!contentType) return true;
	const type = contentType.split(';')[0].trim().toLowerCase();
	return FORM_TYPES.includes(type);
}

export function isCsrfForbidden(request: Request, selfOrigin: string) {
	if (!MUTATING.has(request.method)) return false;
	if (!isFormContentType(request.headers.get('content-type'))) return false;
	if (request.headers.get('origin') === selfOrigin) return false;
	return !/^bearer\s+\S/i.test(request.headers.get('authorization') ?? '');
}
