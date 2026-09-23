import sharp from 'sharp';
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { getObject } from '$lib/server/storage';
import { embedInter } from './fonts';
import { fmtDate, safe, wrap } from './pdf-text.ts';
import { drawLogo, embedLogo } from './pdf-logo.ts';

export type DeliveryNoteLine = {
	label: string;
	subtitle: string | null;
	/** Asset tags (or serial numbers) of the units, bundle tags for a kit. */
	identifiers: string[];
	quantity: number;
	/** Object key of the product photo, or of the generated kit/unit preview. */
	imagePath: string | null;
};

export type DeliveryNoteGroup = { name: string; lines: DeliveryNoteLine[] };

export type DeliveryNoteData = {
	organization: {
		name: string;
		address: { line1: string; line2: string | null; postalCode: string; city: string } | null;
		email: string | null;
		website: string | null;
		/** Object key of the letterhead logo. */
		logoPath: string | null;
	};
	recipient: { name: string; contactPerson: string | null; address: string[] };
	customerNumber: string | null;
	productionName: string;
	/** Where the goods go, when that is not already the recipient's address. */
	venue: string[];
	startDate: Date | null;
	endDate: Date | null;
	groups: DeliveryNoteGroup[];
};

// Same sheet and margins as offers and invoices, so the three read as one set.
const W = 595.28;
const H = 841.89;
const LEFT = 72;
const RIGHT = 48;
const CONTENT_W = W - LEFT - RIGHT;
const FOOTER_TOP = 84;
const black = rgb(0.05, 0.05, 0.05);
const muted = rgb(0.35, 0.35, 0.35);
const light = rgb(0.93, 0.93, 0.93);
const rule = rgb(0.65, 0.65, 0.65);

// Columns, left to right.
const POS_X = LEFT + 4;
const IMG_X = LEFT + 30;
const IMG_W = 64;
const IMG_H = 48;
const QTY_RIGHT = IMG_X + IMG_W + 30;
const TEXT_X = QTY_RIGHT + 12;
const CHECK_RIGHT = W - RIGHT - 4;
const TEXT_W = CHECK_RIGHT - 44 - TEXT_X;

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
 * a 64pt thumbnail needs at print resolution instead of carrying it whole.
 * Flattened onto white: a JPEG has no alpha, and transparent pixels would
 * otherwise come out black.
 */
async function thumbnail(path: string): Promise<Uint8Array | null> {
	if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return null;
	try {
		const object = await getObject(path);
		if (!object.contentType.startsWith('image/')) return null;
		let bytes = Buffer.from(object.bytes);
		if (object.contentType === 'image/svg+xml') bytes = await withPngPhotos(bytes);
		return await sharp(bytes)
			.flatten({ background: '#ffffff' })
			.resize({ width: IMG_W * 4, height: IMG_H * 4, fit: 'inside', withoutEnlargement: true })
			.jpeg({ quality: 85 })
			.toBuffer();
	} catch (cause) {
		// A missing picture is a gap in one row, not a reason to refuse the note.
		console.warn(`Could not include image "${path}" in delivery note:`, cause);
		return null;
	}
}

