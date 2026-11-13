import sharp from 'sharp';
import { getObject } from '#lib/server/storage.js';
import { pdfThumbnail } from '#lib/server/pdf-thumbnail.js';
import type { LabelBitmap } from './case-label-zpl';

// The org's letterhead logo, made printable by a thermal printer: fitted into
// the label's header box at its dot resolution, laid on white and cut to black
// and white. No dithering — a logo is flat shapes, and a dithered edge prints
// as fuzz.

/** Luminance below which a dot is printed. Lighter brand colours still read as ink. */
const THRESHOLD = 200;

/** Null when there is no logo or it cannot be read; the label then names the org instead. */
export async function labelLogo(
	path: string | null | undefined,
	box: { width: number; height: number }
): Promise<LabelBitmap | null> {
	if (!path || /^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return null;
	try {
		const { bytes } = await getObject(path);
		const { data, info } = await sharp(bytes)
			.resize({ width: box.width, height: box.height, fit: 'inside' })
			.flatten({ background: '#ffffff' })
			.greyscale()
			.raw()
			.toBuffer({ resolveWithObject: true });

		const rowBytes = Math.ceil(info.width / 8);
		const out = new Uint8Array(rowBytes * info.height);
		for (let y = 0; y < info.height; y++) {
			for (let x = 0; x < info.width; x++) {
				if (data[(y * info.width + x) * info.channels] < THRESHOLD) {
					out[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
				}
			}
		}
		return { width: info.width, height: info.height, bytes: out };
	} catch (cause) {
		console.warn(`Could not include logo "${path}" on a case label:`, cause);
		return null;
	}
}

/**
 * A grey picture cut to black and white by error diffusion (Floyd–Steinberg),
 * so a product photo keeps its shading as a pattern of dots. Lightened a
 * little first: a thermal head prints a dot slightly larger than its cell, and
 * an undithered mid-grey comes out darker than it looked.
 */
function dither(grey: Uint8Array | Buffer, width: number, height: number, channels: number) {
	const values = new Float32Array(width * height);
	for (let i = 0; i < width * height; i++) values[i] = 255 * (grey[i * channels] / 255) ** 0.8;
	const rowBytes = Math.ceil(width / 8);
	const out = new Uint8Array(rowBytes * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = y * width + x;
			const old = values[i];
			const ink = old < 128;
			if (ink) out[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
			const error = old - (ink ? 0 : 255);
			if (x + 1 < width) values[i + 1] += (error * 7) / 16;
			if (y + 1 < height) {
				if (x > 0) values[i + width - 1] += (error * 3) / 16;
				values[i + width] += (error * 5) / 16;
				if (x + 1 < width) values[i + width + 1] += error / 16;
			}
		}
	}
	return out;
}

/**
 * The tiles' product pictures, fitted into `box` dots and dithered, by path.
 * Fetched through the PDFs' thumbnail cache, so a label printed twice reads
 * each photo once. A picture that cannot be read is left out; its tile then
 * shows the count large in its place.
 */
export async function labelPictures(
	paths: (string | null | undefined)[],
	box: { width: number; height: number }
): Promise<Map<string, LabelBitmap>> {
	const pictures = new Map<string, LabelBitmap>();
	if (box.width < 8 || box.height < 8) return pictures;
	await Promise.all(
		[...new Set(paths.filter((p): p is string => !!p))].map(async (path) => {
			const jpeg = await pdfThumbnail(path, box);
			if (!jpeg) return;
			try {
				const { data, info } = await sharp(jpeg)
					.resize({ ...box, fit: 'inside' })
					.flatten({ background: '#ffffff' })
					.greyscale()
					.raw()
					.toBuffer({ resolveWithObject: true });
				pictures.set(path, {
					width: info.width,
					height: info.height,
					bytes: dither(data, info.width, info.height, info.channels)
				});
			} catch (cause) {
				console.warn(`Could not include picture "${path}" on a case label:`, cause);
			}
		})
	);
	return pictures;
}
