// A case's label (Kistenetikett) as ZPL, for a thermal label printer.
//
// ZPL rather than a PDF because the printer draws it itself: the DataMatrix
// comes out at the printer's own resolution, sharp at any size, and there is no
// driver or print dialog in between to scale it. The scanner app sends this
// text straight to the printer's port 9100. Written for a Honeywell PC42E-T in
// its ZPL emulation (ZSim), so it sticks to plain ZPL II: ^A0, ^BX, ^GB, ^GFA.
//
// Pure, so the layout can be tested without a database. The logo arrives as a
// ready 1-bit bitmap — see case-label-logo.ts.

import { syllables } from './hyphenate';

export type CaseLabelSize = 'large' | 'small';

/**
 * One line of the contents. An accessory line counts what all the units above
 * it carry together, and `each` says how many each one has — "je 1×", with
 * "insg. 4×" behind it. `each` is null for a unit's own line, for accessories
 * of a single unit (where "je" says nothing) and where the units differ.
 */
export type CaseLabelLine = {
	count: number;
	name: string;
	accessory: boolean;
	each: number | null;
	/** The product's (or an inner kit's) picture, for the tiles. */
	imagePath?: string | null;
};

/** The contents as a list, or as tiles with each product's picture (large label only). */
export type CaseLabelLayout = 'list' | 'grid';

/**
 * Whether the small label carries the contents: `auto` where they fit at a
 * size still read up close, `always` (cut short with a "more" line when
 * they do not fit), `never`. The large label always does.
 */
export type CaseLabelContents = 'auto' | 'always' | 'never';

export type CaseLabelOptions = {
	layout?: CaseLabelLayout;
	/** The tiles with each product's picture (default), or with its count large in its place. */
	pictures?: boolean;
	contents?: CaseLabelContents;
	/** The tiles' pictures by `imagePath`, already fitted into `gridPictureBox`. */
	images?: Map<string, LabelBitmap>;
};

export type CaseLabelData = {
	title: string;
	caption: string | null;
	/** What the DataMatrix carries: the bundle's tag, or the unit's. Null prints no code. */
	code: string | null;
	orgName: string;
	lines: CaseLabelLine[];
};

/** A monochrome bitmap, one bit per dot, rows padded to whole bytes, 1 = black. */
export type LabelBitmap = { width: number; height: number; bytes: Uint8Array };

/** The PC42E-T prints at 203 dpi, i.e. 8 dots per millimetre. */
export const LABEL_DPMM = 8;

/**
 * The two rolls in use: the standard 4×6″ shipping label, and a small one for
 * boxes too small to carry a list. Width is across the print head.
 */
export const LABEL_SIZES: Record<CaseLabelSize, { widthMm: number; heightMm: number }> = {
	large: { widthMm: 101.6, heightMm: 152.4 },
	small: { widthMm: 80, heightMm: 55 }
};

/** The box the logo is fitted into, in dots: the footer, beside the code. */
export const LOGO_BOX: Record<CaseLabelSize, { width: number; height: number }> = {
	large: { width: 420, height: 120 },
	small: { width: 300, height: 72 }
};

const dots = (mm: number) => Math.round(mm * LABEL_DPMM);

/**
 * How wide each glyph of ^A0 is, as a share of the font height, measured off
 * Labelary's rendering of the font at 203 dpi. Nothing on the printer reports
 * how wide a string came out, so text is fitted by these, plus `SLACK` for a
 * ZSim whose ^A0 runs a little wider. A character not listed counts as wide.
 */
const GLYPH: Record<string, number> = {
	...Object.fromEntries([...'0123456789'].map((d) => [d, 0.48])),
	a: 0.461,
	b: 0.497,
	c: 0.443,
	d: 0.497,
	e: 0.48,
	f: 0.276,
	g: 0.497,
	h: 0.497,
	i: 0.259,
	j: 0.259,
	k: 0.443,
	l: 0.259,
	m: 0.756,
	n: 0.497,
	o: 0.48,
	p: 0.497,
	q: 0.497,
	r: 0.333,
	s: 0.424,
	t: 0.276,
	u: 0.497,
	v: 0.443,
	w: 0.664,
	x: 0.443,
	y: 0.443,
	z: 0.388,
	ä: 0.461,
	ö: 0.48,
	ü: 0.497,
	ß: 0.516,
	A: 0.554,
	B: 0.554,
	C: 0.535,
	D: 0.59,
	E: 0.497,
	F: 0.497,
	G: 0.59,
	H: 0.609,
	I: 0.276,
	J: 0.443,
	K: 0.554,
	L: 0.48,
	M: 0.756,
	N: 0.609,
	O: 0.571,
	P: 0.554,
	Q: 0.571,
	R: 0.59,
	S: 0.535,
	T: 0.497,
	U: 0.609,
	V: 0.535,
	W: 0.811,
	X: 0.554,
	Y: 0.554,
	Z: 0.497,
	Ä: 0.554,
	Ö: 0.571,
	Ü: 0.609,
	' ': 0.295,
	'.': 0.295,
	',': 0.295,
	':': 0.295,
	';': 0.295,
	'/': 0.295,
	'(': 0.295,
	')': 0.295,
	"'": 0.295,
	'!': 0.295,
	'"': 0.48,
	'#': 0.48,
	'*': 0.48,
	'?': 0.443,
	_: 0.497,
	'&': 0.609,
	'-': 0.904,
	'+': 0.904,
	'×': 0.904,
	'%': 0.904,
	'<': 0.895,
	'>': 0.895,
	'=': 0.904,
	'…': 0.904
};
const SLACK = 1.08;

/** Estimated width in dots of `text` in ^A0 at `height`. */
export function textWidth(text: string, height: number) {
	let units = 0;
	for (const c of text) units += GLYPH[c] ?? 0.75;
	return Math.ceil(units * height * SLACK);
}

