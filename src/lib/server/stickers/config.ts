import { DEFAULT_BLEED_MM, MIN_STICKER_SIZE_MM, minCutLineGapMm } from './geometry';
import type { GeneratorOptions, SheetLayout, StickerSize } from './types';

export interface RawGeneratorOptions {
	type?: 'quadratisch' | 'faehnchen';
	output?: string;
	color?: string;
	logoText?: string;
	brandText?: string;
	items: {
		from: number;
		to?: number;
		copies: number;
		payloadTemplate?: string;
		labelPrefix?: string;
		padLength?: number;
	}[];
	size?: Partial<StickerSize>;
	layout?: Partial<SheetLayout>;
	matrixScale?: number;
	quietZoneMm?: number;
	bleedMm?: number;
}

const defaultSquareSize: StickerSize = { widthMm: 15, heightMm: 15 };
const defaultFlagSize: StickerSize = { widthMm: 25, heightMm: 15, flagTailMm: 31 };

const defaultSquareLayout: SheetLayout = {
	pageWidthMm: 303,
	pageHeightMm: 216,
	marginLeftMm: 6,
	marginTopMm: 13,
	gapXMm: 10,
	gapYMm: 10,
	columns: 12,
	rows: 8,
	headerHeightMm: 10
};

const defaultFlagLayout: SheetLayout = {
	pageWidthMm: 303,
	pageHeightMm: 216,
	marginLeftMm: 8,
	marginTopMm: 16,
	gapXMm: 10,
	gapYMm: 10,
	columns: 4,
	rows: 7,
	headerHeightMm: 10
};

function assertPositive(value: number, name: string) {
	if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be greater than 0`);
}

function assertNonNegative(value: number, name: string) {
	if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be 0 or greater`);
}

export function normalizeOptions(raw: RawGeneratorOptions): GeneratorOptions {
	const type = raw.type ?? 'quadratisch';
	if (type !== 'quadratisch' && type !== 'faehnchen') throw new Error('Invalid sticker type');
	if (!/^#[0-9a-fA-F]{6}$/.test(raw.color ?? '#0069c9'))
		throw new Error('Color must be a #RRGGBB hex value');
	if (!raw.items?.length) throw new Error('At least one number range is required');

	const items = raw.items.map((item, index) => {
		const from = Number(item.from);
		const to = item.to === undefined || item.to === null ? undefined : Number(item.to);
		const copies = Number(item.copies);
		if (!Number.isInteger(from) || from < 0)
			throw new Error(`Range ${index + 1}: from must be a positive whole number`);
		if (to !== undefined && (!Number.isInteger(to) || to < from))
			throw new Error(`Range ${index + 1}: to must be greater than or equal to from`);
		if (!Number.isInteger(copies) || copies <= 0)
			throw new Error(`Range ${index + 1}: copies must be greater than 0`);
		return {
			from,
			to,
			copies,
			payloadTemplate: item.payloadTemplate?.trim() || undefined,
			labelPrefix: item.labelPrefix?.trim() || undefined,
			padLength: item.padLength
		};
	});

	const defaultLayout = type === 'quadratisch' ? defaultSquareLayout : defaultFlagLayout;
	const defaultSize = type === 'quadratisch' ? defaultSquareSize : defaultFlagSize;
	const size = { ...defaultSize, ...raw.size };
	const layout = { ...defaultLayout, ...raw.layout };

	for (const [key, value] of Object.entries(size)) {
		if (key === 'flagTailMm' && type !== 'faehnchen') continue;
		assertPositive(Number(value), `size.${key}`);
	}
	if (size.widthMm < MIN_STICKER_SIZE_MM || size.heightMm < MIN_STICKER_SIZE_MM) {
		throw new Error(
			`Sticker size must be at least ${MIN_STICKER_SIZE_MM}mm per side (print shop minimum)`
		);
	}

	for (const [key, value] of Object.entries(layout)) {
		if (key === 'columns' || key === 'rows') {
			if (!Number.isInteger(value) || Number(value) <= 0)
				throw new Error(`layout.${key} must be a positive whole number`);
		} else if (key.startsWith('gap') || key.startsWith('margin') || key === 'headerHeightMm') {
			assertNonNegative(Number(value), `layout.${key}`);
		} else {
			assertPositive(Number(value), `layout.${key}`);
		}
	}
	const bleedMm = raw.bleedMm ?? DEFAULT_BLEED_MM;
	assertPositive(bleedMm, 'bleedMm');
	const minGapMm = minCutLineGapMm(bleedMm);
	if (layout.gapXMm < minGapMm || layout.gapYMm < minGapMm) {
		throw new Error(
			`Gap between stickers must be at least ${minGapMm}mm for a ${bleedMm}mm bleed — the bleed on ` +
				`each sticker extends outward, so a smaller gap would make adjacent stickers' bleeds overlap.`
		);
	}

	const footprintWidthMm = size.widthMm + (size.flagTailMm ?? 0);
	const gridWidthMm = layout.columns * footprintWidthMm + (layout.columns - 1) * layout.gapXMm;
	const gridHeightMm = layout.rows * size.heightMm + (layout.rows - 1) * layout.gapYMm;
	if (layout.marginLeftMm * 2 + gridWidthMm > layout.pageWidthMm) {
		throw new Error(
			`Grid is too wide for the page: ${layout.columns} columns of ${footprintWidthMm.toFixed(1)}mm ` +
				`need ${gridWidthMm.toFixed(1)}mm, but only ${(layout.pageWidthMm - layout.marginLeftMm * 2).toFixed(1)}mm is available. ` +
				`Reduce columns or sticker/tail size.`
		);
	}
	if (layout.marginTopMm + layout.headerHeightMm + gridHeightMm > layout.pageHeightMm) {
		throw new Error(
			`Grid is too tall for the page: ${layout.rows} rows of ${size.heightMm}mm ` +
				`need ${gridHeightMm.toFixed(1)}mm, but only ` +
				`${(layout.pageHeightMm - layout.marginTopMm - layout.headerHeightMm).toFixed(1)}mm is available. ` +
				`Reduce rows or sticker height.`
		);
	}

	return {
		type,
		output: raw.output ?? 'stickerbogen.pdf',
		color: raw.color ?? '#0069c9',
		logoText: raw.logoText?.trim() || undefined,
		brandText: raw.brandText?.trim() || undefined,
		items,
		size,
		layout,
		matrixScale: raw.matrixScale ?? 0.68,
		quietZoneMm: raw.quietZoneMm ?? 1.1,
		bleedMm
	};
}

export function parseHexColor(hex: string): { r: number; g: number; b: number } {
	const normalized = hex.match(/^#[0-9a-fA-F]{6}$/) ? hex : '#0069c9';
	return {
		r: Number.parseInt(normalized.slice(1, 3), 16) / 255,
		g: Number.parseInt(normalized.slice(3, 5), 16) / 255,
		b: Number.parseInt(normalized.slice(5, 7), 16) / 255
	};
}
