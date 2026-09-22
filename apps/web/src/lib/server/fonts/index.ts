import fontkit from '@pdf-lib/fontkit';
import type { PDFDocument, PDFFont } from 'pdf-lib';
import interRegular from './Inter-Regular.ttf?inline';
import interBold from './Inter-Bold.ttf?inline';

/**
 * The faces every generated PDF is set in: sticker sheets, offers, invoices,
 * delivery notes.
 *
 * Imported with `?inline` so the bytes travel inside the server bundle as a
 * data URL: the built image ships only `build/`, and a `readFile` against a
 * source path would work in dev and fail in production. These are the same
 * static instances the scanner app bundles, and for the same reason — a
 * static instance, not the variable font, because a font subsetter maps
 * weights the way Flutter does: not at all.
 *
 * Embedded and subset rather than one of pdf-lib's "standard 14" fonts. Those
 * are only *referenced* by name and left for the viewer to supply, which a
 * print shop's preflight rejects as "Schriften nicht eingebettet" — and they
 * encode WinAnsi alone, so an arrow or a „German quote" in a product name
 * could not be drawn at all.
 */
function bytes(dataUrl: string): Uint8Array {
	return new Uint8Array(Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
}

export async function embedInter(pdf: PDFDocument): Promise<{ regular: PDFFont; bold: PDFFont }> {
	pdf.registerFontkit(fontkit);
	const [regular, bold] = await Promise.all([
		pdf.embedFont(bytes(interRegular), { subset: true }),
		pdf.embedFont(bytes(interBold), { subset: true })
	]);
	return { regular, bold };
}

export async function embedInterRegular(pdf: PDFDocument): Promise<PDFFont> {
	pdf.registerFontkit(fontkit);
	return pdf.embedFont(bytes(interRegular), { subset: true });
}
