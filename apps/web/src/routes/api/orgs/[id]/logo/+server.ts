import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { prisma } from '$lib/server/auth';
import { putObject, PUBLIC_PREFIX } from '$lib/server/storage';
import { requireOrgOwner } from '$lib/server/services/access';
import { appError } from '$lib/errors';

// The letterhead logo on offers, invoices and delivery notes. An endpoint of its
// own because a command takes JSON, not a file.

const MAX_MB = 5;
const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

/**
 * Whatever came in, a trimmed PNG goes out: PNG because a logo is usually drawn
 * over transparency and pdf-lib embeds nothing but PNG and JPEG, trimmed because
 * the documents place it by its bounding box and a margin baked into the file
 * would push it away from the edge it is aligned to. SVG is rasterised here and
 * never stored, so no SVG is ever served from the public prefix. Rasterised at
 * a density that leaves the 1200px cap, not the vector, deciding the size.
 */
async function normalise(bytes: Uint8Array, type: string) {
	const input = () => sharp(bytes, type === 'image/svg+xml' ? { density: 600 } : {});
	// Probe first: a file that is not an image fails here, as a user error.
	await input().metadata();
	// Trim can fail on a picture that is one colour all over; untrimmed is fine then.
	const trimmed = await input()
		.trim()
		.png()
		.toBuffer()
		.catch(() => input().png().toBuffer());
	return sharp(trimmed)
		.resize({ width: 1200, height: 600, fit: 'inside', withoutEnlargement: true })
		.png()
		.toBuffer();
}

export const POST: RequestHandler = async ({ params, request }) => {
	await requireOrgOwner(params.id);
	const file = (await request.formData()).get('file');
	if (!(file instanceof File)) appError(400, 'org_logo_missing');
	if (!ACCEPTED.has(file.type)) appError(400, 'org_logo_unsupported');
	if (file.size > MAX_MB * 1024 * 1024) appError(413, 'org_logo_too_large', [MAX_MB]);

	let png: Buffer;
	try {
		png = await normalise(new Uint8Array(await file.arrayBuffer()), file.type);
	} catch {
		appError(400, 'org_logo_unreadable');
	}
	// Under the public prefix so the settings page can show it. A letterhead logo
	// is printed on everything the org sends out; there is nothing in it to hide.
	// A replacement is a new key and the old object stays: a draft offer or
	// invoice snapshotted it and still renders it.
	const logoPath = await putObject(
		`${PUBLIC_PREFIX}/org-logos/${randomUUID()}.png`,
		new Uint8Array(png),
		'image/png'
	);
	await prisma.organization.update({ where: { id: params.id }, data: { logoPath } });
	return json({ logoPath });
};

export const DELETE: RequestHandler = async ({ params }) => {
	await requireOrgOwner(params.id);
	// Only the reference goes, for the same reason a replacement keeps the old object.
	await prisma.organization.update({ where: { id: params.id }, data: { logoPath: null } });
	return new Response(null, { status: 204 });
};