function fits(text: string, height: number, width: number) {
	return textWidth(text, height) <= width;
}

function truncate(text: string, height: number, width: number) {
	if (fits(text, height, width)) return text;
	const chars = [...text];
	while (chars.length > 1 && !fits(chars.join('').trimEnd() + '…', height, width)) chars.pop();
	return chars.join('').trimEnd() + '…';
}

/** Word-wrapped into at most `maxLines`, the last one cut short if need be. */
export function wrap(text: string, height: number, width: number, maxLines: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let current = '';
	for (let i = 0; i < words.length; i++) {
		const candidate = current ? `${current} ${words[i]}` : words[i];
		if (fits(candidate, height, width) || !current) {
			current = candidate;
			continue;
		}
		if (lines.length === maxLines - 1) {
			// No room for another line: the rest goes onto this one and is cut.
			current = [current, ...words.slice(i)].join(' ');
			break;
		}
		lines.push(current);
		current = words[i];
	}
	if (current) lines.push(current);
	return lines.slice(0, maxLines).map((line) => truncate(line, height, width));
}

/** Word-wrapped into at most `maxLines` without cutting anything, or null if it doesn't. */
function wrapWhole(text: string, height: number, width: number, maxLines: number) {
	const lines = wrap(text, height, width, maxLines);
	const whole = lines.join(' ') === text.split(/\s+/).filter(Boolean).join(' ');
	return whole && lines.every((line) => fits(line, height, width)) ? lines : null;
}

/**
 * Field data under ^FH: the three characters ZPL would read as commands or as
 * the escape itself are written as hex. Everything else goes through as UTF-8
 * (^CI28), umlauts included.
 */
