import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	// 1. Fetch current session from Better Auth
	const session = await auth.api.getSession({
		headers: event.request.headers
	});

	// 2. Make session and user available on server via locals
	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	} else {
		event.locals.session = null;
		event.locals.user = null;
	}

	// 3. Return the handler
	return svelteKitHandler({ event, resolve, auth, building });
};
