/**
 * The one way a list is searched. Every search box over units, products and
 * kits goes through `matchesSearch`, so "TRUE1" finds the same cables on the
 * Devices list as in the bundle picker and on the production planner.
 *
 * What it forgives, and why:
 * - **Order and separators.** Each word of the query has to turn up somewhere,
 *   in any order, and arrows, dashes, slashes and brackets are only spaces:
 *   "Schuko M → TRUE1 F" is found by "true1 schuko".
 * - **Words left out.** "unifi 0.3" finds "UniFi Patch Kabel flexibel 0,3 m".
 * - **How numbers are written.** "10m" and "10 m", "0,5" and "0.5" are one —
 *   a number matches only itself, so "1m" does not find "10 m", and a unit
 *   only its number, so "2m" does not find "2 TB" with an "m" elsewhere.
 * - **The digits of a name** ("ip6", "tr1") stay with its letters, and only
 *   have to start the number there: "ip6" finds "IP65", "tr1" finds "TRUE1"
 *   but not a "Mac Mini M1" that has a "tr" somewhere else.
 * - **One slip of the finger.** A word of five letters or more may be one
 *   letter off ("powrcon"), one of eight or more two ("schuckozuleitung") —
 *   compared against the start of each word, so a half-typed word still counts.
 * - **Never a digit.** A number off by one digit is another unit, so an
 *   inventory number is found exactly, as typed so far, or by its last digits
 *   ("115" for 40000115).
 *
 * Callers pass everything a row is known by — name, caption, maker, both
 * cable ends, tag — so a cable is found by what is printed after its arrow.
 */

/** Units a number carries: "2 m" and "2m" are one word, and never "2 TB". */
// `u` and `he` are rack units: "2U" is a height, not a 2 next to a U.
const UNITS = 'mm|cm|km|m|tb|gb|mb|kb|kw|w|kva|va|v|ma|a|hz|khz|mhz|ghz|ch|kg|g|l|u|he';
const UNIT = new RegExp(`^(${UNITS})$`);
// A number standing on its own (not "xlr3", whose digit belongs to the
// connector), then its unit as a whole word. `§` holds the two together
// through the splits below and is dropped at the end.
const NUMBER_WITH_UNIT = new RegExp(
	`(?<![\\p{L}\\d.])(\\d+(?:\\.\\d+)?)\\s*(${UNITS})(?![\\p{L}\\d/])`,
	'gu'
);

/** Marks a number split off the letters before it, for `searchMatcher`. */
const ATTACHED = '\uE000';

/** Lower-case, unaccented, separators as spaces, a number joined to its unit. */
export function normalizeSearch(text: string, markAttached = false): string {
	return (
		text
			.normalize('NFKD')
			.replace(/\p{M}/gu, '')
			.toLowerCase()
			.replace(/ß/g, 'ss')
			// A decimal comma is a decimal point: "0,5 m" is "0.5 m".
			.replace(/(\d),(\d)/g, '$1.$2')
			// "2 m" and "2m" are one word, "2m": a unit belongs to its number.
			.replace(NUMBER_WITH_UNIT, '$1§$2')
			// Otherwise a digit and a letter part: "xlr3" is "xlr 3", "true1" "true 1".
			.replace(/(\d)(\p{L})/gu, '$1 $2')
			.replace(/(\p{L})(\d)/gu, `$1 ${ATTACHED}$2`)
			.replace(/[^\p{L}\p{N}.§\uE000]+/gu, ' ')
			// A point is a decimal point only between digits.
			.replace(/(^|[^\d])\.|\.(?![\d])/g, '$1 ')
			.replace(/§/g, '')
			.replace(/\uE000/g, markAttached ? ATTACHED : '')
			.trim()
			.replace(/\s+/g, ' ')
	);
}

/** Typos a word of this length is allowed. */
function slack(length: number) {
	// Four letters with one wrong is already another word: "auro" is "euro".
	return length >= 8 ? 2 : length >= 5 ? 1 : 0;
}

/** Edit distance with adjacent swaps, giving up past `max`. */
function distance(a: string, b: string, max: number): number {
	if (Math.abs(a.length - b.length) > max) return max + 1;
	let prev2: number[] = [];
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		let best = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				value = Math.min(value, prev2[j - 2] + 1);
			}
			row.push(value);
			best = Math.min(best, value);
		}
		if (best > max) return max + 1;
		prev2 = prev;
		prev = row;
	}
	return prev[b.length];
}

type Token = { text: string; attached: boolean };

/** A word against one word of the row: in it, or one slip of the finger away. */
function tokenMatches(word: string, token: string) {
	// One or two letters are the start of a word, never any "c" in the middle.
	if (word.length < 3) return token.startsWith(word);
	if (token.includes(word)) return true;
	// A digit off is another inventory number, not a typo: "40000115" found
	// 40000116, 40000105 and dozens more while it was allowed two of them.
	if (/\d/.test(word)) return false;
	const max = slack(word.length);
	if (max === 0 || token.length < word.length - max) return false;
	// Against the start of the word as well: the query word may be half-typed.
	return (
		distance(word, token.slice(0, word.length), max) <= max || distance(word, token, max) <= max
	);
}

/** A bare number or a number with its unit, which match by value, not as text. */
function numberWord(word: string) {
	const number = /^(\d+(?:\.\d+)?)(\p{L}*)$/u.exec(word);
	if (!number) return null;
	if (number[2] ? !UNIT.test(number[2]) : !/^(\d{1,3}|\d+\.\d+)$/.test(word)) return null;
	return { unit: number[2] };
}

