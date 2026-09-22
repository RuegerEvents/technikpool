import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { groupBillingItems, lineSubtitle, type GroupableItem } from '../billing-lines.ts';
import { appError } from '$lib/errors';
import { billingDocumentIssues } from '../billing-document-check.svelte.ts';
import type { SnapshotOrganization } from '../org-snapshot.ts';
import { embedInter } from './fonts';
import { fmtDate, safe, wrap } from './pdf-text.ts';
import { formatQuantity } from '../service-lines.svelte.ts';

type PdfOrganization = SnapshotOrganization;

type PdfDocumentData = {
	number?: string;
	createdAt?: Date;
	issueDate?: Date;
	customerName: string;
	customerAddress: string | null;
	customerContactPerson: string | null;
	customerNumber: string | null;
	serviceStartDate: Date | null;
	serviceEndDate: Date | null;
	introText: string | null;
	closingText: string | null;
	paymentTermsDays: number;
	dayCount: number;
	discountType: string | null;
	discountValue: unknown;
	vatRatePercent: unknown;
	organization: PdfOrganization;
	items: GroupableItem[];
};

const W = 595.28;
const H = 841.89;
const LEFT = 72;
const RIGHT = 48;
const CONTENT_W = W - LEFT - RIGHT;
const FOOTER_TOP = 84;
const black = rgb(0.05, 0.05, 0.05);
const muted = rgb(0.35, 0.35, 0.35);
const light = rgb(0.93, 0.93, 0.93);

function validateDocument(kind: 'offer' | 'invoice', data: PdfDocumentData) {
	const issues = billingDocumentIssues(kind, data);
	if (issues.length)
		appError(400, 'billing_pdf_data_missing', [issues.map((issue) => issue.label).join(', ')]);
}

// A document prints in German whatever language its issuer reads the app in.
function unitLabel(unit: string | null, quantity: number) {
	switch (unit) {
		case 'hour':
			return 'Std.';
		case 'day':
			return quantity === 1 ? 'Tag' : 'Tage';
		case 'flat':
			return 'pauschal';
		case 'piece':
			return 'Stk.';
		default:
			return unit ?? '';
	}
}

