export type StickerType = 'quadratisch' | 'faehnchen';

export interface InventoryRange {
	from: number;
	to?: number;
	copies: number;
	payloadTemplate?: string;
	labelPrefix?: string;
	padLength?: number;
}

export interface StickerSize {
	widthMm: number;
	heightMm: number;
	/** Only meaningful for the 'faehnchen' type. */
	flagTailMm?: number;
}

export interface SheetLayout {
	pageWidthMm: number;
	pageHeightMm: number;
	marginLeftMm: number;
	marginTopMm: number;
	gapXMm: number;
	gapYMm: number;
	columns: number;
	rows: number;
	headerHeightMm: number;
}

export interface GeneratorOptions {
	type: StickerType;
	output: string;
	color: string;
	logoText?: string;
	brandText?: string;
	items: InventoryRange[];
	size: StickerSize;
	layout: SheetLayout;
	matrixScale: number;
	quietZoneMm: number;
	bleedMm: number;
}

export interface StickerItem {
	number: number;
	label: string;
	payload: string;
}

/**
 * One grid position on a page. `sticker` is null for a blank position — kept
 * only to avoid splitting a multi-copy group across a page boundary (the
 * rest of the page is padded blank so the group starts fresh on the next
 * page); blank positions are not drawn at all.
 *
 * `groupIndex`/`groupSize` identify which same-number copies a position
 * belongs to, so the sheet can draw a box around each group — `groupSize`
 * is 1 (or 0 for blanks) when there's nothing to box.
 */
export interface GridPosition {
	indexOnPage: number;
	xMm: number;
	yMm: number;
	sticker: StickerItem | null;
	groupIndex: number;
	groupSize: number;
}

export interface SheetPage {
	pageIndex: number;
	totalPages: number;
	positions: GridPosition[];
}
