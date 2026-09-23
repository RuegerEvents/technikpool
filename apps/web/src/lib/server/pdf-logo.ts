import type { PDFDocument, PDFImage, PDFPage } from 'pdf-lib';
import { getObject } from '$lib/server/storage';

// The org's letterhead logo, shared by offers, invoices and delivery notes so
// the three carry it in the same place at the same size.

/** The box the logo is fitted into, right-aligned to the text edge. */
const MAX_W = 170;
const MAX_H = 54;
/** Top edge of the logo. The metadata column starts below it. */
const TOP_GAP = 36;

/**
 * Stored as a trimmed PNG by /api/orgs/[id]/logo, so it embeds as it is. A logo
 * that cannot be read leaves the letterhead without one rather than refusing
 * the document.
 */
export async function embedLogo(pdf: PDFDocument, path: string | null | undefined) {
	if (!path || /^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return null;
	try {
		const { bytes } = await getObject(path);
		return await pdf.embedPng(bytes);
	} catch (cause) {
		console.warn(`Could not include logo "${path}" in document:`, cause);
		return null;
	}
}

/**
 * Draws the logo in the top right corner, ending at `rightX`, and returns the
 * y of its bottom edge — where the column below it may begin. Without a logo
 * that is the top of the page, so the caller's own layout is unchanged.
 */
export function drawLogo(page: PDFPage, logo: PDFImage | null, rightX: number) {
	const top = page.getHeight() - TOP_GAP;
	if (!logo) return top;
	const { width, height } = logo.scaleToFit(MAX_W, MAX_H);
	page.drawImage(logo, { x: rightX - width, y: top - height, width, height });
	return top - height;
}
