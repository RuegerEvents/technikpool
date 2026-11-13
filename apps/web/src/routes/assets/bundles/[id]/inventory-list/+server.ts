import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { renderBundleInventory } from '#lib/server/services/bundle-inventory.js';
import { pdfResponse } from '#lib/server/pdf-response.js';

// The kit's inventory list for the lid of its case, as a PDF. A plain URL so it
// can be bookmarked: ?size=a4|a5&layout=grid|list, A4 tiles if left out.
export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const size = url.searchParams.get('size') === 'a5' ? 'a5' : 'a4';
	const layout = url.searchParams.get('layout') === 'list' ? 'list' : 'grid';
	const { bytes, filename } = await renderBundleInventory(locals.user.id, params.id, size, layout);
	return pdfResponse(bytes, filename);
};
