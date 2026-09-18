import type { PDFFont } from 'pdf-lib';

// Text helpers shared by every generated document. The standard fonts only
// encode WinAnsi, so anything outside it has to be mapped before it is drawn —
// pdf-lib throws on a character it cannot encode rather than skipping it.

export function safe(value: string) {
	return value
		.replace(/[„“”]/g, '"')
		.replace(/[‘’]/g, "'")
		.replace(/[–—]/g, '-')
		.replace(/[^\x20-\xFF€]/g, '?');
}

export function fmtDate(value: Date | null | undefined) {
	return value ? value.toLocaleDateString('de-DE') : '';
}

export function wrap(value: string, font: PDFFont, size: number, width: number) {
	const result: string[] = [];
	// Split before safe(): it turns line breaks and tabs into '?', so a split
	// afterwards would find nothing to split on.
	for (const paragraph of value.split(/\r?\n/)) {
		let line = '';
		for (const word of paragraph.split(/\s+/).filter(Boolean).map(safe)) {
			const candidate = line ? `${line} ${word}` : word;
			if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
			else {
				if (line) result.push(line);
				line = word;
			}
		}
		result.push(line);
	}
	return result;
}
