import {
	PDFDocument,
	PDFNumber,
	PDFOperator,
	PDFOperatorNames,
	degrees,
	rgb,
	type PDFFont,
	type PDFImage,
	type PDFPage,
	type PDFRef
} from 'pdf-lib';
import { normalizeOptions, parseHexColor, type RawGeneratorOptions } from './config';
import { createDataMatrixPng } from './datamatrix';
import {
	CORNER_RADIUS_MM,
	FLAG_TAIL_HALF_HEIGHT_RATIO,
	FONT_CAP_HEIGHT_RATIO,
	FONT_DESCENT_RATIO,
	SQUARE_STICKER,
	flagCutPath,
	roundedRectPath
} from './geometry';
import { fillPathRgb, registerKissCutColorSpace, strokeKissCutPath } from './kisscut';
import { paginateStickers } from './items';
import type { GeneratorOptions, GridPosition, SheetPage, StickerItem } from './types';
import { mm, ptToMm } from './units';
import { embedInterRegular } from '../fonts';

const KISS_CUT_LINE_WIDTH_PT = 0.5;
/** How far beyond the bleed the group box sits, so it never overlaps the bleed fill. */
const GROUP_BOX_CLEARANCE_BEYOND_BLEED_MM = 1;

/** The header strip's own geometry, in mm from the top-left of the page. */
const HEADER = {
	boxTopMm: 6,
	boxHeightMm: 6.5,
	firstBoxLeftMm: 6,
	boxGapMm: 5.4,
	padLeftMm: 1,
	labelToValueMm: 3.3,
	padRightMm: 2,
	labelSizePt: 7.5,
	valueSizePt: 12,
	/** Baselines measured up from the box's bottom edge. */
	labelBaselineMm: 0.8,
	valueBaselineMm: 1.7,
	brandRightMm: 6,
	/** Clearance the brand keeps from the last field box before it is shrunk to fit. */
	brandClearanceMm: 8
};

export async function generateStickerSheet(rawOptions: RawGeneratorOptions): Promise<Uint8Array> {
	const options = normalizeOptions(rawOptions);
	const pdfDoc = await PDFDocument.create();
	pdfDoc.setTitle('Stickerbogen');
	pdfDoc.setCreator('stickerbogen-generator');
	pdfDoc.setProducer('stickerbogen-generator');

	const kissCutRef = registerKissCutColorSpace(pdfDoc.context);
	const font = await embedInterRegular(pdfDoc);
	const pages = paginateStickers(options);

	for (const sheetPage of pages) {
		const page = pdfDoc.addPage([mm(options.layout.pageWidthMm), mm(options.layout.pageHeightMm)]);
		drawHeader(page, sheetPage, options, font);
		for (const position of sheetPage.positions) {
			await drawGridPosition(pdfDoc, page, position, options, font, kissCutRef);
		}
		drawGroupBoxes(page, sheetPage, options);
	}

	return pdfDoc.save();
}

function drawHeader(
	page: PDFPage,
	sheetPage: SheetPage,
	options: GeneratorOptions,
	font: PDFFont
): void {
	const stickers = sheetPage.positions
		.map((position) => position.sticker)
		.filter((s) => s !== null);
	const minLabel = stickers[0]?.label ?? '—';
	const maxLabel = stickers.at(-1)?.label ?? '—';
	const firstRange = options.items[0];
	const copies = firstRange?.copies ?? stickers.length;

	const fields: [string, string][] = [
		['Nummern', `${minLabel} – ${maxLabel}`],
		['Anzahl jeweils', `${copies}x`],
		['Seite', `${sheetPage.pageIndex + 1} von ${sheetPage.totalPages}`]
	];

	// Each box is only as wide as its own contents, so the three sit as a tight
	// row however long the numbers run.
	let xMm = HEADER.firstBoxLeftMm;
	for (const [label, value] of fields) {
		xMm += drawSmallField(page, font, label, value, xMm) + HEADER.boxGapMm;
	}

	drawHeaderBrand(page, options, font, xMm - HEADER.boxGapMm);
}

