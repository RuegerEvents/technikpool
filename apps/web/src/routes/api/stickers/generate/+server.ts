import { json, type RequestHandler } from '@sveltejs/kit';
import type { AppErrorCode } from '$lib/errors';
import { generateStickerSheet } from '$lib/server/stickers/pdf';
import type { RawGeneratorOptions } from '$lib/server/stickers/config';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ code: 'unauthorized' satisfies AppErrorCode }, { status: 401 });
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
	} catch (err) {
		// The guards in stickers/config.ts sit behind the form's own validation, so what
		// reaches here is a malformed request rather than a typo. The page shows a translated
		// sentence and keeps `detail` for whoever has to work out why.
		return json(
			{
				code: 'sticker_config_invalid' satisfies AppErrorCode,
				detail: err instanceof Error ? err.message : ''
			},
			{ status: 400 }
		);
	}
};
