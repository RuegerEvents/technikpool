import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { groupBillingItems, lineSubtitle, type GroupableItem } from '../billing-lines.ts';

type PdfOrganization = {
	name: string;
	address: { line1: string; line2: string | null; postalCode: string; city: string } | null;
	taxId: string | null;
	billingEmail: string | null;
	billingWebsite: string | null;
	bankAccountHolder: string | null;
	iban: string | null;
	bic: string | null;
	bankName: string | null;
	isKleinunternehmer?: boolean;
};
/**
 * The issuing-org columns snapshotted onto Offer and Invoice rows. Documents
 * render from these, never from the live Organization — an org moving offices
 * must not rewrite an already-issued document.
 */
export type OrgSnapshot = {
	orgName: string;
	orgAddressLine1: string | null;
	orgAddressLine2: string | null;
	orgPostalCode: string | null;
	orgCity: string | null;
	orgTaxId: string | null;
	orgBillingEmail: string | null;
	orgBillingWebsite: string | null;
	orgBankAccountHolder: string | null;
	orgBankName: string | null;
	orgIban: string | null;
	orgBic: string | null;
	isKleinunternehmerSnapshot: boolean;
};

export function organizationFromSnapshot(doc: OrgSnapshot): PdfOrganization {
	return {
		name: doc.orgName,
		address:
			doc.orgAddressLine1 && doc.orgPostalCode && doc.orgCity
				? {
						line1: doc.orgAddressLine1,
						line2: doc.orgAddressLine2,
						postalCode: doc.orgPostalCode,
						city: doc.orgCity
					}
				: null,
		taxId: doc.orgTaxId,
		billingEmail: doc.orgBillingEmail,
		billingWebsite: doc.orgBillingWebsite,
		bankAccountHolder: doc.orgBankAccountHolder,
		iban: doc.orgIban,
		bic: doc.orgBic,
		bankName: doc.orgBankName,
		isKleinunternehmer: doc.isKleinunternehmerSnapshot
	};
}

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

function safe(value: string) {
	return value
		.replace(/[„“”]/g, '"')
		.replace(/[‘’]/g, "'")
		.replace(/[–—]/g, '-')
		.replace(/[^\x20-\xFF\u20AC]/g, '?');
}

