import type { CableColorBand, CablePaletteKey } from '#lib/cable-colors.js';
import { CABLE_PALETTE, cableBandFor } from '#lib/cable-colors.js';

// The interface half of #lib/cable-colors.ts: the palette's names in the
// reader's language. A `.svelte.ts` so wuchale extracts them.

export function paletteName(key: CablePaletteKey): string {
	switch (key) {
		case 'red':
			return 'Red';
		case 'blue':
			return 'Blue';
		case 'green':
			return 'Green';
		case 'yellow':
			return 'Yellow';
		case 'white':
			return 'White';
		case 'black':
			return 'Black';
		case 'orange':
			return 'Orange';
		case 'brown':
			return 'Brown';
		case 'grey':
			return 'Grey';
		case 'violet':
			return 'Violet';
		case 'pink':
			return 'Pink';
		case 'turquoise':
			return 'Turquoise';
		default: {
			const unknown: never = key;
			return unknown;
		}
	}
}

/** What a band shows: the colour and its name, translated for a palette colour. */
export function bandDisplay(band: CableColorBand): { hex: string; name: string } | null {
	if (band.paletteKey) {
		const colour = CABLE_PALETTE.find((c) => c.key === band.paletteKey);
		return colour ? { hex: colour.hex, name: paletteName(colour.key) } : null;
	}
	if (band.customHex && band.customName) return { hex: band.customHex, name: band.customName };
	return null;
}

/**
 * Words a search box should find a cable of this band by: its name as shown,
 * and for a palette colour the other language's too, so "rot" and "red" both
 * find the 1 m cables whichever language the page is in.
 */
export function bandSearchTerms(band: CableColorBand | null): string[] {
	if (!band) return [];
	if (band.paletteKey) {
		const colour = CABLE_PALETTE.find((c) => c.key === band.paletteKey);
		return colour ? [paletteName(colour.key), colour.key, colour.de] : [];
	}
	return band.customName ? [band.customName] : [];
}

/** The schemes as `getCableColorSchemes` hands them over. */
type Schemes = readonly { organizationId: string; bands: readonly CableColorBand[] }[];

/**
 * Search words for one unit: the colour its length has in its owner's scheme,
 * for passing to `searchMatcher` with the rest of what a row is known by.
 */
export function cableColorTerms(
	schemes: Schemes | undefined,
	organizationId: string,
	lengthCm: number | null | undefined
): string[] {
	const bands = schemes?.find((s) => s.organizationId === organizationId)?.bands ?? [];
	return bandSearchTerms(cableBandFor(lengthCm, bands));
}
