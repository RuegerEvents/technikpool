import { PDFDocument, rgb } from 'pdf-lib';
import { embedInter } from './fonts';
import { safe } from './pdf-text.ts';
import { drawMarkdown, Layout } from './pdf-markdown.ts';

// An organization's acceptance of the data processing agreement, as a PDF: a
// record of who accepted which version, when, for whom, followed by the text
// they accepted. Written once at acceptance (see acceptDpa), stored, and mailed
// to the person who accepted — the copy each side keeps.
//
// The text is the operator's Markdown, set by ./pdf-markdown.ts.
// Printed in German, like every generated document, whatever language the
// reader used the app in.

export type DpaPdfData = {
	orgName: string;
	orgAddress: string | null;
	userName: string;
	userEmail: string;
	acceptedAt: Date;
	versionHash: string;
	instanceUrl: string;
	body: string;
};

const W = 595.28;
const LEFT = 64;
const RIGHT = 64;
const TOP = 64;
const BOTTOM = 64;
const CONTENT_W = W - LEFT - RIGHT;
const muted = rgb(0.4, 0.4, 0.4);
const rule = rgb(0.82, 0.82, 0.82);

function fmtDateTime(value: Date) {
	return value.toLocaleString('de-DE', {
		dateStyle: 'long',
		timeStyle: 'short',
		timeZone: 'Europe/Berlin'
	});
}

export async function generateDpaPdf(data: DpaPdfData): Promise<Uint8Array> {
	const pdf = await PDFDocument.create();
	pdf.setTitle(`Auftragsverarbeitungsvertrag – ${data.orgName}`);
	pdf.setCreator('Technikpool');
	const fonts = await embedInter(pdf);
	const layout = new Layout(pdf, fonts, { left: LEFT, right: RIGHT, top: TOP, bottom: BOTTOM });

	// The record: the part of the contract the text leaves to the acceptance.
	layout.text('Auftragsverarbeitungsvertrag', { size: 18, font: fonts.bold, lead: 24 });
	layout.text('Nachweis der Annahme', { size: 11, color: muted });
	layout.gap(10);

	const rows: [string, string][] = [
		['Auftraggeber', data.orgName],
		['Anschrift', data.orgAddress ?? '–'],
		['Angenommen von', `${data.userName} (${data.userEmail})`],
		['Angenommen am', fmtDateTime(data.acceptedAt)],
		['Instanz', data.instanceUrl],
		['Fassung (SHA-256)', data.versionHash]
	];
	const labelW = 110;
	const boxTop = layout.y;
	layout.gap(8);
	for (const [label, value] of rows) {
		const y = layout.y;
		layout.text(label, { size: 9, color: muted, x: LEFT + 10, width: labelW });
		const after = layout.y;
		layout.y = y;
		layout.text(value, {
			size: 9,
			font: label === 'Fassung (SHA-256)' ? fonts.regular : fonts.bold,
			x: LEFT + 10 + labelW,
			width: CONTENT_W - labelW - 20
		});
		layout.y = Math.min(layout.y, after);
	}
	layout.gap(8);
	layout.page.drawRectangle({
		x: LEFT,
		y: layout.y,
		width: CONTENT_W,
		height: boxTop - layout.y,
		borderColor: rule,
		borderWidth: 0.75
	});
	layout.gap(18);

	drawMarkdown(layout, fonts, data.body);

	// Footer on every page: which version and where in it, so a single printed
	// page still says what it belongs to.
	const total = layout.pages.length;
	layout.pages.forEach((page, i) => {
		const footer = safe(
			`${data.orgName} · Fassung ${data.versionHash.slice(0, 12)} · Seite ${i + 1} von ${total}`,
			fonts.regular
		);
		page.drawText(footer, { x: LEFT, y: BOTTOM / 2, size: 7.5, font: fonts.regular, color: muted });
	});

	return pdf.save();
}
