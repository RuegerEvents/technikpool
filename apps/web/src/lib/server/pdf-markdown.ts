import { rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';
import { Lexer, type Token, type Tokens } from 'marked';
import { safe, wrap } from './pdf-text.ts';

// Markdown set on PDF pages, block by block from marked's lexer: headings,
// paragraphs, lists, tables, quotes and rules, which is what the legal texts
// use (the operator's DPA, an org's rental terms). Inline emphasis is set as
// plain text; the document is read for what it says, and a word in bold is
// still the word.

const W = 595.28;
const H = 841.89;
const black = rgb(0.05, 0.05, 0.05);
const muted = rgb(0.4, 0.4, 0.4);
const rule = rgb(0.82, 0.82, 0.82);
const tint = rgb(0.96, 0.96, 0.96);

export type Fonts = { regular: PDFFont; bold: PDFFont };

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

export type Margins = { left: number; right: number; top: number; bottom: number };

/**
 * Flows text down A4 pages, adding a page when one is full. `onNewPage` lets
 * a document draw its own running header and say where the text starts below it.
 */
export class Layout {
	pages: PDFPage[] = [];
	page!: PDFPage;
	y = 0;
	readonly left: number;
	readonly right: number;
	readonly width: number;

	constructor(
		private pdf: PDFDocument,
		private fonts: Fonts,
		private margins: Margins,
		private onNewPage?: (page: PDFPage) => number | void
	) {
		this.left = margins.left;
		this.right = W - margins.right;
		this.width = this.right - this.left;
		this.newPage();
	}

	newPage() {
		this.page = this.pdf.addPage([W, H]);
		this.pages.push(this.page);
		this.y = H - this.margins.top;
		const top = this.onNewPage?.(this.page);
		if (typeof top === 'number') this.y = top;
	}

	/** Makes room for `height` points, starting a new page if it doesn't fit. */
	need(height: number) {
		if (this.y - height < this.margins.bottom) this.newPage();
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
		const x = opts.x ?? this.left;
		const width = opts.width ?? this.width - (x - this.left);
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
			start: { x: this.left, y: this.y },
			end: { x: this.right, y: this.y },
			thickness: 0.5,
			color: rule
		});
		this.y -= 6;
	}
}

function drawTable(layout: Layout, fonts: Fonts, table: Tokens.Table) {
	const LEFT = layout.left;
	const CONTENT_W = layout.width;
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
			end: { x: layout.right, y: top - height },
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
	const indent = layout.left + 14 + depth * 14;
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
	const LEFT = layout.left;
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

/** Sets `markdown` from the layout's current position on. */
export function drawMarkdown(layout: Layout, fonts: Fonts, markdown: string) {
	drawBlocks(layout, fonts, new Lexer({ gfm: true }).lex(markdown));
}
