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

function graphic(x: number, y: number, bitmap: LabelBitmap) {
	const rowBytes = Math.ceil(bitmap.width / 8);
	const total = rowBytes * bitmap.height;
	const hex = Buffer.from(bitmap.bytes.subarray(0, total)).toString('hex').toUpperCase();
	return `^FO${x},${y}^GFA,${total},${total},${rowBytes},${hex}^FS`;
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

/** Word-wrapped into at most `maxLines` without cutting anything, or null if it doesn't. */
function wrapWhole(text: string, height: number, width: number, maxLines: number) {
	const lines = wrap(text, height, width, maxLines);
	const whole = lines.join(' ') === text.split(/\s+/).filter(Boolean).join(' ');
	return whole && lines.every((line) => fits(line, height, width)) ? lines : null;
}

/**
 * Two lines broken where they come out most even, so a name does not end in
 * one word on a line of its own ("4x Stairville Vertifog / Kit").
 */
function balance(lines: string[], height: number, width: number) {
	if (lines.length !== 2) return lines;
	const words = lines.join(' ').split(' ');
	let best = lines;
	const longestOf = (pair: string[]) => Math.max(...pair.map((l) => textWidth(l, height)));
	let bestLongest = longestOf(lines);
	for (let k = 1; k < words.length; k++) {
		const pair = [words.slice(0, k).join(' '), words.slice(k).join(' ')];
		const longest = longestOf(pair);
		if (longest < bestLongest && pair.every((l) => fits(l, height, width))) {
			best = pair;
			bestLongest = longest;
		}
	}
	return best;
}

/**
 * The title as large as it goes in the space it has: the biggest size at which
 * it fits whole, on two lines at most — a third only once the type is small
 * enough that three lines still read as one name.
 */
export function fitTitle(
	text: string,
	width: number,
	maxHeight: number,
	sizes: number[],
	threeLinesFrom: number
) {
	for (const size of sizes) {
		const lineHeight = Math.round(size * 1.08);
		const maxLines = Math.min(size <= threeLinesFrom ? 3 : 2, Math.floor(maxHeight / lineHeight));
		if (maxLines < 1) continue;
		const lines = wrapWhole(text, size, width, maxLines);
		if (lines) return { size, lineHeight, lines: balance(lines, size, width) };
	}
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

	const top = bottom - band;
	const ownerWidth = codeLeft - M - 24;
	if (logo) {
		out.push(graphic(M, top + Math.floor((band - logo.height) / 2), logo));
	} else {
		const y = top + Math.floor((band - nameHeight) / 2);
		out.push(text(M, y, nameHeight, truncate(data.orgName, nameHeight, ownerWidth)));
	}
	return { out, top };
}

/** One contents line: count, name wrapped onto a second row if need be, and the total for accessories. */
function listLine(
	line: CaseLabelLine,
	y: number,
	W: number,
	M: number,
	font: number,
	rowHeight: number
) {
	const zpl: string[] = [];
	const indent = line.accessory ? 36 : 0;
	const each = line.accessory && line.each !== null;
	const count = each ? `je ${line.each}×` : `${line.count}×`;
	const x = M + indent;
	zpl.push(text(x, y, font, count));
	const nameX = x + Math.max(64, textWidth(count, font) + 16);
	const total = each ? `insg. ${line.count}×` : null;
	const totalWidth = total ? textWidth(total, font) + 4 : 0;
	const nameWidth = W - M - nameX - (total ? totalWidth + 16 : 0);
	const rows = wrap(line.name, font, nameWidth, 2);
	rows.forEach((row, i) => zpl.push(text(nameX, y + i * rowHeight, font, row)));
	if (total) zpl.push(textRight(W - M - totalWidth, y, totalWidth, font, total));
	return { zpl, rows: rows.length };
}

/**
 * The contents in blocks — a unit's line with its accessories — split across
 * as many labels as they need. A block moves to the next label whole when it
 * would be torn and fits on one; only a block taller than a whole label is cut.
 */
function paginate(lines: CaseLabelLine[], rowsOf: (line: CaseLabelLine) => number, room: number[]) {
	const blocks: CaseLabelLine[][] = [];
	for (const line of lines) {
		if (!line.accessory || blocks.length === 0) blocks.push([line]);
		else blocks.at(-1)!.push(line);
	}
	const pages: CaseLabelLine[][] = [[]];
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

function renderLarge(data: CaseLabelData, logo: LabelBitmap | null) {
	const { widthMm, heightMm } = LABEL_SIZES.large;
	const W = dots(widthMm);
	const H = dots(heightMm);
	const M = 32;
	const inner = W - 2 * M;

	// The name first and as large as it goes: it is what is read from across
	// the room. Only the first label carries it.
	const head: string[] = [];
	const title = fitTitle(data.title, inner, 290, [128, 112, 100, 88, 76, 68, 60, 52], 76);
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
	const firstListTop = y + 3 + 20;

	// Only the last label carries the footer, so the ones before it give its
	// room to the list and put their page number in the bottom corner.
	const foot = footer(W, H, M, 160, 40, data, logo);
	const footRule = foot.top - 20;
	const MARKER = 26;

	const FONT = 30;
	const ROW = 40;
	const rowsOf = (line: CaseLabelLine) => listLine(line, 0, W, M, FONT, ROW).rows;
	const rows = (bottom: number) =>
		[firstListTop, M].map((top) => Math.max(1, Math.floor((bottom - top) / ROW)));
	const withFooter = rows(footRule - 12);
	const withoutFooter = rows(H - M - MARKER - 12);

	let pages = paginate(data.lines, rowsOf, withFooter);
	if (pages.length > 1) {
		pages = paginate(data.lines, rowsOf, withoutFooter);
		// The last of them has to make room for the footer; what does not fit
		// above it goes on to another label.
		const last = pages.pop()!;
		const index = pages.length;
		pages.push(...paginate(last, rowsOf, [withFooter[Math.min(index, 1)], withFooter[1]]));
	}

	const labels = pages.map((page, index) => {
		const out = header(W, H);
		const isLast = index === pages.length - 1;
		if (index === 0) out.push(...head);
		let rowY = index === 0 ? firstListTop : M;
		for (const line of page) {
			const drawn = listLine(line, rowY, W, M, FONT, ROW);
			out.push(...drawn.zpl);
			rowY += drawn.rows * ROW;
		}
		if (pages.length > 1) {
			const marker = `${index + 1}/${pages.length}`;
			const width = textWidth(marker, MARKER) + 4;
			const markerY = isLast ? footRule - MARKER - 8 : H - M - MARKER;
			out.push(textRight(W - M - width, markerY, width, MARKER, marker));
		}
		if (isLast) out.push(rule(M, footRule, inner), ...foot.out);
		out.push('^XZ');
		return out.join('\n');
	});
	return { zpl: labels.join('\n'), labels: labels.length };
}

/**
 * The small label only names the box from outside: the name fills it, and the
 * code and the owner sit small along the bottom edge.
 */
function renderSmall(data: CaseLabelData, logo: LabelBitmap | null) {
	const { widthMm, heightMm } = LABEL_SIZES.small;
	const W = dots(widthMm);
	const H = dots(heightMm);
	const M = 24;
	const inner = W - 2 * M;
	const out = header(W, H);

	const foot = footer(W, H, M, 96, 30, data, logo);
	const title = fitTitle(
		data.title,
		inner,
		foot.top - 16 - M,
		[128, 112, 100, 88, 80, 72, 64, 56, 48, 40],
		64
	);
	let y = M;
	for (const line of title.lines) {
		out.push(textCentered(M, y, inner, title.size, line));
		y += title.lineHeight;
	}
	out.push(...foot.out, '^XZ');
	return { zpl: out.join('\n'), labels: 1 };
}

/**
 * The case's label: one ^XA…^XZ per label, so a long contents list prints on
 * as many as it takes. The title is only on the first, the footer only on the
 * last.
 */
export function renderCaseLabel(
	data: CaseLabelData,
	size: CaseLabelSize,
	logo: LabelBitmap | null
): { zpl: string; labels: number } {
	return size === 'large' ? renderLarge(data, logo) : renderSmall(data, logo);
}

/**
 * The contents as the label lists them: identical units as one line, and under
 * each such line the accessories its units carry, counted per unit where they
 * all carry the same. `items` come in case order, each unit before its own
 * accessories (see `ordered` in services/case-check.ts).
 */
export function caseLabelLines(
	items: { assetId: string; name: string; accessoryOf: string | null }[]
): CaseLabelLine[] {
	const groups: { name: string; ids: string[] }[] = [];
	for (const item of items) {
		if (item.accessoryOf) continue;
		const group = groups.find((g) => g.name === item.name);
		if (group) group.ids.push(item.assetId);
		else groups.push({ name: item.name, ids: [item.assetId] });
	}

	const lines: CaseLabelLine[] = [];
	for (const group of groups) {
		lines.push({ count: group.ids.length, name: group.name, accessory: false, each: null });
		const members = new Set(group.ids);
		const perParent = new Map<string, Map<string, number>>();
		for (const item of items) {
			if (!item.accessoryOf || !members.has(item.accessoryOf)) continue;
			const counts = perParent.get(item.name) ?? new Map<string, number>();
			counts.set(item.accessoryOf, (counts.get(item.accessoryOf) ?? 0) + 1);
			perParent.set(item.name, counts);
		}
		for (const [name, counts] of perParent) {
			const total = [...counts.values()].reduce((a, b) => a + b, 0);
			const first = counts.get(group.ids[0]);
			const uniform = first !== undefined && group.ids.every((id) => counts.get(id) === first);
			lines.push({
				count: total,
				name,
				accessory: true,
				each: group.ids.length > 1 && uniform ? first : null
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
