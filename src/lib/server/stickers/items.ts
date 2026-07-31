import type { GeneratorOptions, GridPosition, SheetPage, StickerItem } from './types';

function renderLabel(
	prefix: string | undefined,
	padLength: number | undefined,
	number: number
): string {
	const numericPart = padLength ? String(number).padStart(padLength, '0') : String(number);
	return `${prefix ?? ''}${numericPart}`;
}

function renderPayload(template: string | undefined, number: number, label: string): string {
	if (!template) return label;
	return template.replaceAll('{number}', String(number)).replaceAll('{label}', label);
}

/** Every number's copies, grouped — each group must stay contiguous and on one page. */
function expandStickerGroups(options: Pick<GeneratorOptions, 'items'>): StickerItem[][] {
	const groups: StickerItem[][] = [];
	for (const range of options.items) {
		const to = range.to ?? range.from;
		for (let number = range.from; number <= to; number += 1) {
			const label = renderLabel(range.labelPrefix, range.padLength, number);
			const group: StickerItem[] = [];
			for (let copy = 0; copy < range.copies; copy += 1) {
				group.push({ number, label, payload: renderPayload(range.payloadTemplate, number, label) });
			}
			groups.push(group);
		}
	}
	return groups;
}

interface PackedCell {
	sticker: StickerItem | null;
	groupIndex: number;
	groupSize: number;
}

const BLANK_CELL: PackedCell = { sticker: null, groupIndex: -1, groupSize: 0 };

/**
 * Packs groups into grid cells left-to-right, row by row, wrapping freely
 * within a page (a group may straddle a row break). A group only skips ahead
 * when it wouldn't fit in what's left of the *page* — the rest of that page
 * is left blank and the group starts fresh on the next page, so no group is
 * ever split across two physical sheets.
 */
function packIntoGridCells(groups: StickerItem[][], perPage: number): PackedCell[] {
	const cells: PackedCell[] = [];

	groups.forEach((group, groupIndex) => {
		const usedOnPage = cells.length % perPage;
		const remainingOnPage = perPage - usedOnPage;
		if (usedOnPage > 0 && group.length > remainingOnPage) {
			for (let i = 0; i < remainingOnPage; i += 1) cells.push(BLANK_CELL);
		}
		for (const item of group) {
			cells.push({ sticker: item, groupIndex, groupSize: group.length });
		}
	});
	while (cells.length % perPage !== 0) cells.push(BLANK_CELL);

	return cells;
}

export function paginateStickers(options: GeneratorOptions): SheetPage[] {
	const groups = expandStickerGroups(options);
	const { columns, rows } = options.layout;
	const perPage = columns * rows;
	const cells = packIntoGridCells(groups, perPage);
	const totalPages = Math.max(1, cells.length / perPage);
	const pages: SheetPage[] = [];
	const footprintWidthMm = options.size.widthMm + (options.size.flagTailMm ?? 0);

	for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
		const pageCells = cells.slice(pageIndex * perPage, (pageIndex + 1) * perPage);
		pages.push({
			pageIndex,
			totalPages,
			positions: pageCells.map((cell, indexOnPage): GridPosition => {
				const col = indexOnPage % columns;
				const row = Math.floor(indexOnPage / columns);
				return {
					indexOnPage,
					xMm: options.layout.marginLeftMm + col * (footprintWidthMm + options.layout.gapXMm),
					yMm:
						options.layout.marginTopMm +
						options.layout.headerHeightMm +
						row * (options.size.heightMm + options.layout.gapYMm),
					sticker: cell.sticker,
					groupIndex: cell.groupIndex,
					groupSize: cell.groupSize
				};
			})
		});
	}

	return pages;
}
