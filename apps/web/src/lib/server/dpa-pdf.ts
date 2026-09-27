import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { Lexer, type Token, type Tokens } from 'marked';
import { embedInter } from './fonts';
import { safe, wrap } from './pdf-text.ts';

// An organization's acceptance of the data processing agreement, as a PDF: a
// record of who accepted which version, when, for whom, followed by the text
// they accepted. Written once at acceptance (see acceptDpa), stored, and mailed
// to the person who accepted — the copy each side keeps.
//
// The text is the operator's Markdown, laid out block by block from marked's
// lexer: headings, paragraphs, lists, tables, quotes and rules, which is what
// the templates in docs/legal use. Inline emphasis is set as plain text; the
// document is read for what it says, and a word in bold is still the word.
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
const H = 841.89;
const LEFT = 64;
const RIGHT = 64;
const TOP = 64;
const BOTTOM = 64;
const CONTENT_W = W - LEFT - RIGHT;
const black = rgb(0.05, 0.05, 0.05);
const muted = rgb(0.4, 0.4, 0.4);
const rule = rgb(0.82, 0.82, 0.82);
const tint = rgb(0.96, 0.96, 0.96);

type Fonts = { regular: PDFFont; bold: PDFFont };

// Inline tokens flattened to the text they read as. A link keeps its address
// when that says something the label doesn't, since a printed link can't be
// clicked.
function inlineText(tokens: Token[] | undefined): string {
	if (!tokens) return '';
	return tokens
		.map((token) => {
			switch (token.type) {
				case 'link': {
					const label = inlineText(token.tokens);
					return label && label !== token.href ? `${label} (${token.href})` : token.href;
				}
				case 'br':
					return '\n';
				case 'image':
					return token.text;
				case 'text':
					// A newline inside a paragraph is where the source was wrapped, not
					// a break (see `breaks: false` in markdown.ts); wrap() would start a
					// new line at each one.
					return token.tokens
						? inlineText(token.tokens)
						: String(token.text).replace(/\s*\n\s*/g, ' ');
				default:
					return 'tokens' in token && token.tokens
						? inlineText(token.tokens)
						: 'text' in token
							? String(token.text)
							: '';
			}
		})
		.join('');
}

class Layout {
	pages: PDFPage[] = [];
	page!: PDFPage;
	y = 0;

	constructor(
		private pdf: PDFDocument,
		private fonts: Fonts
	) {
		this.newPage();
	}

	newPage() {
		this.page = this.pdf.addPage([W, H]);
		this.pages.push(this.page);
		this.y = H - TOP;
	}

	/** Makes room for `height` points, starting a new page if it doesn't fit. */
	need(height: number) {
		if (this.y - height < BOTTOM) this.newPage();
	}

	gap(points: number) {
		this.y -= points;
	}

	text(
		value: string,
		opts: {
			size?: number;
			font?: PDFFont;
			color?: ReturnType<typeof rgb>;
			x?: number;
			width?: number;
			lead?: number;
		} = {}
	) {
		const size = opts.size ?? 10;
		const font = opts.font ?? this.fonts.regular;
		const x = opts.x ?? LEFT;
		const width = opts.width ?? CONTENT_W - (x - LEFT);
		const lead = opts.lead ?? size * 1.45;
		for (const line of wrap(value, font, size, width)) {
			this.need(lead);
			this.y -= lead;
			this.page.drawText(line, {
				x,
				y: this.y + (lead - size) * 0.6,
				size,
				font,
				color: opts.color ?? black
			});
		}
	}

	hr() {
		this.need(12);
		this.y -= 6;
		this.page.drawLine({
			start: { x: LEFT, y: this.y },
			end: { x: W - RIGHT, y: this.y },
			thickness: 0.5,
			color: rule
		});
		this.y -= 6;
	}
}

