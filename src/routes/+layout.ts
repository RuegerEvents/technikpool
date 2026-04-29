import { browser } from '$app/environment';
import { loadLocale } from 'wuchale/load-utils';
import '../locales/main.loader.svelte.js';
import { locales } from '../locales/data.js';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data }) => {
	const locale = data.locale ?? 'de';
	if (browser && locales.includes(locale as 'en' | 'de')) {
		await loadLocale(locale);
	}
	return data;
};
