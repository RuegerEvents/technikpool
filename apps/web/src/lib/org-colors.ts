// Org colours are globally unique (`Organization.color @unique`), so the create form cannot
// offer one fixed default — the first org takes it and every later org hits the constraint.
// These are the suggestions, in order; the form picks the first one nobody holds yet.
export const ORG_COLOR_PALETTE = [
	'#0069c9',
	'#c92a2a',
	'#2f9e44',
	'#e8590c',
	'#7048e8',
	'#0c8599',
	'#c2255c',
	'#5c7cfa',
	'#f08c00',
	'#087f5b',
	'#862e9c',
	'#495057',
	'#1864ab',
	'#a61e4d',
	'#5f3dc4',
	'#1098ad',
	'#66a80f',
	'#d9480f',
	'#6d4c41',
	'#343a40'
];

function hslToHex(h: number, s: number, l: number): string {
	const a = s * Math.min(l, 1 - l);
	const channel = (n: number) => {
		const k = (n + h / 30) % 12;
		const value = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
		return Math.round(value * 255)
			.toString(16)
			.padStart(2, '0');
	};
	return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** First palette colour not in `taken`; once the palette is exhausted, walks the hue wheel. */
export function suggestOrgColor(taken: Iterable<string>): string {
	const used = new Set([...taken].map((c) => c.trim().toLowerCase()));
	const free = ORG_COLOR_PALETTE.find((c) => !used.has(c));
	if (free) return free;

	// Golden-angle steps so consecutive generated colours stay far apart.
	for (let i = 0; i < 360; i++) {
		const candidate = hslToHex((i * 137.5) % 360, 0.6, 0.42);
		if (!used.has(candidate)) return candidate;
	}
	return ORG_COLOR_PALETTE[0];
}
