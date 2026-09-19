import { browser } from '$app/environment';
import { resolve } from '$app/paths';
import { redirect } from '@sveltejs/kit';
import { loadLocale } from 'wuchale/load-utils';
import '../locales/main.loader.svelte.js';
import { locales } from '../locales/data.js';
import type { LayoutLoad } from './$types';

// What an account without an organization can still use: the dashboard, which
// tells it what to do next, its own profile, the org list (where a system admin
// creates the first one) and, for that admin, the admin pages.
const orglessPaths = ['/profile', '/orgs', '/auth'];

// Reading `url.pathname` below makes this load run on every navigation, and the
// catalogs only need fetching when the locale is a different one.
let loadedLocale: string | undefined;

export const load: LayoutLoad = async ({ data, url }) => {
	const locale = data.locale ?? 'de';
	if (browser && locale !== loadedLocale && locales.includes(locale as 'en' | 'de')) {
		await loadLocale(locale);
		loadedLocale = locale;
	}

	// Here rather than in `hooks.server.ts`: a client-side navigation between two
	// pages without a server load never reaches the server, and this runs for
	// those as well as for the first request.
	const { pathname } = url;
	if (
		data.user &&
		!data.hasOrg &&
		pathname !== '/' &&
		!(data.isAdmin && pathname.startsWith('/admin/')) &&
		!orglessPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
	) {
		redirect(303, resolve('/'));
	}

	return data;
};
