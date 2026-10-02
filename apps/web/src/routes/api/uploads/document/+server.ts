import type { RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { putObject } from '#lib/server/storage.js';
import {
	canAddDocuments,
	DOCUMENT_PREFIX,
	MAX_DOCUMENT_BYTES
} from '#lib/server/services/product-documents.js';

// The file half of adding a product document; `addProductDocument` records it.
// Split like the picture upload (../+server.ts), because a remote function
// takes JSON and a manual is megabytes of PDF. Written under the public prefix:
// see product-documents.ts for why that is deliberate, and what follows from it.
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return Response.json({ message: 'Unauthorized' }, { status: 401 });
	if (!(await canAddDocuments(locals.user.id))) {
		return Response.json(
			{ message: 'Adding documents takes MEMBER of an organization' },
			{ status: 403 }
		);
	}

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File))
		return Response.json({ message: 'No file provided' }, { status: 400 });
	if (file.size > MAX_DOCUMENT_BYTES) {
		return Response.json({ message: 'The PDF is larger than 25 MB' }, { status: 413 });
	}

	const bytes = new Uint8Array(await file.arrayBuffer());
	// By its first bytes as well as its type: the type is whatever the browser
	// guessed from the name, and this file is served to everyone as a PDF.
	const magic = new TextDecoder().decode(bytes.subarray(0, 5));
	if (file.type !== 'application/pdf' || magic !== '%PDF-') {
		return Response.json({ message: 'Only PDF files can be added' }, { status: 400 });
	}

	try {
		const path = await putObject(`${DOCUMENT_PREFIX}${randomUUID()}.pdf`, bytes, 'application/pdf');
		return Response.json({ path, sizeBytes: bytes.length });
	} catch (error) {
		return Response.json(
			{ message: `Could not upload the PDF: ${(error as Error).message}` },
			{ status: 502 }
		);
	}
};
