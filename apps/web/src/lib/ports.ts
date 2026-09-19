// What a device's built-in connectors are called. A plain `.ts` on purpose, like
// `$lib/cable`: "DMX In" and "Power Out" are what the panel itself is printed
// with, in German warehouses as much as English ones, so wuchale must not
// extract them into the catalogue.

/**
 * The two departments with a naming rule for panels. Ids rather than names:
 * both rows are seeded by the `seed_categories` migration with these ids, and
 * the names are editable on /admin/categories.
 */
export const LIGHT_CATEGORY_ID = 'catg_light';
export const POWER_CATEGORY_ID = 'catg_power';

type ConnectorLike = {
	name: string;
	family?: string | null;
	gender?: string | null;
	categoryId?: string | null;
};

/**
 * Whether a connector on a device is where power or signal comes in.
 *
 * The rule is the department's `cableInputGender`, read from the device's side
 * this time: a cable's feeding end plugs into the source, so its far end — the
 * opposite gender — lands on the device, whose input therefore has the gender
 * the department names. Male for Strom (a C14 inlet, a TRUE1 in), male for
 * Licht (a fixture's DMX in), female for Audio (a mixer's mic in).
 *
 * powerCON is the exception it always is: its direction is the colour keying,
 * not the contacts — blue is the inlet, grey the outlet.
 */
export function portDirection(
	connector: ConnectorLike,
	inputGender: string | null | undefined
): 'in' | 'out' | null {
	const words = connector.name.toLowerCase().split(/\s+/);
	if (words.some((w) => w === 'blau' || w === 'blue')) return 'in';
	if (words.some((w) => w === 'grau' || w === 'grey' || w === 'gray')) return 'out';
	if (!connector.gender || !inputGender) return null;
	return connector.gender === inputGender ? 'in' : 'out';
}

/**
 * The labels worth offering for one connector on one device, and the one to
 * fill in unasked where the direction is knowable.
 *
 * - Anything in the Power department is "Power In" / "Power Out", whatever the
 *   device is — a moving head's powerCON is as much power as a distro's Schuko.
 * - An XLR on a Light product carries DMX, not audio, whichever department the
 *   connector itself is filed under (XLR3 is Audio in the catalogue).
 *
 * Empty for everything else: an XLR on a mixer is "Mic 1–16" or "Main L", and
 * no rule guesses that better than the person typing it.
 */
export function portLabelSuggestions(
	connector: ConnectorLike,
	productCategoryId: string | null | undefined,
	categories: readonly { id: string; cableInputGender?: string | null }[]
): { labels: string[]; preferred: string | null } {
	const inputGenderOf = (id: string) =>
		categories.find((c) => c.id === id)?.cableInputGender ?? null;

	let kind: string;
	let inputGender: string | null;
	if (connector.categoryId === POWER_CATEGORY_ID) {
		kind = 'Power';
		inputGender = inputGenderOf(POWER_CATEGORY_ID);
	} else if (
		productCategoryId === LIGHT_CATEGORY_ID &&
		/^xlr/i.test(connector.family?.trim() || connector.name)
	) {
		kind = 'DMX';
		inputGender = inputGenderOf(LIGHT_CATEGORY_ID);
	} else {
		return { labels: [], preferred: null };
	}

	const labels = [`${kind} In`, `${kind} Out`];
	const direction = portDirection(connector, inputGender);
	return {
		labels,
		preferred: direction === 'in' ? labels[0] : direction === 'out' ? labels[1] : null
	};
}
