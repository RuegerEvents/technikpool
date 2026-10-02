import type { RequestHandler } from '@sveltejs/kit';
import { putObject, PUBLIC_PREFIX } from '#lib/server/storage.js';
import { randomUUID } from 'node:crypto';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return Response.json({ message: 'Unauthorized' }, { status: 401 });
	}

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) {
		return Response.json({ message: 'No file provided' }, { status: 400 });
	}
	if (!ALLOWED_TYPES.has(file.type)) {
		return Response.json(
			{ message: 'Only PNG, JPEG, or WebP images are allowed' },
			{ status: 400 }
		);
	}

	const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
	const key = `${PUBLIC_PREFIX}/${randomUUID()}.${ext}`;
	const bytes = new Uint8Array(await file.arrayBuffer());

	try {
		// The stored key, not an address. What renders it is `imageSrc()`; see
		// $lib/images for why the host is resolved at display time.
		const path = await putObject(key, bytes, file.type);
		return Response.json({ path });
	} catch (error) {
		return Response.json(
			{ message: `Could not upload image: ${(error as Error).message}` },
			{ status: 502 }
		);
	}
};
