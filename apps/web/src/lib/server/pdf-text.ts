import type { PDFFont } from 'pdf-lib';

// Text helpers shared by every generated document. They are set in Inter (see
// ./fonts), which covers arrows, typographic quotes and dashes, so text is drawn
// as written. What is left to catch: control characters (a tab would print as a
// box, a line break would start a new line mid-cell) and anything outside the
// face, such as an emoji, which would otherwise print as an empty box.

const coverage = new WeakMap<PDFFont, Set<number>>();

export function safe(value: string, font: PDFFont) {
	let drawable = coverage.get(font);
	if (!drawable) {
		drawable = new Set(font.getCharacterSet());
		coverage.set(font, drawable);
	}
	let result = '';
	for (const char of value) {
		const code = char.codePointAt(0)!;
		result += code >= 0x20 && code !== 0x7f && drawable.has(code) ? char : '?';
	}
	return result;
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
		for (const word of paragraph
			.split(/\s+/)
			.filter(Boolean)
			.map((word) => safe(word, font))) {
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
