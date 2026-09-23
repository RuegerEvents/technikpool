import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { getStocktake, StocktakeError, stocktakeCsv } from '$lib/server/services/stocktake';

// A download, not a page: plain GET with the session cookie, so a link can
// point at it. Only the caller's own orgs' stocktakes, like everything else.
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Sign in first');
	try {
		const detail = await getStocktake(locals.user.id, params.id);
		const filename = `${detail.name.replace(/[^\p{L}\p{N} ._-]+/gu, '').trim() || 'stocktake'}.csv`;
		// A BOM so Excel reads the umlauts as UTF-8.
		return new Response('﻿' + stocktakeCsv(detail), {
			headers: {
				'content-type': 'text/csv; charset=utf-8',
				'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
			}
		});
	} catch (err) {
		if (err instanceof StocktakeError) error(404, 'Stocktake not found');
		throw err;
	}
};
