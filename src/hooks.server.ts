import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import * as main from './locales/main.loader.server.svelte.js';
import { runWithLocale, loadLocales } from 'wuchale/load-utils/server';
import { locales } from './locales/data.js';
import { ensureBucket } from '$lib/server/storage';

loadLocales(main.key, main.loadIDs, main.loadCatalog, locales);

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

export const handle = sequence(localeHandle, authHandle);
