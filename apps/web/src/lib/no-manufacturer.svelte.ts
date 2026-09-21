// A product nobody makes in particular — a Schuko lead, a generic laptop — has
// no manufacturer at all, and is named by its product name alone. The pickers
// still need something to click for that, so they list this entry first. It is
// never stored: `manufacturerIdOf` turns it back into null before anything is
// sent.

/** The picker entry's id. Not a cuid, so it can't collide with a real row. */
export const NO_MANUFACTURER = 'no-manufacturer';

/** The first entry of a manufacturer picker. Muted, since it's usually not the answer. */
export function noManufacturerItem() {
	return { id: NO_MANUFACTURER, name: 'Generic / unknown manufacturer', muted: true };
}

/** A manufacturer list with the "none" entry on top, for a `CreatableSelect`. */
export function withNoManufacturer<T extends { id: string; name: string }>(manufacturers: T[]) {
	return [noManufacturerItem(), ...manufacturers];
}

/**
 * What a picker selection means: a manufacturer id, `null` for none, or
 * `undefined` for a manufacturer typed in that doesn't exist yet.
 */
export function manufacturerIdOf(selection: { id: string | null }): string | null | undefined {
	if (selection.id === NO_MANUFACTURER) return null;
	return selection.id ?? undefined;
}

/** The picker selection for a product's maker — the "none" entry when it has none. */
export function manufacturerSelection(manufacturer: { id: string; name: string } | null) {
	return manufacturer
		? { id: manufacturer.id, name: manufacturer.name }
		: { id: NO_MANUFACTURER, name: noManufacturerItem().name };
}
