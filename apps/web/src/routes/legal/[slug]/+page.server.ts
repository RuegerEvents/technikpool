import { error, redirect } from '@sveltejs/kit';
import { LEGAL_SLUGS, type LegalSlug } from '#lib/legal.svelte.js';
import { legalPage } from '#lib/server/services/legal.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const slug = params.slug as LegalSlug;
	if (!LEGAL_SLUGS.includes(slug)) error(404, 'Not found');

	const result = await legalPage(slug);
	// An operator who keeps the text on their own site: this URL still works, so
	// a link printed on a delivery note or given to a store doesn't go stale.
	if (result.kind === 'redirect') redirect(307, result.url, { external: true });
	if (result.kind === 'missing') error(404, 'Not found');

	return { slug, html: result.html, updatedAt: result.updatedAt };
};