/** Draws one labelled field box and returns the width it took, in mm. */
function drawSmallField(
	page: PDFPage,
	font: PDFFont,
	label: string,
	value: string,
	xMm: number
): number {
	const labelWidth = font.widthOfTextAtSize(label, HEADER.labelSizePt);
	const valueWidth = font.widthOfTextAtSize(value, HEADER.valueSizePt);
	const widthMm =
		HEADER.padLeftMm +
		ptToMm(labelWidth) +
		HEADER.labelToValueMm +
		ptToMm(valueWidth) +
		HEADER.padRightMm;

	const x = mm(xMm);
	const bottom = page.getHeight() - mm(HEADER.boxTopMm + HEADER.boxHeightMm);

	page.drawRectangle({
		x,
		y: bottom,
		width: mm(widthMm),
		height: mm(HEADER.boxHeightMm),
		borderWidth: 0.25,
		borderColor: rgb(0.65, 0.65, 0.65)
	});
	page.drawText(label, {
		x: x + mm(HEADER.padLeftMm),
		y: bottom + mm(HEADER.labelBaselineMm),
		size: HEADER.labelSizePt,
		font,
		color: rgb(0.55, 0.55, 0.55)
	});
	page.drawText(value, {
		x: x + mm(HEADER.padLeftMm + HEADER.labelToValueMm) + labelWidth,
		y: bottom + mm(HEADER.valueBaselineMm),
		size: HEADER.valueSizePt,
		font,
		color: rgb(0.08, 0.08, 0.08)
	});

	return widthMm;
}

/** The org name, set large in the top-right corner and shrunk if a long name would reach the field boxes. */
function drawHeaderBrand(
	page: PDFPage,
	options: GeneratorOptions,
	font: PDFFont,
	fieldsRightMm: number
): void {
	const brand = options.orgName;
	if (!brand) return;

	const availableMm =
		options.layout.pageWidthMm - HEADER.brandRightMm - fieldsRightMm - HEADER.brandClearanceMm;
	const capSize = mm(HEADER.boxHeightMm * 0.9) / FONT_CAP_HEIGHT_RATIO;
	const size = Math.min(capSize, mm(availableMm) / font.widthOfTextAtSize(brand, 1));
	const bottom = page.getHeight() - mm(HEADER.boxTopMm + HEADER.boxHeightMm);

	page.drawText(brand, {
		x: page.getWidth() - mm(HEADER.brandRightMm) - font.widthOfTextAtSize(brand, size),
		y: bottom + mm(HEADER.valueBaselineMm) - size * 0.1,
		size,
		font,
		color: rgb(0.08, 0.08, 0.08)
	});
}