export async function generateDeliveryNotePdf(data: DeliveryNoteData, issuedAt = new Date()) {
	const pdf = await PDFDocument.create();
	const { regular, bold } = await embedInter(pdf);
	const logo = await embedLogo(pdf, data.organization.logoPath);

	const paths = [
		...new Set(
			data.groups.flatMap((group) => group.lines.map((line) => line.imagePath).filter(Boolean))
		)
	] as string[];
	const images = new Map<string, PDFImage>();
	await Promise.all(
		paths.map(async (path) => {
			const bytes = await thumbnail(path);
			if (bytes) images.set(path, await pdf.embedJpg(bytes));
		})
	);

	const title = 'Lieferschein';
	let page!: PDFPage;
	let y = 0;
	let pageNumber = 0;
	let position = 0;

	const draw = (
		value: string,
		x: number,
		atY: number,
		size = 10,
		font = regular,
		color = black
	) => {
		page.drawText(safe(value, font), { x, y: atY, size, font, color });
	};
	const right = (
		value: string,
		rightX: number,
		atY: number,
		size = 10,
		font = regular,
		color = black
	) => {
		const clean = safe(value, font);
		draw(clean, rightX - font.widthOfTextAtSize(clean, size), atY, size, font, color);
	};
	const newPage = () => {
		page = pdf.addPage([W, H]);
		pageNumber++;
		y = pageNumber === 1 ? H - 58 : H - 64;
		if (pageNumber > 1) draw(`${title} - ${data.productionName}`, LEFT, H - 44, 11, bold);
	};
	const ensure = (height: number, repeatTableHeader = false) => {
		if (y - height >= FOOTER_TOP + 10) return;
		newPage();
		if (repeatTableHeader) tableHeader();
	};
	const paragraph = (value: string, size = 10, gap = 10) => {
		const lines = wrap(value, regular, size, CONTENT_W);
		ensure(lines.length * (size + 3) + gap);
		for (const line of lines) {
			draw(line, LEFT, y, size);
			y -= size + 3;
		}
		y -= gap;
	};
	// As in the billing documents: inside the table `y` is the top edge of the
	// next block, and text sits by its cap height.
	const capHeight = (font: PDFFont, size: number) => font.heightAtSize(size, { descender: false });
	const bandBaseline = (top: number, height: number, font: PDFFont, size: number) =>
		top - (height + capHeight(font, size)) / 2;
	const HEADER_H = 18;
	const GROUP_H = 15;
	const ROW_PAD = 6;
	const tableHeader = () => {
		ensure(HEADER_H + 6);
		page.drawRectangle({
			x: LEFT,
			y: y - HEADER_H,
			width: CONTENT_W,
			height: HEADER_H,
			color: light
		});
		const baseline = bandBaseline(y, HEADER_H, bold, 8.5);
		draw('Pos.', POS_X, baseline, 8.5, bold);
		draw('Bild', IMG_X, baseline, 8.5, bold);
		right('Menge', QTY_RIGHT, baseline, 8.5, bold);
		draw('Bezeichnung', TEXT_X, baseline, 8.5, bold);
		right('Geprüft', CHECK_RIGHT, baseline, 8.5, bold);
		y -= HEADER_H;
	};

	newPage();
	// Letterhead: sender line + recipient left, document metadata right.
	const org = data.organization;
	const senderAddress = org.address
		? `${org.name}, ${org.address.line1}, ${org.address.postalCode} ${org.address.city}`
		: org.name;
	for (const line of wrap(senderAddress, regular, 7.2, 260)) {
		draw(line, LEFT, y, 7.2);
		y -= 9;
	}
	page.drawLine({
		start: { x: LEFT, y: y + 5 },
		end: { x: LEFT + 260, y: y + 5 },
		thickness: 0.45
	});
	y -= 14;
	for (const line of wrap(data.recipient.name, bold, 11, 260)) {
		draw(line, LEFT, y, 11, bold);
		y -= 14;
	}
	for (const line of [data.recipient.contactPerson, ...data.recipient.address]) {
		if (!line) continue;
		draw(line, LEFT, y, 9.5);
		y -= 13;
	}

	// Logo top right, the metadata below it — as on offers and invoices.
	let metaY = logo ? drawLogo(page, logo, W - RIGHT) - 22 : H - 58;
	const META_VALUE_W = 110;
	const meta = (label: string, value: string | string[]) => {
		draw(label, 360, metaY, 8.5, bold);
		const lines = (Array.isArray(value) ? value : [value]).flatMap((v) =>
			wrap(v, regular, 8.5, META_VALUE_W)
		);
		for (const line of lines) {
			right(line, W - RIGHT, metaY, 8.5);
			metaY -= 11;
		}
		metaY -= 2;
	};
	meta('Datum:', fmtDate(issuedAt));
	if (data.customerNumber) meta('Kundennr.:', data.customerNumber);
	meta('Produktion:', data.productionName);
	if (data.startDate)
		meta('Zeitraum:', [fmtDate(data.startDate), `bis ${fmtDate(data.endDate ?? data.startDate)}`]);
	if (data.venue.length) meta('Lieferort:', data.venue);

	y = Math.min(y, metaY - 20, H - 190);
	draw(title, LEFT, y, 19, regular);
	y -= 30;
	paragraph(`Für die Produktion "${data.productionName}" liefern wir Ihnen:`, 10, 3);
	tableHeader();

	if (data.groups.length === 0) {
		y -= 16;
		draw('Dieser Produktion ist noch keine Ausrüstung zugeordnet.', LEFT + 4, y, 9, regular, muted);
		y -= 10;
	}

	let unitCount = 0;
	for (const group of data.groups) {
		ensure(GROUP_H + IMG_H + ROW_PAD * 2, true);
		page.drawRectangle({
			x: LEFT,
			y: y - GROUP_H,
			width: CONTENT_W,
			height: GROUP_H,
			color: rgb(0.97, 0.97, 0.97)
		});
		draw(group.name, LEFT + 4, bandBaseline(y, GROUP_H, bold, 7.5), 7.5, bold, muted);
		y -= GROUP_H;
		for (const line of group.lines) {
			position++;
			unitCount += line.quantity;
			// Each text line with the distance from the baseline above it: the
			// name, then what it consists of, then the tags of the units.
			const text = [
				...wrap(line.label, bold, 9, TEXT_W).map((value, i) => ({
					value,
					size: 9,
					font: bold,
					color: black,
					gap: i === 0 ? 0 : 11
				})),
				...(line.subtitle ? wrap(line.subtitle, regular, 7.5, TEXT_W) : []).map((value, i) => ({
					value,
					size: 7.5,
					font: regular,
					color: muted,
					gap: i === 0 ? 11 : 9
				})),
				...(line.identifiers.length
					? wrap(`Nr. ${line.identifiers.join(', ')}`, regular, 7, TEXT_W)
					: []
				).map((value, i) => ({
					value,
					size: 7,
					font: regular,
					color: muted,
					gap: i === 0 ? 10 : 8.5
				}))
			];
			const firstBaseline = ROW_PAD + capHeight(bold, 9);
			const textHeight = firstBaseline + text.reduce((sum, t) => sum + t.gap, 0) + ROW_PAD + 2;
			const rowHeight = Math.max(textHeight, IMG_H + ROW_PAD * 2);
			ensure(rowHeight, true);
			const top = y;
			let baseline = top - firstBaseline;
			draw(String(position), POS_X + 7, baseline, 8.5);
			right(`${line.quantity}x`, QTY_RIGHT, baseline, 9, bold);
			for (const t of text) {
				baseline -= t.gap;
				draw(t.value, TEXT_X, baseline, t.size, t.font, t.color);
			}
			const image = line.imagePath ? images.get(line.imagePath) : undefined;
			if (image) {
				const { width, height } = image.scaleToFit(IMG_W, IMG_H);
				page.drawImage(image, {
					x: IMG_X + (IMG_W - width) / 2,
					y: top - ROW_PAD - IMG_H + (IMG_H - height) / 2,
					width,
					height
				});
			}
			// A box to tick per line when the goods are counted at hand-over.
			page.drawRectangle({
				x: CHECK_RIGHT - 20,
				y: top - ROW_PAD - 10,
				width: 10,
				height: 10,
				borderColor: black,
				borderWidth: 0.6
			});
			y -= rowHeight;
			page.drawLine({
				start: { x: LEFT, y },
				end: { x: W - RIGHT, y },
				thickness: 0.35,
				color: rule
			});
		}
	}

	if (data.groups.length) {
		const TOTAL_H = 18;
		ensure(TOTAL_H + 4);
		y -= 4;
		page.drawRectangle({
			x: LEFT,
			y: y - TOTAL_H,
			width: CONTENT_W,
			height: TOTAL_H,
			color: light
		});
		const baseline = bandBaseline(y, TOTAL_H, bold, 9);
		draw(
			`${position} ${position === 1 ? 'Position' : 'Positionen'}, ${unitCount} Stück`,
			LEFT + 4,
			baseline,
			9,
			bold
		);
		y -= TOTAL_H;
	}

	// Hand-over: the note travels with the goods and is signed on both sides.
	y -= 24;
	paragraph(
		'Bitte prüfen Sie die Lieferung bei Übernahme auf Vollständigkeit und sichtbare Schäden. ' +
			'Fehlende oder beschädigte Teile vermerken Sie bitte auf diesem Lieferschein.',
		9,
		9
	);
	paragraph(
		'Die Ware wird dem Empfänger vorübergehend zur Nutzung überlassen, für sämtliche Schäden ' +
			'während der Nutzungsdauer haftet der Empfänger.\n' +
			'Wir freuen uns auf Ihre Rückmeldung und stehen für Fragen gerne zur Verfügung.',
		9,
		0
	);
	const SIGN_H = 70;
	ensure(SIGN_H);
	const signWidth = (CONTENT_W - 36) / 2;
	const lineY = y - 46;
	for (const [index, label] of ['Übergeben', 'Übernommen'].entries()) {
		const x = LEFT + index * (signWidth + 36);
		page.drawLine({
			start: { x, y: lineY },
			end: { x: x + signWidth, y: lineY },
			thickness: 0.6
		});
		draw(`${label}: Datum, Name, Unterschrift`, x, lineY - 11, 7.5, regular, muted);
	}
	y = lineY - 20;

	const pages = pdf.getPages();
	pages.forEach((pdfPage, index) => {
		pdfPage.drawLine({ start: { x: LEFT, y: 74 }, end: { x: W - RIGHT, y: 74 }, thickness: 0.5 });
		const footerColumn = (values: Array<string | null | undefined>, x: number, width: number) => {
			let fy = 62;
			for (const value of values.filter(Boolean) as string[]) {
				for (const line of wrap(value, regular, 6.6, width)) {
					pdfPage.drawText(line, { x, y: fy, size: 6.6, font: regular, color: black });
					fy -= 8;
				}
			}
		};
		footerColumn(
			[
				org.name,
				org.address?.line1,
				org.address ? `${org.address.postalCode} ${org.address.city}` : null
			],
			LEFT,
			150
		);
		footerColumn([org.email, org.website], 245, 150);
		pdfPage.drawText(`Seite ${index + 1}/${pages.length}`, {
			x: W - 80,
			y: 16,
			size: 6.8,
			font: regular
		});
	});

	pdf.setTitle(`${title} - ${data.productionName}`);
	pdf.setProducer('Technikpool');
	return pdf.save();
}
