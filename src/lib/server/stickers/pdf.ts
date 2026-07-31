import {
	PDFDocument,
	StandardFonts,
	rgb,
	type PDFFont,
	type PDFImage,
	type PDFPage,
	type PDFRef
} from 'pdf-lib';
import { normalizeOptions, parseHexColor, type RawGeneratorOptions } from './config';
import { createDataMatrixPng } from './datamatrix';
import { CORNER_RADIUS_MM, flagCutPath, roundedRectPath } from './geometry';
import { fillPathRgb, registerKissCutColorSpace, strokeKissCutPath } from './kisscut';
import { paginateStickers } from './items';
import type { GeneratorOptions, GridPosition, SheetPage } from './types';
import { mm } from './units';

const KISS_CUT_LINE_WIDTH_PT = 0.5;
const FLAG_TAIL_HALF_HEIGHT_RATIO = 0.16;
/** How far beyond the bleed the group box sits, so it never overlaps the bleed fill. */
const GROUP_BOX_CLEARANCE_BEYOND_BLEED_MM = 1;

interface LogoAsset {
	text?: string;
}

export async function generateStickerSheet(rawOptions: RawGeneratorOptions): Promise<Uint8Array> {
	const options = normalizeOptions(rawOptions);
	const pdfDoc = await PDFDocument.create();
	pdfDoc.setTitle('Stickerbogen');
	pdfDoc.setCreator('stickerbogen-generator');
	pdfDoc.setProducer('stickerbogen-generator');

	const kissCutRef = registerKissCutColorSpace(pdfDoc.context);
	const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
	const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
	const logo = loadLogo(options);
	const pages = paginateStickers(options);

	for (const sheetPage of pages) {
		const page = pdfDoc.addPage([mm(options.layout.pageWidthMm), mm(options.layout.pageHeightMm)]);
		drawHeader(page, sheetPage, options, font, boldFont);
		for (const position of sheetPage.positions) {
			await drawGridPosition(pdfDoc, page, position, options, font, logo, kissCutRef);
		}
		drawGroupBoxes(page, sheetPage, options);
	}

	return pdfDoc.save();
}

function loadLogo(options: GeneratorOptions): LogoAsset {
	return { text: options.logoText ?? options.brandText };
}

function drawHeader(
	page: PDFPage,
	sheetPage: SheetPage,
	options: GeneratorOptions,
	font: PDFFont,
	boldFont: PDFFont
): void {
	const pageHeight = page.getHeight();
	const stickers = sheetPage.positions
		.map((position) => position.sticker)
		.filter((s) => s !== null);
	const minLabel = stickers[0]?.label ?? '—';
	const maxLabel = stickers.at(-1)?.label ?? '—';
	const firstRange = options.items[0];
	const copies = firstRange?.copies ?? stickers.length;
	const boxY = pageHeight - mm(7.4);

	drawSmallField(page, font, boldFont, 'Nummern', `${minLabel} – ${maxLabel}`, 6, boxY);
	drawSmallField(page, font, boldFont, 'Anzahl jeweils', `${copies}x`, 72, boxY);
	drawSmallField(
		page,
		font,
		boldFont,
		'Seite',
		`${sheetPage.pageIndex + 1} von ${sheetPage.totalPages}`,
		112,
		boxY
	);

	const brand = options.brandText ?? options.logoText;
	if (brand) {
		const textWidth = boldFont.widthOfTextAtSize(brand, 12);
		const x = page.getWidth() - mm(12) - textWidth;
		page.drawText(brand, {
			x,
			y: pageHeight - mm(7),
			size: 12,
			font: boldFont,
			color: rgb(0.08, 0.08, 0.08)
		});
	}
}

function drawSmallField(
	page: PDFPage,
	font: PDFFont,
	boldFont: PDFFont,
	label: string,
	value: string,
	xMm: number,
	y: number
): void {
	const x = mm(xMm);
	page.drawRectangle({
		x,
		y: y - mm(1.1),
		width: mm(52),
		height: mm(6),
		borderWidth: 0.25,
		borderColor: rgb(0.65, 0.65, 0.65)
	});
	page.drawText(label, {
		x: x + mm(1),
		y: y + mm(0.6),
		size: 4.5,
		font,
		color: rgb(0.55, 0.55, 0.55)
	});
	page.drawText(value, {
		x: x + mm(18),
		y: y + mm(0.6),
		size: 6.5,
		font: boldFont,
		color: rgb(0.05, 0.05, 0.05)
	});
}