function validateDocument(kind: 'offer' | 'invoice', data: PdfDocumentData) {
	const missing: string[] = [];
	const required = (value: unknown, label: string) => {
		if (typeof value === 'string' ? !value.trim() : value === null || value === undefined)
			missing.push(label);
	};
	required(data.organization.name, 'organization name');
	required(data.organization.address?.line1, 'organization street address');
	required(data.organization.address?.postalCode, 'organization postal code');
	required(data.organization.address?.city, 'organization city');
	required(data.organization.billingEmail, 'organization billing email');
	if (!data.organization.isKleinunternehmer)
		required(data.organization.taxId, 'organization tax ID');
	required(data.organization.bankAccountHolder, 'bank account holder');
	required(data.organization.bankName, 'bank name');
	required(data.organization.iban, 'IBAN');
	required(data.organization.bic, 'BIC');
	required(data.customerName, 'customer name');
	required(data.customerAddress, 'customer address');
	required(data.serviceStartDate, 'service start date');
	required(data.serviceEndDate, 'service end date');
	required(data.introText, 'introduction text');
	required(data.closingText, 'closing text');
	required(data.issueDate ?? data.createdAt, 'document date');
	required(data.number, kind === 'invoice' ? 'invoice number' : 'offer number');
	if (!Number.isInteger(data.paymentTermsDays) || data.paymentTermsDays < 0)
		missing.push('valid payment terms');
	if (data.items.length === 0) missing.push('at least one line item');
	data.items.forEach((item, index) => {
		if (!item.description.trim()) missing.push(`description for line ${index + 1}`);
		if (!item.categoryName && !item.categoryNameDe) missing.push(`category for line ${index + 1}`);
		if (!Number.isFinite(Number(item.lineTotal))) missing.push(`valid total for line ${index + 1}`);
	});
	if (missing.length)
		throw new Error(
			`PDF cannot be generated. Missing required billing data: ${[...new Set(missing)].join(', ')}`
		);
}
function money(value: number) {
	return value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(value: Date | null | undefined) {
	return value ? value.toLocaleDateString('de-DE') : '';
}
function wrap(value: string, font: PDFFont, size: number, width: number) {
	const result: string[] = [];
	for (const paragraph of safe(value).split(/\r?\n/)) {
		let line = '';
		for (const word of paragraph.split(/\s+/).filter(Boolean)) {
			const candidate = line ? `${line} ${word}` : word;
			if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
			else {
				if (line) result.push(line);
				line = word;
			}
		}
		result.push(line);
	}
	return result;
}

export async function generateBillingPdf(
	kind: 'offer' | 'invoice',
	data: PdfDocumentData,
	options: { draft?: boolean } = {}
) {
	validateDocument(kind, data);
	const pdf = await PDFDocument.create();
	const regular = await pdf.embedFont(StandardFonts.Helvetica);
	const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
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
		page.drawText(safe(value), { x, y: atY, size, font, color });
	};
	const right = (
		value: string,
		rightX: number,
		atY: number,
		size = 10,
		font = regular,
		color = black
	) => {
		const clean = safe(value);
		draw(clean, rightX - font.widthOfTextAtSize(clean, size), atY, size, font, color);
	};
	const pageTitle = () => {
		if (pageNumber > 1) draw(title, LEFT, H - 44, 11, bold);
	};
	const newPage = () => {
		page = pdf.addPage([W, H]);
		pageNumber++;
		y = pageNumber === 1 ? H - 58 : H - 72;
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
	const tableHeader = () => {
		ensure(28);
		page.drawRectangle({ x: LEFT, y: y - 5, width: CONTENT_W, height: 22, color: light });
		draw('Pos.', LEFT + 4, y + 2, 8.5, bold);
		draw('Bezeichnung', LEFT + 40, y + 2, 8.5, bold);
		right('Menge', 400, y + 2, 8.5, bold);
		right('Tage', 446, y + 2, 8.5, bold);
		right('Gesamt EUR', W - RIGHT - 4, y + 2, 8.5, bold);
		y -= 20;
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
	if (data.introText) paragraph(data.introText, 10, 13);
	tableHeader();

	for (const group of groups) {
		ensure(38, true);
		page.drawRectangle({
			x: LEFT,
			y: y - 3,
			width: CONTENT_W,
			height: 18,
			color: rgb(0.97, 0.97, 0.97)
		});
		draw(group.name, LEFT + 4, y + 2, 7.5, bold, muted);
		y -= 18;
		for (const line of group.lines) {
			position++;
			const subtitle = lineSubtitle(line);
			const labelLines = wrap(line.label, bold, 9, 270);
			const subtitleLines = subtitle ? wrap(subtitle, regular, 7.5, 270) : [];
			const rowHeight = Math.max(30, labelLines.length * 11 + subtitleLines.length * 9 + 15);
			ensure(rowHeight, true);
			draw(String(position), LEFT + 11, y - 1, 8.5);
			labelLines.forEach((value, i) => draw(value, LEFT + 40, y - 1 - i * 11, 9, bold));
			const subtitleY = y - 2 - labelLines.length * 11;
			subtitleLines.forEach((value, i) =>
				draw(value, LEFT + 40, subtitleY - i * 9, 7.5, regular, muted)
			);
			right(String(line.quantity), 400, y - 1, 8.5);
			right(String(data.dayCount), 446, y - 1, 8.5);
			right(money(line.lineTotal), W - RIGHT - 4, y - 1, 8.5);
			y -= rowHeight;
			page.drawLine({
				start: { x: LEFT, y: y + 8 },
				end: { x: W - RIGHT, y: y + 8 },
				thickness: 0.35,
				color: rgb(0.65, 0.65, 0.65)
			});
		}
		draw(`Zwischensumme ${group.name}`, 300, y, 7.5, regular, muted);
		right(money(group.subtotal), W - RIGHT - 4, y, 7.5, bold);
		y -= 18;
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
	ensure(totals.length * 17 + 30);
	for (const [label, value, strong] of totals) {
		if (strong)
			page.drawRectangle({ x: LEFT, y: y - 6, width: CONTENT_W, height: 22, color: light });
		draw(label, LEFT + 4, y, 9, strong ? bold : regular);
		right(money(value), W - RIGHT - 4, y, 9, strong ? bold : regular);
		y -= strong ? 28 : 17;
	}
	if (data.closingText) {
		y -= 3;
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
			[data.organization.taxId ? `USt-IdNr.: ${data.organization.taxId}` : null],
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
