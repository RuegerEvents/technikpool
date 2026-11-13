// An org's cable colour code: every cable up to a length carries one colour,
// usually as tape on both ends. One scheme per org, by length only, in bands
// ("up to 1 m red, up to 3 m blue …"); see docs/plans/kabelfarben.md.
//
// Nothing stores a unit's colour. It is always worked out from the product's
// `lengthCm` and the scheme of the org the unit belongs to — the tape is on the
// cable, so a lent cable shows its owner's colour — and so it can never go
// stale when the scheme changes.
//
// A plain `.ts`: the server needs it for the PDFs, which are German. The
// interface's names go through wuchale in `cable-colors.svelte.ts`.

/** The tape colours offered by name. The key is what is stored. */
export const CABLE_PALETTE = [
	{ key: 'red', hex: '#dc2626', de: 'rot' },
	{ key: 'blue', hex: '#2563eb', de: 'blau' },
	{ key: 'green', hex: '#16a34a', de: 'grün' },
	{ key: 'yellow', hex: '#facc15', de: 'gelb' },
	{ key: 'white', hex: '#ffffff', de: 'weiß' },
	{ key: 'black', hex: '#171717', de: 'schwarz' },
	{ key: 'orange', hex: '#f97316', de: 'orange' },
	{ key: 'brown', hex: '#92400e', de: 'braun' },
	{ key: 'grey', hex: '#9ca3af', de: 'grau' },
	{ key: 'violet', hex: '#7c3aed', de: 'violett' },
	{ key: 'pink', hex: '#ec4899', de: 'pink' },
	{ key: 'turquoise', hex: '#14b8a6', de: 'türkis' }
] as const;

export type CablePaletteKey = (typeof CABLE_PALETTE)[number]['key'];

export function isPaletteKey(key: string): key is CablePaletteKey {
	return CABLE_PALETTE.some((colour) => colour.key === key);
}

/** One band as stored: a palette colour, or one of the org's own. */
export type CableColorBand = {
	maxLengthCm: number;
	paletteKey: string | null;
	customName: string | null;
	customHex: string | null;
};

/** `#rrggbb`, which is what the colour input writes and the PDFs can parse. */
export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * The band a length falls into: the shortest whose bound reaches it. A cable
 * longer than the last band has no colour, and so has a product without a
 * length.
 */
export function cableBandFor<B extends { maxLengthCm: number }>(
	lengthCm: number | null | undefined,
	bands: readonly B[]
): B | null {
	if (lengthCm == null || lengthCm <= 0) return null;
	let best: B | null = null;
	for (const band of bands) {
		if (band.maxLengthCm >= lengthCm && (!best || band.maxLengthCm < best.maxLengthCm)) {
			best = band;
		}
	}
	return best;
}

/** The colour a band shows, with its German name (PDFs) — the interface translates its own. */
export function bandColor(band: CableColorBand): { hex: string; nameDe: string } | null {
	if (band.paletteKey) {
		const colour = CABLE_PALETTE.find((c) => c.key === band.paletteKey);
		return colour ? { hex: colour.hex, nameDe: colour.de } : null;
	}
	if (band.customHex && band.customName) return { hex: band.customHex, nameDe: band.customName };
	return null;
}

/** Bands shortest first, which is how they are listed and how a range reads. */
export function sortBands<B extends { maxLengthCm: number }>(bands: readonly B[]): B[] {
	return [...bands].sort((a, b) => a.maxLengthCm - b.maxLengthCm);
}

/** Where a band starts: just past the previous one's bound, or at zero. */
export function bandStartCm(bands: readonly { maxLengthCm: number }[], index: number): number {
	return index === 0 ? 0 : sortBands(bands)[index - 1].maxLengthCm;
}
