import { json, type RequestHandler } from '@sveltejs/kit';
import { putObject } from '$lib/server/storage';
import { randomUUID } from 'node:crypto';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ message: 'Unauthorized' }, { status: 401 });
	}

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) {
		return json({ message: 'No file provided' }, { status: 400 });
	}
	if (!ALLOWED_TYPES.has(file.type)) {
		return json({ message: 'Only PNG, JPEG, or WebP images are allowed' }, { status: 400 });
	}

	const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
	const key = `product-images/${randomUUID()}.${ext}`;
	const bytes = new Uint8Array(await file.arrayBuffer());

	try {
		const url = await putObject(key, bytes, file.type);
		return json({ url });
	} catch (error) {
		return json(
			{ message: `Could not upload image: ${(error as Error).message}` },
			{ status: 502 }
		);
	}
};
