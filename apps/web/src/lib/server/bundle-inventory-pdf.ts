import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { naturalCompare } from '#lib/sort.js';
import { embedInter } from './fonts';
import { fmtDate, safe, wrap } from './pdf-text.ts';
import { embedLogo } from './pdf-logo.ts';
import { pdfThumbnail } from './pdf-thumbnail.ts';

// A kit's inventory list (Inventarliste): the sheet in the lid of a case, so
// whoever opens it sees at a glance what belongs inside. Pictures and counts,
// no tags, serial numbers or boxes to tick — it is read, not filled in. Always
// landscape, on A4 or A5, as tiles (`grid`) or as a denser list (`list`).

export type InventorySheetSize = 'a4' | 'a5';
export type InventorySheetLayout = 'grid' | 'list';

/** A line of small type under a tile's name: "je 1× Netzteil". */
export type InventoryTileDetail = { count: number; each: boolean; name: string };

/**
 * One tile of the grid, or one row of the list.
 *
 * `product`: identical units of one product carrying the same accessories,
 * which are its `details`. `kit`: a kit packed inside this one (not stored
 * yet — a bundle in a bundle). It would be drawn exactly the same way: its
 * preview as the picture, `count` identical kits, and its contents as the
 * `details`. The renderer does not tell the two apart.
 */
export type InventoryTile = {
	kind: 'product' | 'kit';
	count: number;
	name: string;
	maker: string | null;
	/** Object key of the picture; null draws the placeholder. */
	imagePath: string | null;
	details: InventoryTileDetail[];
	/**
	 * Set on an accessory's own tile: the unit it belongs to, printed small
	 * ("Zubehör zu Auro Spot Z 300") so it reads as part of that one.
	 */
	accessoryOf: string | null;
};

export type InventorySheet = {
	name: string;
	caption: string | null;
	tag: string | null;
	organization: { name: string; logoPath: string | null };
	tiles: InventoryTile[];
	/** Every unit in the case, accessories included — the footer's "Stück". */
	unitCount: number;
};

/** A unit in the case, as `inventoryTiles` groups it. */
export type InventoryUnit = {
	id: string;
	/** The unit it is an accessory of, when that unit is in the same case. */
	parentId: string | null;
	productId: string;
	name: string;
	maker: string | null;
	imagePath: string | null;
};

/**
 * The tiles of a case: its units one tile per product and accessory set, and
 * right after each, one tile per accessory it carries — with its own picture
 * and the total, because in a case lid the brackets and safeties are as much
 * what belongs in it as the fixtures. Identical units whose accessories differ
 * are two tiles, so each accessory tile's total belongs to exactly one.
 * Accessories of accessories count towards the top unit.
 */
export function inventoryTiles(units: InventoryUnit[]): InventoryTile[] {
	const byId = new Map(units.map((unit) => [unit.id, unit]));
	const rootOf = (unit: InventoryUnit) => {
		let current = unit;
		const seen = new Set<string>();
		while (current.parentId && byId.has(current.parentId) && !seen.has(current.id)) {
			seen.add(current.id);
			current = byId.get(current.parentId)!;
		}
		return current;
	};

	const accessories = new Map<string, InventoryUnit[]>();
	for (const unit of units) {
		const root = rootOf(unit);
		if (root === unit) continue;
		accessories.set(root.id, [...(accessories.get(root.id) ?? []), unit]);
	}

	type Carried = { name: string; maker: string | null; imagePath: string | null; count: number };
	const groups = new Map<
		string,
		{ signature: string; tile: InventoryTile; carried: [string, Carried][] }
	>();
	for (const unit of units) {
		if (rootOf(unit) !== unit) continue;
		const counts = new Map<string, Carried>();
		for (const accessory of accessories.get(unit.id) ?? []) {
			const entry = counts.get(accessory.productId) ?? {
				name: accessory.name,
				maker: accessory.maker,
				imagePath: accessory.imagePath,
				count: 0
			};
			entry.count++;
			counts.set(accessory.productId, entry);
		}
		const carried = [...counts].sort(
			(a, b) => naturalCompare(a[1].name, b[1].name) || a[0].localeCompare(b[0])
		);
		const signature = carried.map(([id, { count }]) => `${id}:${count}`).join(',');
		const key = `${unit.productId}|${signature}`;
		const known = groups.get(key);
		if (known) {
			known.tile.count++;
			continue;
		}
		groups.set(key, {
			signature,
			carried,
			tile: {
				kind: 'product',
				count: 1,
				name: unit.name,
				maker: unit.maker,
				imagePath: unit.imagePath,
				details: [],
				accessoryOf: null
			}
		});
	}
	// A kit packed in this one would become a `kind: 'kit'` tile here.

	return [...groups.values()]
		.sort(
			(a, b) =>
				naturalCompare(a.tile.maker ?? '', b.tile.maker ?? '') ||
				naturalCompare(a.tile.name, b.tile.name) ||
				a.signature.localeCompare(b.signature)
		)
		.flatMap(({ tile, carried }) => [
			tile,
			...carried.map(([, accessory]) => ({
				kind: 'product' as const,
				// The total in the case: a bracket pair on each of four spots is 8.
				count: accessory.count * tile.count,
				name: accessory.name,
				maker: accessory.maker,
				imagePath: accessory.imagePath,
				details: [],
				accessoryOf: tile.name
			}))
		]);
}

