import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import * as main from './locales/main.loader.server.svelte.js';
import { runWithLocale, loadLocales } from 'wuchale/load-utils/server';
import { locales } from './locales/data.js';
import { ensureBucket } from '$lib/server/storage';

loadLocales(main.key, main.loadCount, main.loadCatalog, locales);

if (!building) {
	ensureBucket();
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
	'/auth/reset-password'
];

const guardHandle: Handle = async ({ event, resolve }) => {
	const { pathname, search } = event.url;
	const isPublic =
		publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
		pathname.startsWith('/api/auth');

	// Only guard page navigations — remote-function and data requests carry their
	// own auth errors, and redirecting them would swallow the real failure.
	const isPageRequest = event.request.method === 'GET' && !pathname.startsWith('/_app');

	if (!event.locals.user && !isPublic && isPageRequest) {
		const target = `${pathname}${search}`;
		redirect(303, `/auth/login?redirectTo=${encodeURIComponent(target)}`);
	}

	return await resolve(event);
};

export const handle = sequence(localeHandle, authHandle, guardHandle);