async function drawGridPosition(
	pdfDoc: PDFDocument,
	page: PDFPage,
	position: GridPosition,
	options: GeneratorOptions,
	font: PDFFont,
	logo: LogoAsset,
	kissCutRef: PDFRef
): Promise<void> {
	const sticker = position.sticker;
	if (!sticker) return;

	const x = mm(position.xMm);
	const y = page.getHeight() - mm(position.yMm + options.size.heightMm);
	const w = mm(options.size.widthMm);
	const h = mm(options.size.heightMm);
	const color = parseHexColor(options.color);
	const bleed = mm(options.bleedMm);
	const cornerR = mm(CORNER_RADIUS_MM);

	const quiet = mm(options.quietZoneMm);
	const matrixImage = await pdfDoc.embedPng(await createDataMatrixPng(sticker.payload));

	if (options.type === 'quadratisch') {
		const bleedPath = roundedRectPath(
			x - bleed,
			y - bleed,
			w + 2 * bleed,
			h + 2 * bleed,
			cornerR + bleed
		);
		fillPathRgb(page, bleedPath, color.r, color.g, color.b);

		const cutPath = roundedRectPath(x, y, w, h, cornerR);
		strokeKissCutPath(page, kissCutRef, cutPath, KISS_CUT_LINE_WIDTH_PT);

		let matrixSize = Math.min(w, h) * options.matrixScale;
		matrixSize = Math.min(matrixSize, w - 2 * quiet, h - 2 * quiet);
		const matrixX = x + quiet;
		const matrixY = y + h - quiet - matrixSize;
		drawMatrixWithBackground(page, matrixImage, matrixX, matrixY, matrixSize);

		page.drawText(sticker.label, {
			x: matrixX,
			y: y + mm(0.8),
			size: Math.min(5.2, h * 0.18),
			font,
			color: rgb(1, 1, 1)
		});

		drawLogoMark(page, x, y, w, h, options, font, logo);
	} else {
		const tailLen = mm(options.size.flagTailMm ?? 0);
		const tailHalfHeight = h * FLAG_TAIL_HALF_HEIGHT_RATIO;
		const foldY = y + h / 2;
		const halfH = h / 2;
		// The tail is centered on the bottom half, not the whole sticker — it
		// structurally belongs to the half that doesn't carry the Data Matrix.
		const tailCenterY = y + halfH / 2;

		const bleedPath = flagCutPath(
			x - bleed,
			y - bleed,
			w + 2 * bleed,
			h + 2 * bleed,
			tailLen + bleed,
			tailHalfHeight + bleed,
			cornerR + bleed,
			tailCenterY
		);
		fillPathRgb(page, bleedPath, color.r, color.g, color.b);

		const cutPath = flagCutPath(x, y, w, h, tailLen, tailHalfHeight, cornerR, tailCenterY);
		strokeKissCutPath(page, kissCutRef, cutPath, KISS_CUT_LINE_WIDTH_PT);

		page.drawLine({
			start: { x, y: foldY },
			end: { x: x + w, y: foldY },
			thickness: 0.45,
			color: rgb(1, 1, 1),
			dashArray: [mm(1.8), mm(1.6)]
		});

		let matrixSize = Math.min(w, halfH) * options.matrixScale;
		matrixSize = Math.min(matrixSize, w - 2 * quiet, halfH - 2 * quiet);
		const matrixX = x + quiet;
		const matrixY = y + h - quiet - matrixSize;
		drawMatrixWithBackground(page, matrixImage, matrixX, matrixY, matrixSize);

		// Label and logo sit beside the matrix (not below it) — the top half is
		// too short for a below-matrix line once the matrix already fills most of it.
		const textStartX = matrixX + matrixSize + mm(1.5);
		const labelSize = Math.min(6, halfH * 0.35);
		page.drawText(sticker.label, {
			x: textStartX,
			y: foldY + halfH / 2 - labelSize / 2,
			size: labelSize,
			font,
			color: rgb(1, 1, 1)
		});

		const logoText = logo.text ?? options.brandText;
		if (logoText) {
			const logoSize = Math.min(3.6, halfH * 0.2);
			page.drawText(logoText, {
				x: x + w - mm(0.8) - font.widthOfTextAtSize(logoText, logoSize),
				y: y + h - quiet - logoSize,
				size: logoSize,
				font,
				color: rgb(1, 1, 1)
			});
		}
	}
}

