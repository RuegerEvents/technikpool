import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { getObject, putObject } from '#lib/server/storage.js';

// Product photos and kit previews as JPEGs a generated PDF can embed, at the
// size the document draws them. Shared by the equipment sheets (a 64pt
// thumbnail per row) and a kit's inventory list (a tile-sized picture).

/** Pixel box a picture is shrunk into; it is never enlarged. */
export type ThumbnailBox = { width: number; height: number };

/**
 * The generated kit and unit previews embed their photos as WebP data URIs,
 * and the SVG renderer bundled with sharp decodes no WebP: it draws the count
 * badges and leaves every photo out. Re-encoded as PNG first, they render.
 */
async function withPngPhotos(svg: Buffer) {
	const source = svg.toString('utf8');
	const pattern = /data:image\/webp;base64,([A-Za-z0-9+/=]+)/g;
	const converted = new Map<string, string>();
	await Promise.all(
		[...new Set([...source.matchAll(pattern)].map((match) => match[1]))].map(async (webp) => {
			const png = await sharp(Buffer.from(webp, 'base64')).png().toBuffer();
			converted.set(webp, `data:image/png;base64,${png.toString('base64')}`);
		})
	);
	return Buffer.from(
		source.replace(pattern, (match, webp: string) => converted.get(webp) ?? match)
	);
}

/**
 * A product photo or a kit preview as a JPEG pdf-lib can embed. pdf-lib takes
 * only PNG and JPEG, while the store holds WebP photos and SVG previews, so
 * everything goes through sharp — which also shrinks a full-size photo to what
 * the document needs at print resolution instead of carrying it whole.
 * Flattened onto white: a JPEG has no alpha, and transparent pixels would
 * otherwise come out black.
 */
async function drawThumbnail(path: string, box: ThumbnailBox): Promise<Uint8Array | null> {
	try {
		const object = await getObject(path);
		if (!object.contentType.startsWith('image/')) return null;
		let bytes = Buffer.from(object.bytes);
		if (object.contentType === 'image/svg+xml') bytes = await withPngPhotos(bytes);
		return await sharp(bytes)
			.flatten({ background: '#ffffff' })
			.resize({ ...box, fit: 'inside', withoutEnlargement: true })
			.jpeg({ quality: 85 })
			.toBuffer();
	} catch (cause) {
		// A missing picture is a gap in one row, not a reason to refuse the document.
		console.warn(`Could not include image "${path}" in PDF:`, cause);
		return null;
	}
}

// Drawing a thumbnail means fetching the full photo and running it through
// sharp, and that is most of the time a sheet takes. The result can be kept
// for good: an uploaded photo gets a fresh key and a kit preview's key carries
// its fingerprint, so what is stored under a path never changes, and neither
// does its thumbnail. Kept twice — in this process for the next print, and in
// the store so a restart does not start over. Outside the public prefix: a
// sheet's pictures are nobody else's business. Each size is kept apart.
//
// Bump the version whenever drawThumbnail changes what it makes, or the old
// renderings are reused.
const THUMBNAIL_VERSION = 'v1';
const MEMORY_LIMIT = 500; // at ~15–40 KB each, a few MB
const inMemory = new Map<string, Uint8Array>();

function remember(key: string, bytes: Uint8Array) {
	// A Map iterates in insertion order, so re-inserting makes this the newest
	// and the first key the one used longest ago.
	inMemory.delete(key);
	inMemory.set(key, bytes);
	if (inMemory.size > MEMORY_LIMIT) inMemory.delete(inMemory.keys().next().value!);
}

function storedThumbnailKey(path: string, box: ThumbnailBox) {
	const hash = createHash('sha256').update(path).digest('hex').slice(0, 32);
	return `sheet-thumbnails/${THUMBNAIL_VERSION}/${box.width}x${box.height}/${hash}.jpg`;
}

/** The picture at `path` shrunk into `box`, or null when there is none to draw. */
export async function pdfThumbnail(path: string, box: ThumbnailBox): Promise<Uint8Array | null> {
	if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return null;
	const key = storedThumbnailKey(path, box);
	const known = inMemory.get(key);
	if (known) {
		remember(key, known);
		return known;
	}
	try {
		const stored = await getObject(key);
		remember(key, stored.bytes);
		return stored.bytes;
	} catch {
		// Not drawn yet (or the store is unwell, and drawing will say so).
	}
	const bytes = await drawThumbnail(path, box);
	if (!bytes) return null;
	remember(key, bytes);
	// Nobody waits for this: a thumbnail that failed to store is drawn again.
	putObject(key, bytes, 'image/jpeg').catch((cause) =>
		console.warn(`Could not store thumbnail of "${path}":`, cause)
	);
	return bytes;
}
