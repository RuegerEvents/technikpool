import interRegular from './fonts/Inter-Regular.ttf?inline';

/**
 * The one face every sticker sheet is set in.
 *
 * Imported with `?inline` so the bytes travel inside the server bundle as a
 * data URL: the built image ships only `build/`, and a `readFile` against a
 * source path would work in dev and fail in production. Inter Regular is the
 * same static instance the scanner app bundles, and for the same reason —
 * a static instance, not the variable font, because a font subsetter maps
 * weights the way Flutter does: not at all.
 */
export function loadSheetFont(): Uint8Array {
	const base64 = interRegular.slice(interRegular.indexOf(',') + 1);
	return new Uint8Array(Buffer.from(base64, 'base64'));
}
