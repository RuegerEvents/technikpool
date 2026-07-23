import type { GeneratorOptions, SheetPage, StickerItem } from './types';

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

export function expandStickerItems(options: Pick<GeneratorOptions, 'items'>): StickerItem[] {
	const result: StickerItem[] = [];
	for (const range of options.items) {
		const to = range.to ?? range.from;
		for (let number = range.from; number <= to; number += 1) {
			const label = renderLabel(range.labelPrefix, range.padLength, number);
			for (let copy = 0; copy < range.copies; copy += 1) {
				result.push({
					number,
					label,
					payload: renderPayload(range.payloadTemplate, number, label)
				});
			}
		}
	}
	return result;
}

export function paginateStickers(options: GeneratorOptions): SheetPage[] {
	const items = expandStickerItems(options);
	const perPage = options.layout.columns * options.layout.rows;
	const totalPages = Math.max(1, Math.ceil(items.length / perPage));
	const pages: SheetPage[] = [];

	for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
		const pageItems = items.slice(pageIndex * perPage, (pageIndex + 1) * perPage);
		pages.push({
			pageIndex,
			totalPages,
			stickers: pageItems.map((item, indexOnPage) => {
				const col = indexOnPage % options.layout.columns;
				const row = Math.floor(indexOnPage / options.layout.columns);
				return {
					...item,
					indexOnPage,
					xMm: options.layout.marginLeftMm + col * (options.size.widthMm + options.layout.gapXMm),
					yMm:
						options.layout.marginTopMm +
						options.layout.headerHeightMm +
						row * (options.size.heightMm + options.layout.gapYMm)
				};
			})
		});
	}

	return pages;
}
