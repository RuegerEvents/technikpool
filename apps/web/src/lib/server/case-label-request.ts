import { LABEL_RENDER_URL } from '$app/env/private';
import { labelLogo, labelPictures } from '#lib/server/case-label-logo.js';
import {
	LABEL_SIZES,
	LOGO_BOX,
	PRINTER_DPMM,
	gridPictureBox,
	labelaryViewerUrl,
	printerBox,
	renderCaseLabel,
	type PrinterDpmm,
	type CaseLabelContents,
	type CaseLabelData,
	type CaseLabelLayout,
	type CaseLabelSize
} from '#lib/server/case-label-zpl.js';

// What both label endpoints share — a case's (case-checks/…/label) and a pack
// case's for one production (productions/…/packing/…/label): reading the
// options off the query, fetching the logo and the tiles' pictures at the
// size they print, and the response.

const SIZES: CaseLabelSize[] = ['large', 'small'];
const LAYOUTS: CaseLabelLayout[] = ['list', 'grid'];
const CONTENTS: CaseLabelContents[] = ['auto', 'always', 'never'];

export type CaseLabelQuery = {
	size: CaseLabelSize;
	layout: CaseLabelLayout;
	contents: CaseLabelContents;
	dpmm: PrinterDpmm;
};

/** The query's options, or the message for a 400 naming the one that is wrong. */
export function caseLabelQuery(url: URL): CaseLabelQuery | string {
	const pick = <T extends string>(name: string, allowed: T[], fallback: T) => {
		const value = url.searchParams.get(name) ?? fallback;
		return allowed.find((a) => a === value) ?? null;
	};
	const size = pick('size', SIZES, 'large');
	if (!size) return 'size must be large or small';
	const layout = pick('layout', LAYOUTS, 'list');
	if (!layout) return 'layout must be list or grid';
	const contents = pick('contents', CONTENTS, 'auto');
	if (!contents) return 'contents must be auto, always or never';
	const dpmm = PRINTER_DPMM.find((d) => String(d) === (url.searchParams.get('dpmm') ?? '8'));
	if (!dpmm) return 'dpmm must be 8 or 12';
	return { size, layout, contents, dpmm };
}

/** Long enough for a label full of pictures, short enough that a hung renderer only costs the preview. */
const RENDER_TIMEOUT_MS = 8000;

/**
 * The labels as PNGs from the zebrash-api at `LABEL_RENDER_URL`, one per
 * `^XA…^XZ` — it draws only the first of several. Null when none is set up or
 * it fails, and the scanner then asks Labelary as before. Its third path
 * segment is dots per millimetre, whatever its README calls it: 203 there
 * draws a label sixteen thousand dots wide.
 */
async function renderPreviews(
	zpl: string,
	size: CaseLabelSize,
	dpmm: PrinterDpmm
): Promise<string[] | null> {
	const base = LABEL_RENDER_URL?.replace(/\/+$/, '');
	if (!base) return null;
	const { widthMm, heightMm } = LABEL_SIZES[size];
	const url = `${base}/render/${Math.round(widthMm)}/${Math.round(heightMm)}/${dpmm}`;
	const labels = zpl
		.split('^XZ')
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => `${part}\n^XZ`);
	try {
		return await Promise.all(
			labels.map(async (label) => {
				const response = await fetch(url, {
					method: 'POST',
					headers: { 'content-type': 'text/plain' },
					body: label,
					signal: AbortSignal.timeout(RENDER_TIMEOUT_MS)
				});
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				return Buffer.from(await response.arrayBuffer()).toString('base64');
			})
		);
	} catch (cause) {
		console.warn(`Label preview from ${base} failed, the scanner falls back to Labelary:`, cause);
		return null;
	}
}

export async function caseLabelResponse(
	{ logoPath, ...data }: CaseLabelData & { logoPath: string | null },
	query: CaseLabelQuery,
	hasCase: boolean
) {
	const { size, layout, contents, dpmm } = query;
	const grid = size === 'large' && layout === 'grid';
	const [logo, images] = await Promise.all([
		labelLogo(logoPath, printerBox(LOGO_BOX[size], dpmm)),
		grid
			? labelPictures(
					data.lines.map((line) => line.imagePath),
					printerBox(gridPictureBox(data), dpmm)
				)
			: undefined
	]);
	const { zpl, labels, contentsShown } = renderCaseLabel(data, size, logo, {
		layout,
		contents,
		images,
		dpmm
	});
	const previews = await renderPreviews(zpl, size, dpmm);
	return {
		size,
		zpl,
		labelCount: labels,
		widthMm: LABEL_SIZES[size].widthMm,
		heightMm: LABEL_SIZES[size].heightMm,
		dpmm,
		previewUrl: labelaryViewerUrl(zpl, size, dpmm),
		contentsShown,
		hasCase,
		...(previews ? { previews } : {})
	};
}
