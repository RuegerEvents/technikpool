import sharp from 'sharp';
import { getObject } from '#lib/server/storage.js';
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
