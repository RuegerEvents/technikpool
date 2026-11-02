import { redirect } from '@sveltejs/kit';
import { auth } from '#lib/server/auth.js';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/env';
import { sequence, type Handle } from '@sveltejs/kit/hooks';
import * as main from './locales/main.loader.server.svelte.js';
import { runWithLocale, loadLocales } from 'wuchale/load-utils/server';
import { locales } from './locales/data.js';
import { ensureBucket } from '#lib/server/storage.js';
import { schedulePurge } from '#lib/server/cleanup.js';

loadLocales(main.key, main.loadCount, main.loadCatalog, locales);

if (!building) {
	ensureBucket();
	schedulePurge();
}

const localeHandle: Handle = async ({ event, resolve }) => {
	const locale = event.cookies.get('locale') ?? 'de';
	return await runWithLocale(locale, () => resolve(event));
};

const authHandle: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({
		headers: event.request.headers
	});

	event.locals.session = session?.session ?? null;
	event.locals.user = session?.user ?? null;

	return svelteKitHandler({ event, resolve, auth, building });
};

// Routes reachable without a session. Everything else bounces to the login page
// carrying where the user was headed, so signing in resumes the navigation.
const publicPaths = [
	'/auth/login',
	'/auth/register',
	'/auth/forgot-password',
	'/auth/reset-password',
	// The operator's imprint and privacy policy have to be readable before signing in.
	'/legal',
	// A production's info link for its customer, who has no account — the signed
	// URL is the credential (production-share.ts).
	'/share',
	// An org's rental terms, linked from offers, invoices and delivery notes
	// its customers receive (rental-terms.ts).
	'/rental-terms'
];

const guardHandle: Handle = async ({ event, resolve }) => {
	const { pathname, search } = event.url;
	const isPublic =
		publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
		pathname.startsWith('/api/auth');

	// Only guard page navigations — remote-function and data requests carry their
	// own auth errors, and redirecting them would swallow the real failure. The
	// same goes for /api: a native client asking for JSON needs a 401 it can act
	// on, not an HTML login page with a 200 in front of it.
	const isPageRequest =
		event.request.method === 'GET' &&
		!pathname.startsWith('/_app') &&
		!pathname.startsWith('/api/');

	if (!event.locals.user && !isPublic && isPageRequest) {
		const target = `${pathname}${search}`;
		redirect(303, `/auth/login?redirectTo=${encodeURIComponent(target)}`);
	}

	return await resolve(event);
};

// Nothing an instance serves belongs in a search index (see static/robots.txt).
// Set on every response, because robots.txt only stops crawling: a public URL
// linked from elsewhere — a rental-terms link on an invoice — can still be
// listed unless the page itself says noindex.
const noindexHandle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	if (!response.headers.has('x-robots-tag')) {
		try {
			response.headers.set('x-robots-tag', 'noindex, nofollow');
		} catch {
			// A response with immutable headers (a fetched one passed through) keeps its own.
		}
	}
	return response;
};

export const handle = sequence(noindexHandle, localeHandle, authHandle, guardHandle);