function drawTable(layout: Layout, fonts: Fonts, table: Tokens.Table) {
	const size = 8.5;
	const lead = size * 1.4;
	const pad = 4;
	const cols = table.header.length;
	// Columns share the width in proportion to their longest cell, within bounds,
	// so a one-word column doesn't take a third of the page from a long one.
	const longest = table.header.map((_, i) =>
		Math.max(
			inlineText(table.header[i].tokens).length,
			...table.rows.map((row) => inlineText(row[i]?.tokens).length)
		)
	);
	const weights = longest.map((n) => Math.min(Math.max(n, 8), 60));
	const total = weights.reduce((a, b) => a + b, 0);
	const widths = weights.map((w) => (CONTENT_W * w) / total);

	const drawRow = (cells: string[], font: PDFFont, shaded: boolean) => {
		const lines = cells.map((cell, i) => wrap(cell, font, size, widths[i] - 2 * pad));
		const height = Math.max(...lines.map((l) => l.length)) * lead + 2 * pad;
		layout.need(height);
		const top = layout.y;
		if (shaded) {
			layout.page.drawRectangle({
				x: LEFT,
				y: top - height,
				width: CONTENT_W,
				height,
				color: tint
			});
		}
		let x = LEFT;
		lines.forEach((cellLines, i) => {
			cellLines.forEach((line, j) => {
				layout.page.drawText(line, {
					x: x + pad,
					y: top - pad - (j + 1) * lead + (lead - size) * 0.6,
					size,
					font,
					color: black
				});
			});
			x += widths[i];
		});
		layout.page.drawLine({
			start: { x: LEFT, y: top - height },
			end: { x: W - RIGHT, y: top - height },
			thickness: 0.5,
			color: rule
		});
		layout.y = top - height;
	};

	layout.need(lead * 2 + 4 * pad);
	drawRow(
		table.header.map((cell) => inlineText(cell.tokens)),
		fonts.bold,
		true
	);
	for (const row of table.rows) {
		drawRow(
			Array.from({ length: cols }, (_, i) => inlineText(row[i]?.tokens)),
			fonts.regular,
			false
		);
	}
	layout.gap(8);
}

function drawList(layout: Layout, fonts: Fonts, list: Tokens.List, depth = 0) {
	const indent = LEFT + 14 + depth * 14;
	let n = typeof list.start === 'number' ? list.start : 1;
	for (const item of list.items) {
		const marker = list.ordered ? `${n++}.` : depth === 0 ? '•' : '–';
		let first = true;
		for (const token of item.tokens) {
			if (token.type === 'list') {
				drawList(layout, fonts, token as Tokens.List, depth + 1);
				continue;
			}
			// A table or a quote inside an item (the sub-processor table sits in
			// one in the template) is drawn as the block it is.
			if (token.type !== 'text' && token.type !== 'paragraph' && token.type !== 'space') {
				drawBlocks(layout, fonts, [token]);
				first = false;
				continue;
			}
			const text =
				inlineText('tokens' in token ? token.tokens : undefined) ||
				('text' in token ? String(token.text) : '');
			if (!text.trim()) continue;
			if (first) {
				// Room for the first line is made here, so the marker lands on the
				// same page and line as the text it belongs to.
				const lead = 10 * 1.45;
				layout.need(lead);
				layout.page.drawText(safe(marker, fonts.regular), {
					x: indent - 12,
					y: layout.y - lead + (lead - 10) * 0.6,
					size: 10,
					font: fonts.regular,
					color: black
				});
				first = false;
			}
			layout.text(text, { x: indent });
		}
	}
	if (depth === 0) layout.gap(6);
}

function drawBlocks(layout: Layout, fonts: Fonts, tokens: Token[], quoted = false) {
	for (const token of tokens) {
		switch (token.type) {
			case 'heading': {
				const size = token.depth === 1 ? 16 : token.depth === 2 ? 12.5 : 11;
				// Keep a heading with at least two lines of what follows it.
				layout.need(size * 1.4 + 30);
				layout.gap(token.depth === 1 ? 4 : 10);
				layout.text(inlineText(token.tokens), { size, font: fonts.bold, lead: size * 1.3 });
				layout.gap(4);
				break;
			}
			case 'paragraph':
				layout.text(inlineText(token.tokens), {
					x: quoted ? LEFT + 12 : LEFT,
					color: quoted ? muted : black
				});
				layout.gap(6);
				break;
			case 'list':
				drawList(layout, fonts, token as Tokens.List);
				break;
			case 'table':
				drawTable(layout, fonts, token as Tokens.Table);
				break;
			case 'blockquote':
				drawBlocks(layout, fonts, token.tokens ?? [], true);
				break;
			case 'hr':
				layout.hr();
				break;
			case 'code':
				layout.text(token.text, { x: LEFT + 12, color: muted });
				layout.gap(6);
				break;
			case 'html':
				// Shown as text in the app as well (see markdown.ts).
				layout.text(token.text);
				layout.gap(6);
				break;
			default:
				break;
		}
	}
}

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
	const layout = new Layout(pdf, fonts);

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

	drawBlocks(layout, fonts, new Lexer({ gfm: true }).lex(data.body));

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
