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
	showCutLines: boolean;
}

export interface StickerItem {
	number: number;
	label: string;
	payload: string;
}

export interface PageSticker extends StickerItem {
	indexOnPage: number;
	xMm: number;
	yMm: number;
}

export interface SheetPage {
	pageIndex: number;
	totalPages: number;
	stickers: PageSticker[];
}
