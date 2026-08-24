import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { createQrPng } from '$lib/server/stickers/qr';
import { appBaseUrl } from '$lib/server/app-url';

// The PDA reads this with its hardware scanner to learn where the server is,
// so the operator never types a URL on a rugged keypad.
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	const png = await createQrPng(appBaseUrl);
	return new Response(new Uint8Array(png), {
		headers: {
			'content-type': 'image/png',
			'cache-control': 'private, max-age=3600'
		}
	});
};