function money(value: number) {
	return value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export async function generateBillingPdf(
	kind: 'offer' | 'invoice',
	data: PdfDocumentData,
	options: { draft?: boolean } = {}
) {
	validateDocument(kind, data);
	const pdf = await PDFDocument.create();
	const { regular, bold } = await embedInter(pdf);
	const groups = groupBillingItems(
		data.items,
		(item) => item.categoryNameDe || item.categoryName || 'Ohne Kategorie'
	);
	const title =
		kind === 'invoice'
			? `Rechnung${data.number ? ` ${data.number}` : ''}`
			: `Angebot${data.number ? ` ${data.number}` : ''}`;
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
	const pageTitle = () => {
		if (pageNumber > 1) draw(title, LEFT, H - 44, 11, bold);
	};
	const newPage = () => {
		page = pdf.addPage([W, H]);
		pageNumber++;
		y = pageNumber === 1 ? H - 58 : H - 64;
		pageTitle();
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
	// Inside the table and the totals, `y` is the top edge of the next block, not
	// a baseline, so the space above and below every rule and band can be read
	// straight off the constants. Text is placed by its cap height: centring the
	// full font box would sit it low, since the descender space carries no ink in
	// labels like these.
	const capHeight = (font: PDFFont, size: number) => font.heightAtSize(size, { descender: false });
	const bandBaseline = (top: number, height: number, font: PDFFont, size: number) =>
		top - (height + capHeight(font, size)) / 2;
	const HEADER_H = 18;
	const GROUP_H = 15;
	const ROW_PAD_TOP = 5;
	const ROW_PAD_BOTTOM = 6;
	const SUBTOTAL_H = ROW_PAD_TOP + capHeight(regular, 7.5) + 11;
	const TOTAL_ROW_H = 14;
	const GRAND_TOTAL_H = 18;
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
		draw('Pos.', LEFT + 4, baseline, 8.5, bold);
		draw('Bezeichnung', LEFT + 40, baseline, 8.5, bold);
		right('Menge', 400, baseline, 8.5, bold);
		right('Tage', 446, baseline, 8.5, bold);
		right('Gesamt EUR', W - RIGHT - 4, baseline, 8.5, bold);
		y -= HEADER_H;
	};

	newPage();
	// Letterhead: sender line + recipient left, document metadata right.
	const senderAddress = data.organization.address
		? `${data.organization.name}, ${data.organization.address.line1}, ${data.organization.address.postalCode} ${data.organization.address.city}`
		: data.organization.name;
	const senderLines = wrap(senderAddress, regular, 7.2, 260);
	for (const line of senderLines) {
		draw(line, LEFT, y, 7.2);
		y -= 9;
	}
	page.drawLine({
		start: { x: LEFT, y: y + 5 },
		end: { x: LEFT + 260, y: y + 5 },
		thickness: 0.45
	});
	y -= 14;
	draw(data.customerName, LEFT, y, 11, bold);
	y -= 14;
	if (data.customerContactPerson) {
		draw(data.customerContactPerson, LEFT, y, 9.5);
		y -= 13;
	}
	if (data.customerAddress)
		for (const line of data.customerAddress.split(/\r?\n|\s+·\s+/)) {
			draw(line, LEFT, y, 9.5);
			y -= 13;
		}

	let metaY = H - 58;
	const meta = (label: string, value: string) => {
		draw(label, 360, metaY, 8.5, bold);
		right(value, W - RIGHT, metaY, 8.5);
		metaY -= 13;
	};
	if (data.number) meta(kind === 'invoice' ? 'Rechnungsnr.:' : 'Angebotsnr.:', data.number);
	if (data.customerNumber) meta('Kundennr.:', data.customerNumber);
	meta('Datum:', fmtDate(data.issueDate ?? data.createdAt));
	if (data.serviceStartDate) {
		meta('Leistungszeitraum:', fmtDate(data.serviceStartDate));
		meta('', `bis ${fmtDate(data.serviceEndDate ?? data.serviceStartDate)}`);
	}

	y = Math.min(y, H - 190);
	draw(title, LEFT, y, 19, regular);
	y -= 30;
	// paragraph() leaves `y` at the next baseline; the table starts from there.
	if (data.introText) paragraph(data.introText, 10, 3);
	tableHeader();

	for (const group of groups) {
		ensure(GROUP_H + 30, true);
		page.drawRectangle({
			x: LEFT,
			y: y - GROUP_H,
			width: CONTENT_W,
			height: GROUP_H,
			color: rgb(0.97, 0.97, 0.97)
		});
		draw(group.name, LEFT + 4, bandBaseline(y, GROUP_H, bold, 7.5), 7.5, bold, muted);
		y -= GROUP_H;
		for (const [lineIndex, line] of group.lines.entries()) {
			position++;
			const service = line.service;
			const subtitle = service
				? [
						lineSubtitle(line),
						service.unit === 'flat'
							? ''
							: `Einzelpreis ${money(service.unitPrice)} EUR / ${unitLabel(service.unit, 1)}`
					]
						.filter(Boolean)
						.join('\n')
				: lineSubtitle(line);
			// A service's quantity carries its unit and needs the room.
			const labelWidth = service ? 235 : 270;
			const labelLines = wrap(line.label, bold, 9, labelWidth);
			const subtitleLines = subtitle ? wrap(subtitle, regular, 7.5, labelWidth) : [];
			// Offsets below the row's first baseline.
			const subtitleOffset = (labelLines.length - 1) * 11 + 11;
			const lastOffset = subtitleLines.length
				? subtitleOffset + (subtitleLines.length - 1) * 9
				: (labelLines.length - 1) * 11;
			const firstBaseline = ROW_PAD_TOP + capHeight(bold, 9);
			const rowHeight = firstBaseline + lastOffset + ROW_PAD_BOTTOM;
			// The last line pulls the group subtotal onto its page with it.
			const isLast = lineIndex === group.lines.length - 1;
			ensure(rowHeight + (isLast ? SUBTOTAL_H : 0), true);
			const baseline = y - firstBaseline;
			draw(String(position), LEFT + 11, baseline, 8.5);
			labelLines.forEach((value, i) => draw(value, LEFT + 40, baseline - i * 11, 9, bold));
			subtitleLines.forEach((value, i) =>
				draw(value, LEFT + 40, baseline - subtitleOffset - i * 9, 7.5, regular, muted)
			);
			right(
				service
					? `${formatQuantity(line.quantity)} ${unitLabel(service.unit, line.quantity)}`
					: String(line.quantity),
				400,
				baseline,
				8.5
			);
			// Only what is billed per day was multiplied by the days.
			if (!service || service.perDay) right(String(data.dayCount), 446, baseline, 8.5);
			right(money(line.lineTotal), W - RIGHT - 4, baseline, 8.5);
			y -= rowHeight;
			page.drawLine({
				start: { x: LEFT, y },
				end: { x: W - RIGHT, y },
				thickness: 0.35,
				color: rgb(0.65, 0.65, 0.65)
			});
		}
		const subtotalBaseline = y - ROW_PAD_TOP - capHeight(regular, 7.5);
		draw(`Zwischensumme ${group.name}`, 300, subtotalBaseline, 7.5, regular, muted);
		right(money(group.subtotal), W - RIGHT - 4, subtotalBaseline, 7.5, bold);
		y -= SUBTOTAL_H;
	}

	const subtotal = data.items.reduce((sum, item) => sum + Number(item.lineTotal), 0);
	const discount =
		data.discountType === 'PERCENT'
			? subtotal * (Number(data.discountValue ?? 0) / 100)
			: Math.min(subtotal, Number(data.discountValue ?? 0));
	const net = subtotal - discount;
	const vatRate = Number(data.vatRatePercent);
	const vat = net * (vatRate / 100);
	const totals: [string, number, boolean][] = [['Zwischensumme (netto)', subtotal, false]];
	if (discount)
		totals.push([
			data.discountType === 'PERCENT'
				? `abzgl. ${Number(data.discountValue).toLocaleString('de-DE', { minimumFractionDigits: 2 })} % Rabatt`
				: 'abzgl. Rabatt',
			-discount,
			false
		]);
	totals.push(
		['Gesamt (netto)', net, false],
		[`Umsatzsteuer ${vatRate.toLocaleString('de-DE')} %`, vat, false],
		['Gesamtbetrag', net + vat, true]
	);
	ensure(totals.length * TOTAL_ROW_H + GRAND_TOTAL_H);
	for (const [label, value, strong] of totals) {
		const font = strong ? bold : regular;
		const height = strong ? GRAND_TOTAL_H : TOTAL_ROW_H;
		if (strong) {
			y -= 3;
			page.drawRectangle({ x: LEFT, y: y - height, width: CONTENT_W, height, color: light });
		}
		const baseline = bandBaseline(y, height, font, 9);
		draw(label, LEFT + 4, baseline, 9, font);
		right(money(value), W - RIGHT - 4, baseline, 9, font);
		y -= height;
	}
	if (data.closingText) {
		// Back from a top edge to the baseline paragraph() expects.
		y -= 14 + capHeight(regular, 9);
		paragraph(data.closingText, 9, 0);
	}

	// Stable three-column footer and real page counters on every page.
	const pages = pdf.getPages();
	pages.forEach((pdfPage, index) => {
		if (options.draft) {
			const watermark = 'ENTWURF';
			const size = 68;
			const width = bold.widthOfTextAtSize(watermark, size);
			const height = bold.heightAtSize(size);
			const angle = 32;
			const radians = (angle * Math.PI) / 180;
			const rotatedCenterX = (width * Math.cos(radians) - height * Math.sin(radians)) / 2;
			const rotatedCenterY = (width * Math.sin(radians) + height * Math.cos(radians)) / 2;
			pdfPage.drawText(watermark, {
				x: W / 2 - rotatedCenterX,
				y: H / 2 - rotatedCenterY,
				size,
				font: bold,
				color: rgb(0.45, 0.45, 0.45),
				opacity: 0.12,
				rotate: degrees(angle)
			});
		}
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
				data.organization.name,
				data.organization.address?.line1,
				data.organization.address
					? `${data.organization.address.postalCode} ${data.organization.address.city}`
					: null,
				data.organization.billingEmail,
				data.organization.billingWebsite
			],
			LEFT,
			150
		);
		footerColumn(
			[
				data.organization.taxNumber ? `Steuernummer: ${data.organization.taxNumber}` : null,
				data.organization.vatId ? `USt-IdNr.: ${data.organization.vatId}` : null
			],
			245,
			125
		);
		footerColumn(
			[
				data.organization.bankAccountHolder ?? data.organization.name,
				data.organization.bankName,
				data.organization.iban ? `IBAN: ${data.organization.iban}` : null,
				data.organization.bic ? `BIC: ${data.organization.bic}` : null
			],
			395,
			W - RIGHT - 395
		);
		pdfPage.drawText(`Seite ${index + 1}/${pages.length}`, {
			x: W - 80,
			y: 16,
			size: 6.8,
			font: regular
		});
	});

	pdf.setTitle(title);
	pdf.setProducer('Technikpool');
	return pdf.save();
}