function escape(text: string) {
	return text.replace(/[_^~]/g, (c) => `_${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function text(x: number, y: number, height: number, value: string) {
	return `^FO${x},${y}^A0N,${height},${height}^FH^FD${escape(value)}^FS`;
}

function rule(x: number, y: number, width: number, thickness = 3) {
	return `^FO${x},${y}^GB${width},${thickness},${thickness}^FS`;
}

/**
 * ECC 200 square sizes and how many data codewords each holds. ZPL picks the
 * smallest that fits by itself; we need the same answer to know how large one
 * module may be drawn so the symbol fills the space it is given.
 */
const DATAMATRIX_SIZES: [modules: number, codewords: number][] = [
	[10, 3],
	[12, 5],
	[14, 8],
	[16, 12],
	[18, 18],
	[20, 22],
	[22, 30],
	[24, 36],
	[26, 44],
	[32, 62],
	[36, 86],
	[40, 114],
	[44, 144]
];

/** Codewords for `code` in ASCII encodation: digit pairs share one, anything past ASCII takes two. */
function codewords(code: string) {
	const bytes = new TextEncoder().encode(code);
	let count = 0;
	for (let i = 0; i < bytes.length; i++) {
		const isDigit = (b: number | undefined) => b !== undefined && b >= 0x30 && b <= 0x39;
		if (isDigit(bytes[i]) && isDigit(bytes[i + 1])) i++;
		else if (bytes[i] > 0x7f) count++;
		count++;
	}
	return count;
}

export function dataMatrixModules(code: string) {
	const needed = codewords(code);
	return (DATAMATRIX_SIZES.find(([, cw]) => cw >= needed) ?? DATAMATRIX_SIZES.at(-1)!)[0];
}

/** The DataMatrix at `x,y`, as large as fits in `box` dots. Returns the commands and its edge length. */
function dataMatrix(x: number, y: number, box: number, code: string) {
	const modules = dataMatrixModules(code);
	const module = Math.max(2, Math.floor(box / modules));
	const size = module * modules;
	return {
		size,
		zpl: `^FO${x + Math.floor((box - size) / 2)},${y + Math.floor((box - size) / 2)}^BXN,${module},200^FH^FD${escape(code)}^FS`
	};
}

/**
 * A run of one hex digit in ZPL's ASCII compression: G–Y repeat it 1–19
 * times, g–z 20–400 in steps of 20, and the two combine ("hJ" is 51).
 */
function hexRun(digit: string, count: number) {
	let out = '';
	while (count > 0) {
		const chunk = Math.min(count, 400);
		const twenties = Math.floor(chunk / 20);
		const ones = chunk % 20;
		if (twenties) out += String.fromCharCode('g'.charCodeAt(0) + twenties - 1);
		if (ones) out += String.fromCharCode('G'.charCodeAt(0) + ones - 1);
		out += digit;
		count -= chunk;
	}
	return out;
}

/**
 * A row of hex in ZPL's ASCII compression: runs as `hexRun`, a row of white
 * to its end as ",", and a row the same as the one above as ":". A product
 * photo on white is mostly that, so it shrinks to a fraction.
 */
function compressRow(row: string, previous: string | null) {
	if (row === previous) return ':';
	const trimmed = row.replace(/0+$/, '');
	let out = '';
	for (let i = 0; i < trimmed.length;) {
		let j = i;
		while (j < trimmed.length && trimmed[j] === trimmed[i]) j++;
		out += j - i > 2 ? hexRun(trimmed[i], j - i) : trimmed.slice(i, j);
		i = j;
	}
	return trimmed.length < row.length ? `${out},` : out;
}

function graphic(x: number, y: number, bitmap: LabelBitmap) {
	const rowBytes = Math.ceil(bitmap.width / 8);
	const total = rowBytes * bitmap.height;
	const hex = Buffer.from(bitmap.bytes.subarray(0, total)).toString('hex').toUpperCase();
	let data = '';
	let previous: string | null = null;
	for (let r = 0; r < bitmap.height; r++) {
		const row = hex.slice(r * rowBytes * 2, (r + 1) * rowBytes * 2);
		data += compressRow(row, previous);
		previous = row;
	}
	return `^FO${x},${y}^GFA,${total},${total},${rowBytes},${data}^FS`;
}

function header(width: number, height: number) {
	// ^PW/^LL set the label size for this job, so a roll calibrated for the
	// other format prints the right layout rather than a cropped one.
	return ['^XA', '^CI28', `^PW${width}`, `^LL${height}`, '^LH0,0'];
}

/** Right-aligned in the `width` dots ending at `x + width`. Only for text known to fit. */
function textRight(x: number, y: number, width: number, height: number, value: string) {
	return `^FO${x},${y}^A0N,${height},${height}^FB${width},1,0,R^FH^FD${escape(value)}^FS`;
}

/**
 * The title in the pieces a line may end after: words, and where a word may be
 * broken, its syllables (`soft`, ending the line in a hyphen) or the part up to
 * a hyphen it already has (`hard`, breaking there adds nothing).
 */
type TitlePiece = { text: string; after: 'space' | 'soft' | 'hard' };

function titlePieces(title: string): TitlePiece[] {
	const out: TitlePiece[] = [];
	for (const word of title.split(/\s+/).filter(Boolean)) {
		const parts = word.split(/(?<=-)(?=.)/);
		parts.forEach((part, p) => {
			const pieces = syllables(part);
			pieces.forEach((text, i) => {
				const after = i < pieces.length - 1 ? 'soft' : p < parts.length - 1 ? 'hard' : 'space';
				out.push({ text, after });
			});
		});
	}
	return out;
}

/** Pieces `from` up to `to` (exclusive) as one line, with a hyphen if it breaks a word. */
function titleLine(pieces: TitlePiece[], from: number, to: number) {
	let line = '';
	for (let i = from; i < to; i++) {
		line += pieces[i].text;
		if (i < to - 1 && pieces[i].after === 'space') line += ' ';
	}
	return pieces[to - 1].after === 'soft' ? `${line}-` : line;
}

/**
 * The best way to set the pieces on at most `maxLines` lines of `width` at
 * `height`, or null if none fits. A broken word costs about three letters'
 * width, and every dot a line falls short of the longest costs one — so
 * "3er Mehrfach- / steckdosen Kit" beats "3er / Mehrfachsteckdosen Kit", while
 * "Mikrofonkoffer / Gesang" stays whole.
 */
function breakTitle(pieces: TitlePiece[], height: number, width: number, maxLines: number) {
	type Set = { lines: string[]; hyphens: number; cost: number };
	let best: Set | null = null;
	const n = pieces.length;
	const consider = (breaks: number[]) => {
		const bounds = [0, ...breaks, n];
		const lines: string[] = [];
		const widths: number[] = [];
		let hyphens = 0;
		for (let i = 0; i < bounds.length - 1; i++) {
			const line = titleLine(pieces, bounds[i], bounds[i + 1]);
			const w = textWidth(line, height);
			if (w > width) return;
			if (i < bounds.length - 2 && pieces[bounds[i + 1] - 1].after === 'soft') hyphens++;
			lines.push(line);
			widths.push(w);
		}
		const longest = Math.max(...widths);
		const ragged = widths.reduce((sum, w) => sum + longest - w, 0);
		const cost = hyphens * 3 * height + ragged;
		if (!best || cost < best.cost) best = { lines, hyphens, cost };
	};
	const walk = (breaks: number[], from: number) => {
		consider(breaks);
		if (breaks.length === maxLines - 1) return;
		for (let b = from; b < n; b++) walk([...breaks, b], b + 1);
	};
	walk([], 1);
	return best as Set | null;
}

/**
 * A size step and a bit: what breaking a word must gain over setting it whole.
 * A name read across the room wins from larger type, but not from any.
 */
const HYPHEN_COST = 14;

/**
 * The title as large as it goes in the space it has, on two lines at most — a
 * third only once the type is small enough that three lines still read as one
 * name. A long word may be broken by its syllables where that sets the name
 * clearly larger.
 */
export function fitTitle(
	text: string,
	width: number,
	maxHeight: number,
	sizes: number[],
	threeLinesFrom: number
) {
	const pieces = titlePieces(text);
	let chosen: { size: number; lineHeight: number; lines: string[]; score: number } | null = null;
	for (const size of sizes) {
		const lineHeight = Math.round(size * 1.08);
		const maxLines = Math.min(size <= threeLinesFrom ? 3 : 2, Math.floor(maxHeight / lineHeight));
		if (maxLines < 1 || pieces.length === 0) continue;
		const set = breakTitle(pieces, size, width, maxLines);
		if (!set) continue;
		const score = size - HYPHEN_COST * set.hyphens;
		if (!chosen || score > chosen.score) chosen = { size, lineHeight, lines: set.lines, score };
		// Nothing smaller can beat a name set whole.
		if (set.hyphens === 0) break;
	}
	if (chosen) return { size: chosen.size, lineHeight: chosen.lineHeight, lines: chosen.lines };
	const size = sizes.at(-1)!;
	const lineHeight = Math.round(size * 1.08);
	const maxLines = Math.max(1, Math.min(3, Math.floor(maxHeight / lineHeight)));
	return { size, lineHeight, lines: wrap(text, size, width, maxLines) };
}

/** Centred across the `width` dots from `x`. Only for text known to fit. */
function textCentered(x: number, y: number, width: number, height: number, value: string) {
	return `^FO${x},${y}^A0N,${height},${height}^FB${width},1,0,C^FH^FD${escape(value)}^FS`;
}

/** Turned to read bottom to top, centred along `length` dots from the bottom edge up. */
function textUpward(x: number, y: number, length: number, height: number, value: string) {
	return `^FO${x},${y}^A0B,${height},${height}^FB${length},1,0,C^FH^FD${escape(value)}^FS`;
}

/**
 * The footer, one band along the bottom edge: whose case it is on the left
 * (logo, else name), centred on the band, and the code in the right corner
 * with its tag turned upright beside it. Returns its commands and the y where
 * the band begins.
 */
function footer(
	W: number,
	H: number,
	M: number,
	box: number,
	nameHeight: number,
	data: CaseLabelData,
	logo: LabelBitmap | null
) {
	const out: string[] = [];
	const bottom = H - M;
	let band = logo ? logo.height : nameHeight;
	let codeLeft = W - M;

	if (data.code) {
		// The tag runs the height of the code. A long one makes the code grow
		// (by up to 40%) before the type goes below what reads at arm's length;
		// a field too short for it would not clip in ZPL but print the overflow
		// over itself, so whatever still does not fit is cut.
		const minTag = 18;
		let tagHeight = Math.min(box >= 140 ? 44 : 28, Math.floor(box / 3));
		while (tagHeight > minTag && !fits(data.code, tagHeight, box)) tagHeight -= 2;
		if (!fits(data.code, tagHeight, box)) {
			box = Math.min(Math.round(box * 1.4), textWidth(data.code, tagHeight));
		}
		band = Math.max(band, box);
		const top = bottom - box;
		const tagX = W - M - tagHeight;
		out.push(textUpward(tagX, top, box, tagHeight, truncate(data.code, tagHeight, box)));
		codeLeft = tagX - 10 - box;
		out.push(dataMatrix(codeLeft, top, box, data.code).zpl);
	}

	const ownerWidth = codeLeft - M - 24;
	// Without a logo the name has the band to itself: up to nearly twice the
	// size it would sit at beside one, as far as it fits.
	let nameSize = nameHeight;
	if (!logo) {
		nameSize = Math.round(nameHeight * 1.8);
		while (nameSize > nameHeight && !fits(data.orgName, nameSize, ownerWidth)) nameSize -= 2;
		if (!data.code) band = nameSize;
	}
	const top = bottom - band;
	if (logo) {
		out.push(graphic(M, top + Math.floor((band - logo.height) / 2), logo));
	} else {
		const y = top + Math.floor((band - nameSize) / 2);
		out.push(text(M, y, nameSize, truncate(data.orgName, nameSize, ownerWidth)));
	}
	return { out, top };
}

/**
 * A list's type: its size and row, how many rows a name may take, and where
 * the names start — one column for every unit's line and one for every
 * accessory's, so "1×" and "12×" put their names in line.
 */
type ListType = {
	font: number;
	row: number;
	maxRows: number;
	nameColumn: number;
	accessoryColumn: number;
};

const countText = (line: CaseLabelLine) =>
	line.accessory && line.each !== null ? `je ${line.each}×` : `${line.count}×`;

function listType(font: number, lines: CaseLabelLine[], maxRows = 2): ListType {
	const indent = Math.round(font * 1.2);
	const column = (of: CaseLabelLine[]) =>
		Math.max(
			Math.round(font * 2.1),
			...of.map((line) => textWidth(countText(line), font) + Math.round(font / 2))
		);
	return {
		font,
		row: Math.round(font * 1.32),
		maxRows,
		nameColumn: column(lines.filter((l) => !l.accessory)),
		accessoryColumn: indent + column(lines.filter((l) => l.accessory))
	};
}

/** One contents line: count, name wrapped onto a second row if allowed, and the total for accessories. */
function listLine(line: CaseLabelLine, y: number, W: number, M: number, type: ListType) {
	const { font, row: rowHeight } = type;
	const zpl: string[] = [];
	const indent = line.accessory ? Math.round(font * 1.2) : 0;
	const each = line.accessory && line.each !== null;
	zpl.push(text(M + indent, y, font, countText(line)));
	const nameX = M + (line.accessory ? type.accessoryColumn : type.nameColumn);
	const total = each ? `insg. ${line.count}×` : null;
	const totalWidth = total ? textWidth(total, font) + 4 : 0;
	const nameWidth = W - M - nameX - (total ? totalWidth + Math.round(font / 2) : 0);
	const rows = wrap(line.name, font, nameWidth, type.maxRows);
	rows.forEach((row, i) => zpl.push(text(nameX, y + i * rowHeight, font, row)));
	if (total) zpl.push(textRight(W - M - totalWidth, y, totalWidth, font, total));
	const whole = rows.join(' ') === line.name.split(/\s+/).filter(Boolean).join(' ');
	return { zpl, rows: rows.length, cut: !whole };
}

/** How tall `lines` come out at `type`. */
function listHeight(lines: CaseLabelLine[], W: number, M: number, type: ListType) {
	return lines.reduce((sum, line) => sum + listLine(line, 0, W, M, type).rows * type.row, 0);
}

/**
 * The largest of `fonts` at which all of `lines` fit in `room` dots, every
 * name whole on its `maxRows` at most, or null. Larger type is never bought
 * with a cut name.
 */
function largestList(
	lines: CaseLabelLine[],
	W: number,
	M: number,
	room: number,
	fonts: number[],
	maxRows = 2
) {
	for (const font of fonts) {
		const type = listType(font, lines, maxRows);
		const cut = lines.some((line) => listLine(line, 0, W, M, type).cut);
		if (!cut && listHeight(lines, W, M, type) <= room) return type;
	}
	return null;
}

/**
 * The contents in blocks — a unit's line with its accessories — split across
 * as many labels as they need. A block moves to the next label whole when it
 * would be torn and fits on one; only a block taller than a whole label is cut.
 */
function paginate<T extends { accessory: boolean }>(
	lines: T[],
	rowsOf: (line: T) => number,
	room: number[]
) {
	const blocks: T[][] = [];
	for (const line of lines) {
		if (!line.accessory || blocks.length === 0) blocks.push([line]);
		else blocks.at(-1)!.push(line);
	}
	const pages: T[][] = [[]];
	let used = 0;
	const capacity = () => room[Math.min(pages.length - 1, room.length - 1)];
	for (const block of blocks) {
		const height = block.reduce((sum, line) => sum + rowsOf(line), 0);
		const fullPage = room[Math.min(pages.length, room.length - 1)];
		if (used > 0 && used + height > capacity() && height <= fullPage) {
			pages.push([]);
			used = 0;
		}
		for (const line of block) {
			const rows = rowsOf(line);
			if (used > 0 && used + rows > capacity()) {
				pages.push([]);
				used = 0;
			}
			pages.at(-1)!.push(line);
			used += rows;
		}
	}
	return pages;
}

// ── The large label ────────────────────────────────────────────────────────

const LARGE = (() => {
	const { widthMm, heightMm } = LABEL_SIZES.large;
	return { W: dots(widthMm), H: dots(heightMm), M: 32 };
})();
const LARGE_TITLE_SIZES = [128, 112, 100, 88, 76, 68, 60, 52];
/** A long list keeps the size it always had; a short one grows into the room it has. */
const LARGE_LIST_FONTS = [72, 64, 56, 50, 44, 38, 34, 30];
const LARGE_LIST_BASE = 30;
const MARKER = 26;

/** Everything above the contents on the first label, and where the contents start. */
function largeHead(data: CaseLabelData) {
	const { M, W } = LARGE;
	const inner = W - 2 * M;
	const head: string[] = [];
	// The name first and as large as it goes: it is what is read from across
	// the room. Only the first label carries it.
	const title = fitTitle(data.title, inner, 290, LARGE_TITLE_SIZES, 76);
	let y = M;
	for (const line of title.lines) {
		head.push(textCentered(M, y, inner, title.size, line));
		y += title.lineHeight;
	}
	if (data.caption) {
		head.push(textCentered(M, y + 4, inner, 34, truncate(data.caption, 34, inner)));
		y += 4 + 42;
	}
	y += 14;
	head.push(rule(M, y, inner));
	return { head, top: y + 3 + 20 };
}

/**
 * The large label's frame: the head, the footer, and the room between them
 * on the first, middle and last of several labels.
 */
function largeFrame(data: CaseLabelData, logo: LabelBitmap | null) {
	const { W, H, M } = LARGE;
	const { head, top } = largeHead(data);
	// Only the last label carries the footer, so the ones before it give its
	// room to the contents and put their page number in the bottom corner.
	const foot = footer(W, H, M, 160, 40, data, logo);
	const footRule = foot.top - 20;
	return {
		head,
		foot,
		footRule,
		top,
		/** Contents room on a single label carrying both head and footer. */
		single: footRule - 12 - top,
		/** [first, following] labels' room, with and without the footer. */
		withFooter: [footRule - 12 - top, footRule - 12 - M],
		withoutFooter: [H - M - MARKER - 12 - top, H - M - MARKER - 12 - M]
	};
}

/**
 * Pages for contents measured in dots, the footer on the last: everything on
 * the first label if it fits, else as many labels as it takes.
 */
function largePages<T extends { accessory: boolean }>(
	items: T[],
	heightOf: (item: T) => number,
	frame: ReturnType<typeof largeFrame>
) {
	let pages = paginate(items, heightOf, frame.withFooter);
	if (pages.length > 1) {
		pages = paginate(items, heightOf, frame.withoutFooter);
		// The last of them has to make room for the footer; what does not fit
		// above it goes on to another label.
		const last = pages.pop()!;
		const index = pages.length;
		pages.push(
			...paginate(last, heightOf, [frame.withFooter[Math.min(index, 1)], frame.withFooter[1]])
		);
	}
	return pages;
}

/** The labels around their contents: head on the first, footer on the last, page numbers when several. */
function largeLabels(
	pages: string[][],
	frame: ReturnType<typeof largeFrame>
): { zpl: string; labels: number } {
	const { W, H, M } = LARGE;
	const labels = pages.map((body, index) => {
		const out = header(W, H);
		const isLast = index === pages.length - 1;
		if (index === 0) out.push(...frame.head);
		out.push(...body);
		if (pages.length > 1) {
			const marker = `${index + 1}/${pages.length}`;
			const width = textWidth(marker, MARKER) + 4;
			const markerY = isLast ? frame.footRule - MARKER - 8 : H - M - MARKER;
			out.push(textRight(W - M - width, markerY, width, MARKER, marker));
		}
		if (isLast) out.push(rule(M, frame.footRule, W - 2 * M), ...frame.foot.out);
		out.push('^XZ');
		return out.join('\n');
	});
	return { zpl: labels.join('\n'), labels: labels.length };
}

function renderLargeList(data: CaseLabelData, logo: LabelBitmap | null) {
	const { W, M } = LARGE;
	const frame = largeFrame(data, logo);
	// All on one label in the largest type that takes; only a list too long
	// for that is set at the base size and continued.
	const type =
		largestList(data.lines, W, M, frame.single, LARGE_LIST_FONTS) ??
		listType(LARGE_LIST_BASE, data.lines);
	const heightOf = (line: CaseLabelLine) => listLine(line, 0, W, M, type).rows * type.row;
	const pages = largePages(data.lines, heightOf, frame).map((page, index) => {
		const out: string[] = [];
		let y = index === 0 ? frame.top : M;
		for (const line of page) {
			const drawn = listLine(line, y, W, M, type);
			out.push(...drawn.zpl);
			y += drawn.rows * type.row;
		}
		return out;
	});
	return largeLabels(pages, frame);
}

// ── Tiles ──────────────────────────────────────────────────────────────────

const TILE_GAP = 16;
/** Below this a tile's picture says nothing at 203 dpi, and the tiles go on to another label. */
const MIN_PICTURE = 150;

type TileGrid = {
	columns: number;
	tileWidth: number;
	tileHeight: number;
	picture: number;
	countFont: number;
	nameFont: number;
	/** Rows a name may take: three in a narrow tile, where two would cut most names. */
	nameRows: number;
	/** The count and the name's rows under the picture. */
	textHeight: number;
};

function tileGrid(columns: number, rows: number, room: number): TileGrid {
	const inner = LARGE.W - 2 * LARGE.M;
	const tileWidth = Math.floor((inner - (columns - 1) * TILE_GAP) / columns);
	const tileHeight = Math.floor((room - (rows - 1) * TILE_GAP) / rows);
	// The name says what it is, so it gets the larger share; the count only
	// how many.
	// A count is two or three characters, so it can be large in any tile.
	const countFont = Math.max(44, Math.min(80, Math.round(tileWidth * 0.2)));
	const nameFont = Math.max(26, Math.min(60, Math.round(tileWidth * 0.11)));
	const nameRows = columns >= 3 ? 3 : 2;
	const textHeight = Math.round(countFont * 1.15) + nameRows * Math.round(nameFont * 1.15) + 8;
	const picture = Math.min(tileWidth, tileHeight - textHeight);
	return { columns, tileWidth, tileHeight, picture, countFont, nameFont, nameRows, textHeight };
}

/** Without pictures a tile's box only holds its count, which needs far less. */
const MIN_COUNT_BOX = 90;
const MAX_COUNT_BOX = 170;

/**
 * How the tiles are laid out: on one label in the arrangement that draws the
 * pictures largest, else three across at a fixed height over several labels.
 * Without pictures the box over a tile's name only holds its count, so the
 * tiles are as tall as that needs and no taller.
 */
function chooseGrid(
	count: number,
	room: number,
	pictures: boolean
): { grid: TileGrid; paged: boolean } {
	const least = pictures ? MIN_PICTURE : MIN_COUNT_BOX;
	const cap = (grid: TileGrid): TileGrid => {
		if (pictures || grid.picture <= MAX_COUNT_BOX) return grid;
		const spare = grid.picture - MAX_COUNT_BOX;
		return { ...grid, picture: MAX_COUNT_BOX, tileHeight: grid.tileHeight - spare };
	};
	let best: TileGrid | null = null;
	for (const columns of [1, 2, 3, 4]) {
		const grid = tileGrid(columns, Math.ceil(count / columns), room);
		if (grid.picture >= least && (!best || grid.picture > best.picture)) best = grid;
	}
	if (best) return { grid: cap(best), paged: false };
	// Too many for one label: three across, each just tall enough.
	const { textHeight } = tileGrid(3, 1, 10_000);
	return { grid: tileGrid(3, 1, least + textHeight), paged: true };
}

/** The tiles' grid for these contents, and so the box their pictures are fetched for. */
function largeGrid(data: CaseLabelData, logo: LabelBitmap | null, pictures = true) {
	const frame = largeFrame(data, logo);
	return { frame, ...chooseGrid(Math.max(1, data.lines.length), frame.single, pictures) };
}

/**
 * The box a tile's picture is drawn in, so the endpoint can fetch the pictures
 * at the size they print. Depends on the contents only, never on the logo's
 * height, which the footer's band does not exceed.
 */
export function gridPictureBox(data: CaseLabelData) {
	const { grid } = largeGrid(data, null);
	return { width: grid.picture, height: grid.picture };
}

/**
 * The largest name size up to the grid's at which every name fits its tile
 * whole on its rows: a label of short names reads from further away.
 */
function tileNameFont(lines: CaseLabelLine[], grid: TileGrid) {
	for (let size = grid.nameFont; size > 26; size -= 2) {
		if (lines.every((line) => wrapWhole(line.name, size, grid.tileWidth, grid.nameRows))) {
			return size;
		}
	}
	return Math.min(26, grid.nameFont);
}

function tile(
	line: CaseLabelLine,
	x: number,
	y: number,
	grid: TileGrid,
	images: Map<string, LabelBitmap> | undefined
) {
	const out: string[] = [];
	const { tileWidth: w, picture, countFont, nameFont } = grid;
	// A tile is not a list to read down, so an accessory is simply how many of
	// it belong in the case — never "je 1×".
	const count = `${line.count}×`;
	const image = line.imagePath ? images?.get(line.imagePath) : undefined;
	let textY = y + picture + 8;
	if (image) {
		const px = x + Math.floor((w - image.width) / 2);
		const py = y + Math.floor((picture - image.height) / 2);
		out.push(graphic(px, py, image));
		out.push(textCentered(x, textY, w, countFont, truncate(count, countFont, w)));
		textY += Math.round(countFont * 1.15);
	} else {
		// No picture: the count takes its place, as large as it goes.
		const big = Math.min(Math.round(picture * 0.6), 200);
		let size = big;
		while (size > countFont && !fits(count, size, w)) size -= 4;
		// Sat on the name, not floating over it.
		out.push(textCentered(x, y + picture - Math.round(size * 0.85), w, size, count));
	}
	for (const row of wrap(line.name, nameFont, w, grid.nameRows)) {
		out.push(textCentered(x, textY, w, nameFont, row));
		textY += Math.round(nameFont * 1.15);
	}
	return out;
}

function renderLargeGrid(
	data: CaseLabelData,
	logo: LabelBitmap | null,
	images: Map<string, LabelBitmap> | undefined,
	pictures: boolean
) {
	const { M } = LARGE;
	const { frame, grid: chosen, paged } = largeGrid(data, logo, pictures);
	const grid = { ...chosen, nameFont: tileNameFont(data.lines, chosen) };
	if (!pictures) images = undefined;
	const rowHeight = grid.tileHeight + TILE_GAP;
	// Rows of tiles, paged like list lines: a unit's accessories are tiles of
	// their own here, so a row never has to stay with the next.
	const rows: { accessory: boolean; tiles: CaseLabelLine[] }[] = [];
	for (let i = 0; i < data.lines.length; i += grid.columns) {
		rows.push({ accessory: false, tiles: data.lines.slice(i, i + grid.columns) });
	}
	const pages = (paged ? largePages(rows, () => rowHeight, frame) : [rows]).map((page, index) => {
		const out: string[] = [];
		let y = index === 0 ? frame.top : M;
		for (const row of page) {
			row.tiles.forEach((line, c) => {
				out.push(...tile(line, M + c * (grid.tileWidth + TILE_GAP), y, grid, images));
			});
			y += rowHeight;
		}
		return out;
	});
	return largeLabels(pages, frame);
}

// ── The small label ────────────────────────────────────────────────────────

/** Every line as how many of it are in the case, accessories with the rest, alike names together. */
function totals(lines: CaseLabelLine[]): CaseLabelLine[] {
	const byName = new Map<string, CaseLabelLine>();
	for (const line of lines) {
		const known = byName.get(line.name);
		if (known) known.count += line.count;
		else byName.set(line.name, { ...line, accessory: false, each: null });
	}
	return [...byName.values()];
}

const SMALL_TITLE_SIZES = [128, 112, 100, 88, 80, 72, 64, 56, 48, 40];
/** Read up close, at the shelf: smaller than the large label's base would still do. */
const SMALL_LIST_FONTS = [56, 48, 42, 36, 32, 28];
/** Between the title's last line and the rule over the contents. */
const LIST_GAP = 14;
/** Below the rule, before the first contents row. */
const LIST_TOP = 14;
/** The share of the room the title may take when the contents come along. */
const TITLE_SHARES = [0.55, 0.45, 0.36];

/**
 * The small label names the box from outside: the name fills it, the code and
 * the owner sit small along the bottom edge, and the contents come in between
 * where they fit (see `CaseLabelContents`).
 */
function renderSmall(data: CaseLabelData, logo: LabelBitmap | null, contents: CaseLabelContents) {
	const { widthMm, heightMm } = LABEL_SIZES.small;
	const W = dots(widthMm);
	const H = dots(heightMm);
	const M = 24;
	const inner = W - 2 * M;
	const foot = footer(W, H, M, 96, 30, data, logo);
	const room = foot.top - 16 - M;

	const titleOnly = () => {
		const title = fitTitle(data.title, inner, room, SMALL_TITLE_SIZES, 64);
		return { title, list: null as null | { type: ListType; lines: CaseLabelLine[] } };
	};

	// No hierarchy here: each thing once with how many of it are in the case,
	// on a row of its own.
	const flat = totals(data.lines);
	const withList = () => {
		for (const share of TITLE_SHARES) {
			const title = fitTitle(data.title, inner, Math.floor(room * share), SMALL_TITLE_SIZES, 64);
			const listRoom = room - title.lines.length * title.lineHeight - LIST_GAP - 3 - LIST_TOP;
			const type = largestList(flat, W, M, listRoom, SMALL_LIST_FONTS, 1);
			if (type) return { title, list: { type, lines: flat } };
		}
		return null;
	};

	/** Asked for and too many: as many as fit at the smallest size, and a line for the rest. */
	const cutList = () => {
		const title = fitTitle(
			data.title,
			inner,
			Math.floor(room * TITLE_SHARES.at(-1)!),
			SMALL_TITLE_SIZES,
			64
		);
		const listRoom = room - title.lines.length * title.lineHeight - LIST_GAP - 3 - LIST_TOP;
		const type = listType(SMALL_LIST_FONTS.at(-1)!, flat, 1);
		const lines: CaseLabelLine[] = [];
		const more = (left: number) => ({
			count: left,
			name: 'weitere Positionen',
			accessory: false,
			each: null
		});
		for (let i = 0; i < flat.length; i++) {
			const next = [...lines, flat[i]];
			const rest = flat.length - i - 1;
			if (listHeight(rest ? [...next, more(rest)] : next, W, M, type) > listRoom) {
				lines.push(more(flat.length - i));
				break;
			}
			lines.push(flat[i]);
		}
		return { title, list: { type, lines } };
	};

	const layout =
		contents === 'never' || data.lines.length === 0
			? titleOnly()
			: (withList() ?? (contents === 'always' ? cutList() : titleOnly()));

	// Title and contents as one block, centred in the room above the footer:
	// a short list left under a full-width title otherwise hangs off the top.
	const { title, list } = layout;
	const titleHeight = title.lines.length * title.lineHeight - (title.lineHeight - title.size);
	const listHeightDots = list ? LIST_GAP + 3 + LIST_TOP + list.lines.length * list.type.row : 0;
	const out = header(W, H);
	// Nearer the top than the middle: centred, the space over the title
	// looked like a gap and the footer crowded the list.
	let y = M + Math.max(0, Math.floor((room - titleHeight - listHeightDots) / 4));
	for (const line of title.lines) {
		out.push(textCentered(M, y, inner, title.size, line));
		y += title.lineHeight;
	}
	if (list) {
		y += LIST_GAP - (title.lineHeight - title.size);
		out.push(rule(M, y, inner));
		y += 3 + LIST_TOP;
		// The list as wide as it needs and centred, under a centred title.
		const widest = Math.max(
			...list.lines.map((line) => list.type.nameColumn + textWidth(line.name, list.type.font))
		);
		const left = Math.max(M, Math.floor((W - Math.min(widest, inner)) / 2));
		for (const line of list.lines) {
			// Its right edge stays the label's margin.
			const drawn = listLine(line, y, W - M + left, left, list.type);
			out.push(...drawn.zpl);
			y += list.type.row;
		}
	}
	out.push(...foot.out, '^XZ');
	return { zpl: out.join('\n'), labels: 1, contentsShown: layout.list !== null };
}

/**
 * Text as the printer's ^A0 can draw it: it has no arrows, and an adapter
 * named "Schuko → powerCON" reads as German writes it anyway.
 */
export function printable(text: string) {
	return text.replace(/\s*[→⇒➔➜⟶]\s*/g, ' auf ');
}

/**
 * A kit's name as its own label shows it: a trailing "Kit" or "Bundle" says
 * nothing on the case it is stuck to, and leaving it off sets the rest larger.
 * Only at the end ("Switch Kit Dante" stays), and never down to nothing.
 */
export function kitLabelTitle(name: string) {
	const stripped = name.replace(/[\s-]+(kit|bundle)$/i, '').trim();
	return stripped || name;
}

/**
 * The case's label: one ^XA…^XZ per label, so a long contents list prints on
 * as many as it takes. The title is only on the first, the footer only on the
 * last. `contentsShown` says whether the contents made it onto the label,
 * which on the small one depends on whether they fit.
 */
export function renderCaseLabel(
	input: CaseLabelData,
	size: CaseLabelSize,
	logo: LabelBitmap | null,
	options: CaseLabelOptions = {}
): { zpl: string; labels: number; contentsShown: boolean } {
	const data: CaseLabelData = {
		...input,
		title: printable(input.title),
		caption: input.caption === null ? null : printable(input.caption),
		lines: input.lines.map((line) => ({ ...line, name: printable(line.name) }))
	};
	if (size === 'small') return renderSmall(data, logo, options.contents ?? 'auto');
	const drawn =
		options.layout === 'grid' && data.lines.length > 0
			? renderLargeGrid(data, logo, options.images, options.pictures ?? true)
			: renderLargeList(data, logo);
	return { ...drawn, contentsShown: data.lines.length > 0 };
}

/**
 * The contents as the label lists them: identical units as one line, and under
 * each such line the accessories its units carry, counted per unit where they
 * all carry the same. `items` come in case order, each unit before its own
 * accessories (see `ordered` in services/case-check.ts). A kit inside the case
 * is one line of its own ("1× PowerCon-Set"), its contents being on its own
 * label; those lines come first, as the bundle type lists them.
 */
export function caseLabelLines(
	items: {
		assetId: string;
		name: string;
		accessoryOf: string | null;
		imagePath?: string | null;
		innerKit?: { id: string; name: string; imagePath?: string | null } | null;
	}[]
): CaseLabelLine[] {
	const kits = new Map<string, { ids: Set<string>; imagePath: string | null }>();
	for (const item of items) {
		if (!item.innerKit) continue;
		const kit = kits.get(item.innerKit.name) ?? {
			ids: new Set<string>(),
			imagePath: item.innerKit.imagePath ?? null
		};
		kit.ids.add(item.innerKit.id);
		kits.set(item.innerKit.name, kit);
	}
	const kitLines: CaseLabelLine[] = [...kits].map(([name, { ids, imagePath }]) => ({
		count: ids.size,
		name,
		accessory: false,
		each: null,
		imagePath
	}));

	const groups: { name: string; ids: string[]; imagePath: string | null }[] = [];
	for (const item of items) {
		if (item.accessoryOf || item.innerKit) continue;
		const group = groups.find((g) => g.name === item.name);
		if (group) group.ids.push(item.assetId);
		else groups.push({ name: item.name, ids: [item.assetId], imagePath: item.imagePath ?? null });
	}

	const lines: CaseLabelLine[] = kitLines;
	for (const group of groups) {
		lines.push({
			count: group.ids.length,
			name: group.name,
			accessory: false,
			each: null,
			imagePath: group.imagePath
		});
		const members = new Set(group.ids);
		const perParent = new Map<string, Map<string, number>>();
		const images = new Map<string, string | null>();
		for (const item of items) {
			if (!item.accessoryOf || !members.has(item.accessoryOf)) continue;
			const counts = perParent.get(item.name) ?? new Map<string, number>();
			counts.set(item.accessoryOf, (counts.get(item.accessoryOf) ?? 0) + 1);
			perParent.set(item.name, counts);
			if (!images.has(item.name)) images.set(item.name, item.imagePath ?? null);
		}
		for (const [name, counts] of perParent) {
			const total = [...counts.values()].reduce((a, b) => a + b, 0);
			const first = counts.get(group.ids[0]);
			const uniform = first !== undefined && group.ids.every((id) => counts.get(id) === first);
			lines.push({
				count: total,
				name,
				accessory: true,
				each: group.ids.length > 1 && uniform ? first : null,
				imagePath: images.get(name) ?? null
			});
		}
	}
	return lines;
}

/**
 * The same label in Labelary's online viewer, to look at it before printing.
 * The ZPL goes in the query string, which is how the viewer's own permalinks
 * work, so whoever opens it sends the label's text to labelary.com.
 */
export function labelaryViewerUrl(zpl: string, size: CaseLabelSize) {
	const { widthMm, heightMm } = LABEL_SIZES[size];
	const params = new URLSearchParams({
		density: String(LABEL_DPMM),
		quality: 'bitonal',
		width: String(widthMm),
		height: String(heightMm),
		units: 'mm',
		index: '0',
		rotation: '0',
		zpl
	});
	return `https://labelary.com/viewer.html?${params}`;
}