function drawMatrixWithBackground(
	page: PDFPage,
	matrixImage: PDFImage,
	matrixX: number,
	matrixY: number,
	matrixSize: number
): void {
	page.drawRectangle({
		x: matrixX - mm(0.25),
		y: matrixY - mm(0.25),
		width: matrixSize + mm(0.5),
		height: matrixSize + mm(0.5),
		color: rgb(1, 1, 1)
	});
	page.drawImage(matrixImage, { x: matrixX, y: matrixY, width: matrixSize, height: matrixSize });
}

function drawLogoMark(
	page: PDFPage,
	x: number,
	y: number,
	w: number,
	h: number,
	options: GeneratorOptions,
	font: PDFFont,
	logo: LogoAsset
): void {
	const text = logo.text ?? options.brandText;
	const logoMaxW = w * 0.36;
	const logoMaxH = h * 0.16;
	const logoX = x + w - logoMaxW - mm(0.8);
	const logoY = y + mm(0.75);

	if (text) {
		page.drawText(text, {
			x: logoX,
			y: logoY,
			size: Math.min(3.6, logoMaxH),
			font,
			color: rgb(1, 1, 1)
		});
	}
}

interface GroupBox {
	row: number;
	startCol: number;
	endCol: number;
	/** True when this run continues from the previous row / next row — that side is left open, not boxed in. */
	leftOpen: boolean;
	rightOpen: boolean;
}

/**
 * Finds, per row, the contiguous runs of a multi-copy group so a box can be
 * drawn around each run. A group's runs always appear consecutively here
 * (groups are placed one after another, never interleaved), so consecutive
 * same-groupIndex entries are marked open on the side where they continue.
 */
function findGroupBoxes(positions: GridPosition[], columns: number): GroupBox[] {
	interface RawRun {
		row: number;
		startCol: number;
		endCol: number;
		groupIndex: number;
	}
	const runs: RawRun[] = [];
	const rows = Math.ceil(positions.length / columns);

	for (let row = 0; row < rows; row += 1) {
		let col = 0;
		while (col < columns) {
			const position = positions[row * columns + col];
			if (!position || position.groupSize <= 1) {
				col += 1;
				continue;
			}
			const groupIndex = position.groupIndex;
			let endCol = col;
			while (
				endCol + 1 < columns &&
				positions[row * columns + endCol + 1]?.groupIndex === groupIndex
			) {
				endCol += 1;
			}
			runs.push({ row, startCol: col, endCol, groupIndex });
			col = endCol + 1;
		}
	}

	return runs.map((run, i) => ({
		row: run.row,
		startCol: run.startCol,
		endCol: run.endCol,
		leftOpen: runs[i - 1]?.groupIndex === run.groupIndex,
		rightOpen: runs[i + 1]?.groupIndex === run.groupIndex
	}));
}

/** Draws a plain gray box around each multi-copy group's run — a visual aid, not part of the cut file. */
function drawGroupBoxes(page: PDFPage, sheetPage: SheetPage, options: GeneratorOptions): void {
	const { columns } = options.layout;
	const boxes = findGroupBoxes(sheetPage.positions, columns);
	const footprintWidthMm = options.size.widthMm + (options.size.flagTailMm ?? 0);
	const margin = mm(options.bleedMm + GROUP_BOX_CLEARANCE_BEYOND_BLEED_MM);
	const color = rgb(0.35, 0.35, 0.35);
	const thickness = 0.75;

	for (const box of boxes) {
		const startPosition = sheetPage.positions[box.row * columns + box.startCol];
		const endPosition = sheetPage.positions[box.row * columns + box.endCol];
		const left = mm(startPosition.xMm) - margin;
		const right = mm(endPosition.xMm) + mm(footprintWidthMm) + margin;
		const top = page.getHeight() - mm(startPosition.yMm) + margin;
		const bottom = page.getHeight() - mm(startPosition.yMm + options.size.heightMm) - margin;

		page.drawLine({ start: { x: left, y: top }, end: { x: right, y: top }, thickness, color });
		page.drawLine({
			start: { x: left, y: bottom },
			end: { x: right, y: bottom },
			thickness,
			color
		});
		if (!box.leftOpen) {
			page.drawLine({ start: { x: left, y: bottom }, end: { x: left, y: top }, thickness, color });
		}
		if (!box.rightOpen) {
			page.drawLine({
				start: { x: right, y: bottom },
				end: { x: right, y: top },
				thickness,
				color
			});
		}
	}
}
