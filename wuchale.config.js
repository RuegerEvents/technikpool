// @ts-check
import { adapter as svelte } from '@wuchale/svelte';
import { defineConfig } from 'wuchale';

export default defineConfig({
	locales: ['en', 'de'],
	adapters: {
		main: svelte({ loader: 'sveltekit' })
	}
});
