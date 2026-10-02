// What a device's built-in connectors are called. A plain `.ts` on purpose, like
// `#lib/cable`: "DMX In" and "Power Out" are what the panel itself is printed
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
 * Whether a port must be connected for the production's connection check —
 * see `ProductPort.requirement`. `required` stands alone; lines sharing a
 * letter are alternatives, one set of cables on any of them is enough.
 */
export const PORT_REQUIREMENTS = ['required', 'A', 'B'] as const;
export type PortRequirement = (typeof PORT_REQUIREMENTS)[number];

export function portRequirement(value: string | null | undefined): PortRequirement | null {
	return (PORT_REQUIREMENTS as readonly string[]).includes(value ?? '')
		? (value as PortRequirement)
		: null;
}

/** What the chip on a port line moves to on the next click: — → ● → A → B → —. */
export function nextPortRequirement(value: PortRequirement | null): PortRequirement | null {
	if (value === null) return PORT_REQUIREMENTS[0];
	const i = PORT_REQUIREMENTS.indexOf(value);
	return PORT_REQUIREMENTS[i + 1] ?? null;
}

/** What a port carries and which way, where a rule knows it. */
export type PortFlow = { kind: 'Power' | 'DMX'; direction: 'in' | 'out' | null };

/**
 * The kind and direction of one connector on one device — the rule behind both
 * the label suggestions and the connection check's sense of which ports feed.
 *
 * - Anything in the Power department is power, whatever the device is — a
 *   moving head's powerCON is as much power as a distro's Schuko.
 * - An XLR on a Light product carries DMX, not audio, whichever department the
 *   connector itself is filed under (XLR3 is Audio in the catalogue).
 *
 * Null for everything else: an XLR on a mixer is "Mic 1–16" or "Main L", and
 * no rule guesses that better than the person typing it.
 */
export function portFlow(
	connector: ConnectorLike,
	productCategoryId: string | null | undefined,
	categories: readonly { id: string; cableInputGender?: string | null }[]
): PortFlow | null {
	const inputGenderOf = (id: string) =>
		categories.find((c) => c.id === id)?.cableInputGender ?? null;

	if (connector.categoryId === POWER_CATEGORY_ID) {
		return {
			kind: 'Power',
			direction: portDirection(connector, inputGenderOf(POWER_CATEGORY_ID))
		};
	}
	if (
		productCategoryId === LIGHT_CATEGORY_ID &&
		/^xlr/i.test(connector.family?.trim() || connector.name)
	) {
		return { kind: 'DMX', direction: portDirection(connector, inputGenderOf(LIGHT_CATEGORY_ID)) };
	}
	return null;
}

/**
 * The labels worth offering for one connector on one device, and the one to
 * fill in unasked where the direction is knowable.
 */
export function portLabelSuggestions(
	connector: ConnectorLike,
	productCategoryId: string | null | undefined,
	categories: readonly { id: string; cableInputGender?: string | null }[]
): { labels: string[]; preferred: string | null } {
	const flow = portFlow(connector, productCategoryId, categories);
	if (!flow) return { labels: [], preferred: null };
	const labels = [`${flow.kind} In`, `${flow.kind} Out`];
	return {
		labels,
		preferred: flow.direction === 'in' ? labels[0] : flow.direction === 'out' ? labels[1] : null
	};
}
