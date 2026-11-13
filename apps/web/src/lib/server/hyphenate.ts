import hyphen from 'hyphen/de-1996/index.js';

// Where a word may be broken across two lines of a label, by the German
// patterns (reformed spelling). A label's title is set as large as it fits, and
// one long compound — "Mehrfachsteckdosen" — otherwise decides that size alone.

/** Fewer letters than this are never split off either end of a word. */
const MIN_PART = 3;

/**
 * A word in the pieces it may be broken into, in order; one piece where it may
 * not. Brand names written in camel case ("PowerCon") and anything holding a
 * digit are left whole: the patterns know German words, not product names.
 */
export function syllables(word: string): string[] {
	if (/\d/.test(word) || /\p{Ll}\p{Lu}/u.test(word)) return [word];
	const parts = hyphen
		.hyphenateSync(word, { hyphenChar: '|', minWordLength: 2 * MIN_PART })
		.split('|');
	// Glue too-short pieces onto their neighbour, so "Kof-fer" never ends a
	// line in two letters.
	const merged: string[] = [];
	for (const part of parts) {
		if (merged.length > 0 && merged.at(-1)!.length < MIN_PART) merged[merged.length - 1] += part;
		else merged.push(part);
	}
	if (merged.length > 1 && merged.at(-1)!.length < MIN_PART) {
		const last = merged.pop()!;
		merged[merged.length - 1] += last;
	}
	return merged;
}