// Landscape both ways. A5 is A4 at 0.74: the same sheet, smaller, so the two
// read alike. Grid columns are a range: as few as fit the case on one page,
// for the biggest pictures that still do.
const PAGES = {
	a4: { w: 841.89, h: 595.28, margin: 30, scale: 1, minCols: 3, maxCols: 5, listCols: 2 },
	a5: { w: 595.28, h: 419.53, margin: 22, scale: 0.74, minCols: 3, maxCols: 4, listCols: 2 }
} as const;

const black = rgb(0.05, 0.05, 0.05);
const muted = rgb(0.38, 0.38, 0.38);
const faint = rgb(0.8, 0.8, 0.8);
const placeholderFill = rgb(0.95, 0.95, 0.95);
const placeholderIcon = rgb(0.72, 0.72, 0.72);

/** Big enough for the widest tile picture at print resolution. */
const THUMBNAIL_BOX = { width: 720, height: 540 };
/** Accessory lines a tile shows before the rest is summed up. */
const MAX_DETAILS = 6;
/** The smallest a tile's picture gets to make two rows share a page, at A4. */
const MIN_PICTURE = 60;

export async function generateBundleInventoryPdf(
	data: InventorySheet,
	size: InventorySheetSize,
	layout: InventorySheetLayout
) {
	const pdf = await PDFDocument.create();
	const { regular, bold } = await embedInter(pdf);
	const logo = await embedLogo(pdf, data.organization.logoPath);

	const images = new Map<string, PDFImage>();
	await Promise.all(
		[...new Set(data.tiles.map((tile) => tile.imagePath).filter(Boolean) as string[])].map(
			async (path) => {
				const bytes = await pdfThumbnail(path, THUMBNAIL_BOX);
				if (bytes) images.set(path, await pdf.embedJpg(bytes));
			}
		)
	);

	const P = PAGES[size];
	const s = P.scale;
	const contentW = P.w - 2 * P.margin;
	const left = P.margin;
	const right = P.w - P.margin;

	// ── Text ────────────────────────────────────────────────────────────────
	const fitLine = (value: string, font: PDFFont, sz: number, width: number) => {
		const clean = safe(value, font);
		if (font.widthOfTextAtSize(clean, sz) <= width) return clean;
		const chars = [...clean];
		while (chars.length > 1 && font.widthOfTextAtSize(chars.join('').trimEnd() + '…', sz) > width)
			chars.pop();
		return chars.join('').trimEnd() + '…';
	};
	/** Wrapped into at most `max` lines, the last one cut short if need be. */
	const lines = (value: string, font: PDFFont, sz: number, width: number, max: number) => {
		const wrapped = wrap(value, font, sz, width).filter(Boolean);
		if (wrapped.length > max) wrapped.splice(max - 1, Infinity, wrapped.slice(max - 1).join(' '));
		return wrapped.map((line) => fitLine(line, font, sz, width));
	};
	const cap = (font: PDFFont, sz: number) => font.heightAtSize(sz, { descender: false });
	const text = (
		page: PDFPage,
		value: string,
		x: number,
		y: number,
		sz: number,
		font = regular,
		color = black
	) => page.drawText(value, { x, y, size: sz, font, color });
	const textRight = (
		page: PDFPage,
		value: string,
		rx: number,
		y: number,
		sz: number,
		font = regular,
		color = black
	) => text(page, value, rx - font.widthOfTextAtSize(value, sz), y, sz, font, color);

	const roundedRect = (w: number, h: number, r: number) =>
		`M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} ` +
		`H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;

	/** The picture fitted and centred in its box, or a neutral placeholder. */
	const picture = (
		page: PDFPage,
		path: string | null,
		x: number,
		top: number,
		w: number,
		h: number
	) => {
		const image = path ? images.get(path) : undefined;
		if (image) {
			const fit = image.scaleToFit(w, h);
			page.drawImage(image, {
				x: x + (w - fit.width) / 2,
				y: top - h + (h - fit.height) / 2,
				width: fit.width,
				height: fit.height
			});
			return;
		}
		page.drawSvgPath(roundedRect(w, h, Math.min(4 * s, h / 6)), {
			x,
			y: top,
			color: placeholderFill
		});
		// Lucide's "image" icon, drawn in outline at the centre.
		const icon = Math.min(w, h) * 0.32;
		const k = icon / 24;
		const ix = x + (w - icon) / 2;
		const iy = top - (h - icon) / 2;
		for (const d of [
			'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
			'M7 9a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
			'M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21'
		]) {
			page.drawSvgPath(d, {
				x: ix,
				y: iy,
				scale: k,
				borderColor: placeholderIcon,
				borderWidth: 1.6
			});
		}
	};

	const detailText = (detail: InventoryTileDetail) =>
		`${detail.each ? 'je ' : ''}${detail.count}× ${detail.name}`;
	/** Accessory lines, the ones past MAX_DETAILS summed up in one. */
	const detailLines = (tile: InventoryTile, sz: number, width: number) => {
		const shown = tile.details.length > MAX_DETAILS ? MAX_DETAILS - 1 : MAX_DETAILS;
		const note = tile.accessoryOf
			? lines(`Zubehör zu ${tile.accessoryOf}`, regular, sz, width, 2)
			: [];
		const result = note.concat(
			tile.details
				.slice(0, shown)
				.flatMap((detail) => lines(detailText(detail), regular, sz, width, 2))
		);
		const rest = tile.details.length - shown;
		if (rest > 0) result.push(`und ${rest} weitere`);
		return result;
	};

	// Type sizes of a tile or row; the count's differs between the layouts.
	const NAME = 10.5 * s;
	const MAKER = 7.5 * s;
	const DETAIL = 7.5 * s;

	/**
	 * Count, maker, name and accessories, from `top` down; returns where they
	 * end. The count shares its baseline with the name's first line, so the eye
	 * reads "4× Name", and the maker sits above the name. Draws nothing without
	 * a page, which is how both layouts measure a tile before placing it.
	 */
	const textBlock = (
		page: PDFPage | null,
		o: {
			top: number;
			count: string;
			countSize: number;
			/** Left edge of the count, or its right edge when `alignRight`. */
			countX: number;
			alignRight?: boolean;
			nameX: number;
			detailX: number;
			maker: string | null;
			name: string[];
			details: string[];
		}
	) => {
		const makerH = o.maker ? cap(regular, MAKER) + 4 * s : 0;
		const baseline = o.top - Math.max(cap(bold, o.countSize), makerH + cap(bold, NAME));
		if (page) {
			if (o.alignRight) textRight(page, o.count, o.countX, baseline, o.countSize, bold);
			else text(page, o.count, o.countX, baseline, o.countSize, bold);
			if (o.maker) {
				text(page, o.maker, o.nameX, baseline + cap(bold, NAME) + 4 * s, MAKER, regular, muted);
			}
		}
		let y = baseline;
		o.name.forEach((line, i) => {
			if (i > 0) y -= NAME * 1.2;
			if (page) text(page, line, o.nameX, y, NAME, bold);
		});
		y -= NAME * 0.3;
		if (o.details.length) y -= 3 * s;
		for (const line of o.details) {
			y -= DETAIL * 1.3;
			if (page) text(page, line, o.detailX, y + DETAIL * 0.3, DETAIL, regular, muted);
		}
		return y;
	};

	// ── Header, the same on every page ──────────────────────────────────────
	const LOGO_W = 150 * s;
	const LOGO_H = 44 * s;
	const NAME_SIZE = 24 * s;
	const nameWidth = contentW - LOGO_W - 24 * s;
	const nameLines = lines(data.name, bold, NAME_SIZE, nameWidth, 2);
	const captionLines = data.caption ? lines(data.caption, regular, 10 * s, nameWidth, 1) : [];
	const META_SIZE = 9 * s;
	// No location: a case moves between shelves, and a sheet in its lid that
	// names the old one is wrong for the rest of its life.
	const hasMeta = Boolean(data.tag);
	const headerHeight =
		cap(regular, 7.5 * s) +
		8 * s +
		nameLines.length * NAME_SIZE * 1.12 +
		captionLines.length * 13 * s +
		(hasMeta ? 22 * s : 4 * s) +
		10 * s;

	const drawHeader = (page: PDFPage) => {
		const top = P.h - P.margin;
		let y = top - cap(regular, 7.5 * s);
		text(page, 'INVENTARLISTE', left, y, 7.5 * s, bold, muted);
		y -= 8 * s;
		for (const line of nameLines) {
			y -= cap(bold, NAME_SIZE);
			text(page, line, left, y, NAME_SIZE, bold);
			y -= NAME_SIZE * 1.12 - cap(bold, NAME_SIZE);
		}
		for (const line of captionLines) {
			y -= 13 * s;
			text(page, line, left, y + 2 * s, 10 * s, regular, muted);
		}
		if (hasMeta) {
			y -= 18 * s;
			const x = left;
			if (data.tag) {
				const tag = fitLine(data.tag, bold, META_SIZE, nameWidth / 2);
				const tagW = bold.widthOfTextAtSize(tag, META_SIZE) + 12 * s;
				const tagH = META_SIZE + 7 * s;
				page.drawSvgPath(roundedRect(tagW, tagH, 3 * s), {
					x,
					y: y + (tagH + cap(bold, META_SIZE)) / 2,
					borderColor: black,
					borderWidth: 0.8
				});
				text(page, tag, x + 6 * s, y, META_SIZE, bold);
			}
		}

		if (logo) {
			const fit = logo.scaleToFit(LOGO_W, LOGO_H);
			page.drawImage(logo, { x: right - fit.width, y: top - fit.height, ...fit });
		} else {
			const orgLines = lines(data.organization.name, bold, 12 * s, LOGO_W, 2);
			let oy = top - cap(bold, 12 * s);
			for (const line of orgLines) {
				textRight(page, line, right, oy, 12 * s, bold);
				oy -= 15 * s;
			}
		}

		const ruleY = top - headerHeight;
		page.drawLine({
			start: { x: left, y: ruleY },
			end: { x: right, y: ruleY },
			thickness: 0.8,
			color: black
		});
	};

	const FOOTER_SIZE = 7.5 * s;
	const footerY = P.margin * 0.55;
	const contentTop = P.h - P.margin - headerHeight - 14 * s;
	const contentBottom = footerY + FOOTER_SIZE + 10 * s;

	const pages: PDFPage[] = [];
	const newPage = () => {
		const page = pdf.addPage([P.w, P.h]);
		drawHeader(page);
		pages.push(page);
		return page;
	};

	// ── Grid ────────────────────────────────────────────────────────────────
	const PAD = 8 * s;
	const GAP = 10 * s;
	const COUNT_SIZE = 22 * s;

	type TileLayout = {
		countText: string;
		countW: number;
		maker: string | null;
		name: string[];
		details: string[];
		/** Everything but the picture, padding included. */
		textH: number;
	};
	const tileLayout = (tile: InventoryTile, width: number): TileLayout => {
		const inner = width - 2 * PAD;
		const countText = `${tile.count}×`;
		const countW = bold.widthOfTextAtSize(countText, COUNT_SIZE) + 6 * s;
		const textW = inner - countW;
		const maker = tile.maker ? fitLine(tile.maker, regular, MAKER, textW) : null;
		const name = lines(tile.name, bold, NAME, textW, 3);
		const details = detailLines(tile, DETAIL, inner);
		const block = -textBlock(null, {
			top: 0,
			count: countText,
			countSize: COUNT_SIZE,
			countX: 0,
			nameX: 0,
			detailX: 0,
			maker,
			name,
			details
		});
		return { countText, countW, maker, name, details, textH: PAD + 8 * s + block + PAD };
	};

	const drawTile = (
		page: PDFPage,
		tile: InventoryTile,
		l: TileLayout,
		x: number,
		top: number,
		width: number,
		height: number,
		pictureH: number
	) => {
		page.drawSvgPath(roundedRect(width, height, 6 * s), {
			x,
			y: top,
			borderColor: faint,
			borderWidth: 0.8
		});
		const inner = width - 2 * PAD;
		picture(page, tile.imagePath, x + PAD, top - PAD, inner, pictureH);

		textBlock(page, {
			top: top - PAD - pictureH - 8 * s,
			count: l.countText,
			countSize: COUNT_SIZE,
			countX: x + PAD,
			nameX: x + PAD + l.countW,
			detailX: x + PAD,
			maker: l.maker,
			name: l.name,
			details: l.details
		});
	};

	const drawGrid = () => {
		const available = contentTop - contentBottom;
		const widthFor = (cols: number) => (contentW - GAP * (cols - 1)) / cols;
		// A picture as big as the tile's width allows, but where the case takes
		// more than one row, small enough that two rows share a page.
		const rowsFor = (cols: number) => {
			const width = widthFor(cols);
			const room = data.tiles.length > cols ? (available - GAP) / 2 : available;
			const rows: {
				tiles: InventoryTile[];
				layouts: TileLayout[];
				pictureH: number;
				height: number;
			}[] = [];
			for (let i = 0; i < data.tiles.length; i += cols) {
				const tiles = data.tiles.slice(i, i + cols);
				const layouts = tiles.map((tile) => tileLayout(tile, width));
				const textH = Math.max(...layouts.map((l) => l.textH));
				const pictureH = Math.max(
					MIN_PICTURE * s,
					Math.min((width - 2 * PAD) * 0.75, 210 * s, room - textH)
				);
				rows.push({ tiles, layouts, pictureH, height: textH + pictureH });
			}
			return rows;
		};
		const fitsOnePage = (rows: ReturnType<typeof rowsFor>) =>
			rows.reduce((sum, row) => sum + row.height, 0) + GAP * (rows.length - 1) <= available;

		// The fewest columns that still get the case onto one page; a case too
		// big for any goes at the most and runs on.
		// One or two positions get half the page each rather than a third.
		let cols: number = P.maxCols;
		for (let c = data.tiles.length <= 2 ? 2 : P.minCols; c < P.maxCols; c++) {
			if (fitsOnePage(rowsFor(c))) {
				cols = c;
				break;
			}
		}
		const width = widthFor(cols);

		let page = newPage();
		let y = contentTop;
		let first = true;
		for (const row of rowsFor(cols)) {
			// A row that almost fits under the last one gives up some picture.
			const short = row.height - (y - contentBottom);
			if (!first && short > 0 && row.pictureH - short >= MIN_PICTURE * s) {
				row.pictureH -= short;
				row.height -= short;
			}
			if (!first && y - row.height < contentBottom) {
				page = newPage();
				y = contentTop;
			}
			row.tiles.forEach((tile, i) =>
				drawTile(
					page,
					tile,
					row.layouts[i],
					left + i * (width + GAP),
					y,
					width,
					row.height,
					row.pictureH
				)
			);
			y -= row.height + GAP;
			first = false;
		}
	};

	// ── List ────────────────────────────────────────────────────────────────
	const drawList = () => {
		const COL_GAP = 24 * s;
		const colW = (contentW - COL_GAP * (P.listCols - 1)) / P.listCols;
		const PIC_W = 60 * s;
		const PIC_H = 45 * s;
		const ROW_PAD = 6 * s;
		const LIST_COUNT = 16 * s;
		const countCol = 40 * s;
		const textX = PIC_W + 10 * s + countCol + 6 * s;
		const textW = colW - textX;

		const rowLayout = (tile: InventoryTile) => {
			const maker = tile.maker ? fitLine(tile.maker, regular, MAKER, textW) : null;
			const name = lines(tile.name, bold, NAME, textW, 2);
			const details = detailLines(tile, DETAIL, textW);
			const block = (top: number) => ({
				top,
				count: `${tile.count}×`,
				countSize: LIST_COUNT,
				countX: PIC_W + 10 * s + countCol,
				alignRight: true,
				nameX: textX,
				detailX: textX,
				maker,
				name,
				details
			});
			const textH = -textBlock(null, block(0));
			return { block, height: Math.max(PIC_H, textH) + 2 * ROW_PAD };
		};

		const rows = data.tiles.map((tile) => ({ tile, layout: rowLayout(tile) }));
		const capacity = contentTop - contentBottom;
		const heightOf = (indices: number[]) =>
			indices.reduce((sum, index) => sum + rows[index].layout.height, 0);

		const drawRow = (page: PDFPage, index: number, x: number, top: number) => {
			const { tile, layout: l } = rows[index];
			picture(page, tile.imagePath, x, top - ROW_PAD, PIC_W, PIC_H);
			const block = l.block(top - ROW_PAD);
			textBlock(page, {
				...block,
				countX: x + block.countX,
				nameX: x + block.nameX,
				detailX: x + block.detailX
			});
			const bottom = top - l.height;
			page.drawLine({
				start: { x, y: bottom },
				end: { x: x + colW, y: bottom },
				thickness: 0.4,
				color: faint
			});
			return bottom;
		};

		// A page takes what fits in its columns filled one after the other; then
		// those rows are shared out so the columns end at about the same height,
		// instead of a full left column next to an empty right one.
		let next = 0;
		while (next < rows.length) {
			const greedy: number[][] = [[]];
			let used = 0;
			let index = next;
			for (; index < rows.length; index++) {
				const h = rows[index].layout.height;
				const column = greedy[greedy.length - 1];
				if (used + h > capacity && column.length > 0) {
					if (greedy.length === P.listCols) break;
					greedy.push([]);
					used = 0;
				}
				greedy[greedy.length - 1].push(index);
				used += h;
			}
			const onPage = greedy.flat();
			const target = heightOf(onPage) / P.listCols;
			const balanced: number[][] = [[]];
			let acc = 0;
			for (const row of onPage) {
				const h = rows[row].layout.height;
				const column = balanced[balanced.length - 1];
				if (
					column.length > 0 &&
					balanced.length < P.listCols &&
					acc + h / 2 > target * balanced.length
				) {
					balanced.push([]);
				}
				balanced[balanced.length - 1].push(row);
				acc += h;
			}
			const columns = balanced.every((column) => heightOf(column) <= capacity) ? balanced : greedy;

			const page = newPage();
			columns.forEach((column, c) => {
				const x = left + c * (colW + COL_GAP);
				let y = contentTop;
				for (const row of column) y = drawRow(page, row, x, y);
			});
			next = index;
		}
	};

	if (data.tiles.length === 0) {
		const page = newPage();
		text(page, 'Diese Kiste ist leer.', left, contentTop - 14 * s, 11 * s, regular, muted);
	} else if (layout === 'grid') drawGrid();
	else drawList();

	// ── Footer ──────────────────────────────────────────────────────────────
	const summary = `${data.tiles.length} ${data.tiles.length === 1 ? 'Position' : 'Positionen'} · ${data.unitCount} Stück`;
	const stamp = `Stand ${fmtDate(new Date())}`;
	pages.forEach((page, index) => {
		text(page, summary, left, footerY, FOOTER_SIZE, regular, muted);
		const right1 = pages.length > 1 ? `${stamp} · Seite ${index + 1}/${pages.length}` : stamp;
		textRight(page, right1, right, footerY, FOOTER_SIZE, regular, muted);
	});

	const title = data.tag ? `${data.name} (${data.tag})` : data.name;
	pdf.setTitle(`Inventarliste - ${title}`);
	pdf.setProducer('Technikpool');
	return pdf.save();
}