/**
 * A length with its unit ("2m") is exactly that; a bare one ("10") is that
 * number with or without a unit, so "10" still finds "Schuko 10 m" but "1m"
 * not "10 m" — or the end of an inventory number ("115" for 40000115). `nameDigits` says whether the digits of a name count ("RUTX50"
 * for "50"): only right behind the name's letters, never on their own.
 */
function numberMatches(word: string, unit: string, token: Token, nameDigits: boolean) {
	if (token.attached && !nameDigits) return false;
	if (token.text === word) return true;
	if (unit) return false;
	// The last digits of an inventory or serial number: "115" is how 40000115 is
	// looked for. Only a long run of digits, so "10" never finds a 4100.
	if (/^\d{5,}$/.test(token.text)) return token.text.endsWith(word);
	return token.text.startsWith(word) && UNIT.test(token.text.slice(word.length));
}

/**
 * One part of a run of words that has to appear in that order, word after
 * word: "usb c", "schuko m", "xlr3", "cee 32".
 */
type Part =
	| { kind: 'word'; text: string }
	| { kind: 'digits'; text: string }
	| { kind: 'letter'; text: string }
	| { kind: 'number'; text: string; unit: string };

function partMatches(
	part: Part,
	token: Token,
	first: boolean,
	previous?: { part: Part; token: Token }
) {
	switch (part.kind) {
		case 'digits':
			// The digits of a name are typed as far as they go: "ip6" is on its way
			// to "IP65". Written apart ("Z 300") they are the name only exactly:
			// "z300" is "Z 300", but "m1" is no "Max 16".
			if (token.attached) return token.text.startsWith(part.text);
			return token.text === part.text && previous?.token.text === previous?.part.text;
		case 'letter':
			return token.text.startsWith(part.text);
		case 'number':
			// Right behind a word, a number may be that word's own: "cee 32" is "CEE32".
			return numberMatches(part.text, part.unit, token, !first);
		case 'word':
			return tokenMatches(part.text, token.text);
	}
}

function runMatches(parts: Part[], tokens: Token[]) {
	return tokens.some((_, i) =>
		parts.every(
			(part, k) =>
				!!tokens[i + k] &&
				partMatches(
					part,
					tokens[i + k],
					k === 0,
					k > 0 ? { part: parts[k - 1], token: tokens[i + k - 1] } : undefined
				)
		)
	);
}

/** A run on its own: a lone number anywhere it stands free, a word anywhere. */
function loneMatches(part: Part, haystack: string, tokens: Token[]) {
	if (part.kind === 'number') {
		return tokens.some((token) => numberMatches(part.text, part.unit, token, false));
	}
	if (tokens.some((token) => partMatches(part, token, true))) return true;
	// Across words too, for a name typed without its space ("usbc").
	return part.text.length >= 3 && haystack.replace(/ /g, '').includes(part.text);
}

/**
 * Whether a run is found. In order and adjacent first; failing that, a run
 * that is only a word and the number after it ("schuko 10") is the two of
 * them anywhere — the number need not be the word's own, just there.
 */
function termMatches(parts: Part[], haystack: string, tokens: Token[]): boolean {
	if (parts.length === 1) return loneMatches(parts[0], haystack, tokens);
	if (runMatches(parts, tokens)) return true;
	const cut = parts.findIndex((part) => part.kind === 'number');
	if (cut <= 0) return false;
	return (
		termMatches(parts.slice(0, cut), haystack, tokens) &&
		parts.slice(cut).every((part) => loneMatches(part, haystack, tokens))
	);
}

/**
 * A query, prepared once and tested against many rows. An empty query
 * matches everything.
 *
 * The query is read as runs: a word, then whatever leans on it — the digits
 * of its name ("tr1"), a single letter ("usb c", "schuko m") and a number
 * ("cee 32") — which have to follow it word for word. Apart, "tr1" found any
 * row with a "tr" somewhere and an "M1" elsewhere, and "usb c" any USB with a
 * "c" in its category.
 */
export function searchMatcher(query: string) {
	const raw = normalizeSearch(query, true).split(' ').filter(Boolean);
	const terms: Part[][] = [];
	for (const [index, piece] of raw.entries()) {
		const text = piece.replace(ATTACHED, '');
		if (!text) continue;
		const current = terms[terms.length - 1];
		const number = numberWord(text);
		let part: Part;
		if (piece.startsWith(ATTACHED)) part = { kind: 'digits', text };
		else if (number) part = { kind: 'number', text, unit: number.unit };
		// A single letter leans on the word before ("schuko m") — unless digits
		// follow it, when it starts a name of its own ("mac m1").
		else if (text.length === 1 && current && !raw[index + 1]?.startsWith(ATTACHED))
			part = { kind: 'letter', text };
		else part = { kind: 'word', text };
		const leans = part.kind !== 'word' && current;
		if (leans) current.push(part);
		else terms.push([part]);
	}
	return (...parts: (string | null | undefined)[]) => {
		if (terms.length === 0) return true;
		const marked = normalizeSearch(parts.filter(Boolean).join(' '), true);
		const tokens = marked.split(' ').map((text) => ({
			text: text.replace(ATTACHED, ''),
			attached: text.startsWith(ATTACHED)
		}));
		const haystack = tokens.map((t) => t.text).join(' ');
		return terms.every((term) => termMatches(term, haystack, tokens));
	};
}

/** One-off form of `searchMatcher`. */
export function matchesSearch(query: string, ...parts: (string | null | undefined)[]) {
	return searchMatcher(query)(...parts);
}