async function drawGridPosition(
	pdfDoc: PDFDocument,
	page: PDFPage,
	position: GridPosition,
	options: GeneratorOptions,
	font: PDFFont,
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
		drawSquareSticker(page, { x, y, w, h }, sticker, options, font, matrixImage, kissCutRef);
	} else {
		const tailLen = mm(options.size.flagTailMm ?? 0);
		const tailHalfHeight = h * FLAG_TAIL_HALF_HEIGHT_RATIO;
		const foldY = y + h / 2;
		const halfH = h / 2;
		// The tail is centered on the bottom half, not the whole sticker — it
		// structurally belongs to the half that doesn't carry the Data Matrix.
		const tailCenterY = y + halfH / 2;

		// Nested-tail pairing rotates every second sticker 180° about its own
		// bounding-box center — everything below is drawn in normal
		// orientation and this transform flips the lot, tail included, so no
		// geometry math needs to change for the rotated case.
		if (position.rotated) {
			const cx = x + w / 2 + tailLen / 2;
			const cy = y + h / 2;
			page.pushOperators(
				PDFOperator.of(PDFOperatorNames.PushGraphicsState),
				PDFOperator.of(PDFOperatorNames.ConcatTransformationMatrix, [
					PDFNumber.of(-1),
					PDFNumber.of(0),
					PDFNumber.of(0),
					PDFNumber.of(-1),
					PDFNumber.of(2 * cx),
					PDFNumber.of(2 * cy)
				])
			);
		}

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

		const orgName = options.orgName;
		if (orgName) {
			const logoSize = Math.min(3.6, halfH * 0.2);
			page.drawText(orgName, {
				x: x + w - mm(0.8) - font.widthOfTextAtSize(orgName, logoSize),
				y: y + h - quiet - logoSize,
				size: logoSize,
				font,
				color: rgb(1, 1, 1)
			});
		}

		if (position.rotated) {
			page.pushOperators(PDFOperator.of(PDFOperatorNames.PopGraphicsState));
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

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * The square sticker, laid out like the print shop's reference sheet: a
 * coloured field with a white footer band carrying the org name, and a white
 * rounded panel holding the Data Matrix with the asset number set vertically
 * beside it.
 *
 * The bleed is a plain rectangle rather than an outset of the cut contour —
 * it only has to cover the cut on three sides, and its fourth side stops at
 * the band, which is bare paper and so needs no fill of its own.
 */
function drawSquareSticker(
	page: PDFPage,
	{ x, y, w, h }: Rect,
	sticker: StickerItem,
	options: GeneratorOptions,
	font: PDFFont,
	matrixImage: PDFImage,
	kissCutRef: PDFRef
): void {
	const color = parseHexColor(options.color);
	const bleed = mm(options.bleedMm);
	const quiet = mm(options.quietZoneMm);
	const bandH = h * SQUARE_STICKER.bandHeightRatio;

	page.drawRectangle({
		x: x - bleed,
		y: y + bandH,
		width: w + 2 * bleed,
		height: h - bandH + bleed,
		color: rgb(color.r, color.g, color.b)
	});

	const cutPath = roundedRectPath(x, y, w, h, h * SQUARE_STICKER.cornerRadiusRatio);
	strokeKissCutPath(page, kissCutRef, cutPath, KISS_CUT_LINE_WIDTH_PT);

	const insetX = w * SQUARE_STICKER.panelInsetXRatio;
	const insetY = h * SQUARE_STICKER.panelInsetYRatio;
	const panel: Rect = {
		x: x + insetX,
		y: y + bandH + insetY,
		w: w - 2 * insetX,
		h: h - bandH - 2 * insetY
	};
	fillPathRgb(
		page,
		roundedRectPath(panel.x, panel.y, panel.w, panel.h, h * SQUARE_STICKER.panelCornerRatio),
		1,
		1,
		1
	);

	// The panel is wider than it is tall — the matrix squares off against its
	// height and the leftover column on the right carries the number.
	const matrixSize = (Math.min(panel.w, panel.h) - 2 * quiet) * options.matrixScale;
	const matrixX = panel.x + quiet;
	const matrixY = panel.y + (panel.h - matrixSize) / 2;
	page.drawImage(matrixImage, { x: matrixX, y: matrixY, width: matrixSize, height: matrixSize });

	drawVerticalLabel(page, sticker.label, font, {
		x: panel.x + panel.w - quiet,
		y: matrixY,
		w: panel.x + panel.w - quiet - (matrixX + matrixSize),
		h: matrixSize
	});

	const orgName = options.orgName;
	if (orgName) {
		const capSize = (h * SQUARE_STICKER.bandCapHeightRatio) / FONT_CAP_HEIGHT_RATIO;
		const size = Math.min(capSize, (w - 2 * insetX) / font.widthOfTextAtSize(orgName, 1));
		// Centred on cap-plus-descender rather than on the baseline, so a name
		// with a descender in it doesn't hang into the band's bottom margin.
		const descent = size * FONT_DESCENT_RATIO;
		page.drawText(orgName, {
			x: x + (w - font.widthOfTextAtSize(orgName, size)) / 2,
			y: y + (bandH - size * FONT_CAP_HEIGHT_RATIO - descent) / 2 + descent,
			size,
			font,
			color: rgb(0.08, 0.08, 0.08)
		});
	}
}

/**
 * The asset number, rotated a quarter turn anticlockwise so it reads bottom to
 * top in the strip beside the Data Matrix. `slot.x` is the baseline — glyphs
 * ascend towards -x once rotated, so they grow back towards the matrix — and
 * the type is sized to the shorter of the two constraints: the strip's width
 * for its cap height, the matrix's height for its length.
 */
function drawVerticalLabel(page: PDFPage, label: string, font: PDFFont, slot: Rect): void {
	if (slot.w <= 0 || slot.h <= 0) return;

	const size = Math.min(slot.w / FONT_CAP_HEIGHT_RATIO, slot.h / font.widthOfTextAtSize(label, 1));
	const textWidth = font.widthOfTextAtSize(label, size);

	page.drawText(label, {
		x: slot.x,
		y: slot.y + (slot.h - textWidth) / 2,
		size,
		font,
		rotate: degrees(90),
		color: rgb(0.08, 0.08, 0.08)
	});
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
	// Clamped to just inside half the gap: at tight sheet spacings the full
	// clearance would push neighbouring groups' boxes into one another, and two
	// overlapping boxes read as one box around both groups.
	const halfGapMm = Math.min(options.layout.gapXMm, options.layout.gapYMm) / 2;
	const margin = mm(
		Math.min(options.bleedMm + GROUP_BOX_CLEARANCE_BEYOND_BLEED_MM, halfGapMm - 0.25)
	);
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
