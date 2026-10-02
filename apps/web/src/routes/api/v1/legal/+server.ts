import type { RequestHandler } from './$types';
import { handleApi, type Schemas } from '#lib/server/api.js';
import { appBaseUrl } from '#lib/server/app-url.js';
import { legalLinks } from '#lib/server/services/legal.js';

// The same list the web shows below its sign-in form, for the scanner's
// settings. Public, like /legal/* itself.
export const GET: RequestHandler = () =>
	handleApi(async () => {
		const links = await legalLinks();
		const body: Schemas['LegalLink'][] = links.map((link) => ({
			kind: link.slug,
			url: link.external ? link.href : new URL(link.href, appBaseUrl).href
		}));
		return Response.json(body);
	});
