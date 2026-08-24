import { json, type RequestHandler } from '@sveltejs/kit';
import { generateStickerSheet } from '$lib/server/stickers/pdf';
import type { RawGeneratorOptions } from '$lib/server/stickers/config';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ message: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = (await request.json()) as RawGeneratorOptions;
		const bytes = await generateStickerSheet(body);
		const fileName =
			body.type === 'faehnchen' ? 'stickerbogen-faehnchen.pdf' : 'stickerbogen-quadratisch.pdf';

		return new Response(Buffer.from(bytes), {
			status: 200,
			headers: {
				'content-type': 'application/pdf',
				'content-disposition': `attachment; filename="${fileName}"`,
				'cache-control': 'no-store'
			}
		});
	} catch (error) {
		return json(
			{ message: error instanceof Error ? error.message : 'Could not generate sticker sheet' },
			{ status: 400 }
		);
	}
};
