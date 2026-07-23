import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { normalizeOptions, parseHexColor, type RawGeneratorOptions } from './config';
import { createDataMatrixPng } from './datamatrix';
import { paginateStickers } from './items';
import type { GeneratorOptions, PageSticker, SheetPage } from './types';
import { mm } from './units';

interface LogoAsset {
	text?: string;
}

export async function generateStickerSheet(rawOptions: RawGeneratorOptions): Promise<Uint8Array> {
	const options = normalizeOptions(rawOptions);
	const pdfDoc = await PDFDocument.create();
	pdfDoc.setTitle('Stickerbogen');
	pdfDoc.setCreator('stickerbogen-generator');
	pdfDoc.setProducer('stickerbogen-generator');

	const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
	const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
	const logo = loadLogo(options);
	const pages = paginateStickers(options);

	for (const sheetPage of pages) {
		const page = pdfDoc.addPage([mm(options.layout.pageWidthMm), mm(options.layout.pageHeightMm)]);
		drawHeader(page, sheetPage, options, font, boldFont);
		for (const sticker of sheetPage.stickers) {
			await drawSticker(pdfDoc, page, sticker, options, font, logo);
		}
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
	const stickers = sheetPage.stickers;
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
		const ax = x - mm(6);
		const ay = pageHeight - mm(7.2);
		const bx = x - mm(3);
		const by = pageHeight - mm(2.2);
		const cx = x;
		const cy = ay;
		page.drawSvgPath(`M ${ax} ${ay} L ${bx} ${by} L ${cx} ${cy} Z`, { color: rgb(0, 0.42, 0.8) });
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

async function drawSticker(
	pdfDoc: PDFDocument,
	page: PDFPage,
	sticker: PageSticker,
	options: GeneratorOptions,
	font: PDFFont,
	logo: LogoAsset
): Promise<void> {
	const x = mm(sticker.xMm);
	const y = page.getHeight() - mm(sticker.yMm + options.size.heightMm);
	const w = mm(options.size.widthMm);
	const h = mm(options.size.heightMm);
	const color = parseHexColor(options.color);
	const fill = rgb(color.r, color.g, color.b);

	if (options.type === 'quadratisch') {
		page.drawRectangle({ x, y, width: w, height: h, color: fill });
	} else {
		drawFlag(page, x, y, w, h, mm(options.size.flagTailMm ?? 0), fill);
	}

	if (options.showCutLines) {
		page.drawRectangle({
			x,
			y,
			width: w,
			height: h,
			borderWidth: 0.25,
			borderColor: rgb(0.2, 0.2, 0.2)
		});
	}

	const quiet = mm(options.quietZoneMm);
	const matrixSize = Math.min(w, h) * options.matrixScale;
	const matrixPng = await createDataMatrixPng(sticker.payload);
	const matrixImage = await pdfDoc.embedPng(matrixPng);
	const matrixX = x + quiet;
	const matrixY = y + h - quiet - matrixSize;
	page.drawRectangle({
		x: matrixX - mm(0.25),
		y: matrixY - mm(0.25),
		width: matrixSize + mm(0.5),
		height: matrixSize + mm(0.5),
		color: rgb(1, 1, 1)
	});
	page.drawImage(matrixImage, { x: matrixX, y: matrixY, width: matrixSize, height: matrixSize });

	const labelText = sticker.label;
	page.drawText(labelText, {
		x: matrixX,
		y: y + mm(0.8),
		size: Math.min(5.2, h * 0.18),
		font,
		color: rgb(1, 1, 1)
	});

	drawLogoMark(page, x, y, w, h, options, font, logo);
}

function drawFlag(
	page: PDFPage,
	x: number,
	y: number,
	w: number,
	h: number,
	tail: number,
	fill: ReturnType<typeof rgb>
): void {
	const foldY = y + h * 0.5;
	const tailW = Math.min(tail, w * 0.45);
	const bodyW = w - tailW;
	page.drawRectangle({ x, y, width: bodyW, height: h, color: fill });
	page.drawRectangle({
		x: x + bodyW,
		y: foldY - h * 0.16,
		width: tailW,
		height: h * 0.32,
		color: fill
	});
	page.drawLine({
		start: { x, y: foldY },
		end: { x: x + bodyW, y: foldY },
		thickness: 0.45,
		color: rgb(1, 1, 1),
		dashArray: [mm(1.8), mm(1.6)]
	});
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
