// Cables are the one product class where the label is not enough. There are
// hundreds of them, they differ only by length and by what is on each end, and
// the pool's names spell all three of those in whatever way the person typing
// felt like ("XLR Kabel 5m", "CEE32 Kabel 6mm² 20m"). So the four facts get
// their own columns on Product, and this file is the vocabulary and the
// arithmetic both the server and the forms use.
//
// A plain `.ts` on purpose: wuchale only transforms `*.svelte` and
// `*.svelte.{js,ts}`, so the uppercase vocabulary below is never extracted into
// the translation catalogue — a connector is called "XLR3 M" in every language.

export type CableAttrs = {
	cableType: string | null;
	connectorA: string | null;
	connectorB: string | null;
	lengthCm: number | null;
};

/** What a create/update command is sent. Every field is optional on its own. */
export type CableInput = CableAttrs;

/**
 * Whether a product is a cable at all: any one of the four columns being set.
 *
 * Deliberately not "has a type". A cable is defined by its ends and its length;
 * `cableType` is the *wire* — CAT7, 2,5 mm², 4×4 — which the connectors cannot
 * express and which plenty of cables have nothing to say about. Requiring it
 * made people invent a word for a lead that is fully described by "Schuko M to
 * Schuko F, 10 m".
 */
export function isCable(p: CableAttrs): boolean {
	return !!(p.cableType || p.connectorA || p.connectorB || p.lengthCm);
}

// Fixed locale, not the user's: the derived name is *stored*, so it has to come
// out identical whichever UI language typed it. The form's "is this still the
// auto-generated name?" check compares against exactly this string.
const lengthFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/** 150 → "1,5 m", 1000 → "10 m". */
export function formatLength(lengthCm: number): string {
	return `${lengthFormat.format(lengthCm / 100)} m`;
}

/**
 * Metres as a human types them → whole centimetres. Accepts both decimal
 * separators and a trailing unit; returns null for anything that isn't a
 * positive length, which is also how an empty field reads.
 */
export function parseLengthMeters(input: string): number | null {
	const cleaned = input.trim().replace(/\s*m$/i, '').replace(',', '.').trim();
	if (!cleaned) return null;
	const metres = Number(cleaned);
	if (!isFinite(metres) || metres <= 0) return null;
	return Math.round(metres * 100);
}

// The words that mark which *end* of a connector pair this is rather than which
// connector it is. Power connectors are gendered — "Schuko M" and "Schuko F"
// are the two ends of one ordinary extension lead — while most signal and data
// connectors are not: NL4, RJ45, BNC, HDMI, USB-C and Klinke are the same part
// on both ends of a perfectly ordinary cable. Telling those two situations
// apart is the whole job of `splitConnector`.
const CONNECTOR_GENDER = new Set([
	'm',
	'f',
	'male',
	'female',
	'stecker',
	'kupplung',
	'in',
	'out',
	// powerCON genders by colour: blue is the inlet, grey the outlet.
	'blau',
	'blue',
	'grau',
	'grey',
	'gray'
]);

/**
 * A connector split into the part that says *which* connector and the part that
 * says *which end*: "Schuko F" → base "Schuko", gender "f"; "C13" → base "C13",
 * no gender. Only ever a whole trailing word, so "Klinke 3.5" and "USB-C"
 * survive intact, and a connector that is *only* a gender word keeps it as the
 * base rather than being reduced to nothing.
 */
export function splitConnector(connector: string | null | undefined): {
	base: string;
	gender: string;
} {
	const value = connector?.trim() ?? '';
	if (!value) return { base: '', gender: '' };
	const parts = value.split(/\s+/);
	const last = parts[parts.length - 1].toLowerCase();
	if (parts.length > 1 && CONNECTOR_GENDER.has(last)) {
		return { base: parts.slice(0, -1).join(' '), gender: last };
	}
	return { base: value, gender: '' };
}

/** Just the connector, without which end of the pair it is. */
export function connectorBase(connector: string | null | undefined): string {
	return splitConnector(connector).base;
}

/** What the naming and direction helpers need from the Connector table. */
export type ConnectorRow = { name: string; family?: string | null; gender?: string | null };

/**
 * Whether a cable's two ends are recorded the wrong way round — the end that
 * feeds sitting in B instead of A.
 *
 * The convention is worth having because "CEE32 → CEE16" and "CEE16 → CEE32"
 * are different adapters, and the only thing telling them apart is which end
 * comes first. `inputGender` says which contacts feed, and it comes from the
 * department: a cable's male end takes power in, while an XLR's female end is
 * the one that receives.
 *
 * Answers false whenever there is nothing to say — no direction in this
 * department, an end not in the catalogue, or the same gender at both ends
 * (a powerCON link lead, an NL4 speaker cable). Only a genuine mismatch is
 * worth interrupting someone over.
 */
export function endsAreReversed(
	a: { connectorA?: string | null; connectorB?: string | null },
	connectors: readonly ConnectorRow[],
	inputGender: string | null | undefined
): boolean {
	if (!inputGender) return false;
	const genderOf = (name: string | null | undefined) => {
		const key = name?.trim().toLowerCase();
		if (!key) return null;
		return connectors.find((c) => c.name.trim().toLowerCase() === key)?.gender ?? null;
	};
	const genderA = genderOf(a.connectorA);
	const genderB = genderOf(a.connectorB);
	if (!genderA || !genderB || genderA === genderB) return false;
	return genderA !== inputGender;
}

/**
 * The other end of the pair: the one member of this connector's family with the
 * opposite gender. Picking "Schuko M" therefore offers "Schuko F" for the far
 * end, which is what a lead almost always is.
 *
 * Null unless the answer is unambiguous. powerCON has two members of each
 * gender — a link lead is blue-to-grey, both female — so there is no single
 * counterpart to fill in, and guessing one would be worse than leaving it.
 */
export function counterpartConnector(
	name: string | null | undefined,
	connectors: readonly ConnectorRow[]
): ConnectorRow | null {
	const key = name?.trim().toLowerCase();
	if (!key) return null;
	const self = connectors.find((c) => c.name.trim().toLowerCase() === key);
	if (!self?.gender) return null;
	const familyOf = (c: ConnectorRow) => (c.family?.trim() || connectorBase(c.name)).toLowerCase();
	const family = familyOf(self);
	const opposite = connectors.filter(
		(c) => familyOf(c) === family && c.gender && c.gender !== self.gender
	);
	return opposite.length === 1 ? opposite[0] : null;
}

/** Which end of a cable a connector is, where that is knowable at all. */
export type CableEndRole = 'in' | 'out';

/**
 * How the two ends are written on screen. Fixed vocabulary rather than UI copy:
 * IN and OUT are what the gear itself is labelled with, in German warehouses as
 * much as English ones. Living in this plain `.ts` keeps wuchale from
 * extracting them, so they cannot drift apart between the two catalogues.
 */
export const CABLE_END_LABEL: Record<CableEndRole, string> = { in: 'IN', out: 'OUT' };

/**
 * Whether a connector is the end that feeds or the end that is fed.
 *
 * Derived, never stored: it follows from the connector's gender and the
 * department's `cableInputGender`, and a third copy of the same fact is a third
 * thing that can drift out of line with the other two.
 *
 * Only answerable where gender actually carries the direction — a family with
 * exactly one male and one female member. powerCON has two of each, because its
 * direction is the colour keying rather than the gender, so it abstains here
 * instead of guessing; so does every family with a single member, like an NL4
 * or an RJ45, where both ends of the cable are the same part.
 */
export function connectorRole(
	connector: { name: string; gender?: string | null; family?: string | null },
	connectors: readonly ConnectorRow[],
	inputGender: string | null | undefined
): CableEndRole | null {
	if (!connector.gender || !inputGender) return null;
	const familyOf = (c: ConnectorRow) => (c.family?.trim() || connectorBase(c.name)).toLowerCase();
	const family = familyOf(connector);
	const members = connectors.filter((c) => familyOf(c) === family);
	const males = members.filter((c) => c.gender === 'male').length;
	const females = members.filter((c) => c.gender === 'female').length;
	if (males !== 1 || females !== 1) return null;
	return connector.gender === inputGender ? 'in' : 'out';
}

/**
 * The name a cable gets unless someone writes a better one.
 *
 * Which half of a cable identifies it depends on the cable, so there are three
 * answers rather than one:
 *
 * - **The ends are different families** — that is what the thing *is*. "Schuko
 *   → C13" is a Kaltgerätekabel; "Adapter 0,3 m" would tell you nothing at all.
 * - **The same connector at both ends, where that family has another member** —
 *   a Schuko M→M, an XLR F→F turnaround. Someone made this deliberately and it
 *   is not what anyone reaching for a "Schuko cable" expects, so it says so.
 * - **Anything else** — the ordinary lead. Two ends of one family (Schuko M→F,
 *   powerCON blau F→grau F), or a family with only one member used twice, which
 *   is simply what an NL4 speaker cable or a USB-C lead *is*. Type and length
 *   are what anyone calls those.
 *
 * `connectors` is the catalogue, and it is what makes the middle case possible:
 * "is there another member of this family?" is a question about the pool's
 * vocabulary, not about the string. Without it the gender heuristic in
 * `splitConnector` stands in, which is right for every connector in the seeded
 * list and a guess for anything newer.
 *
 * The length is appended whenever there is one, which is also how an adapter
 * loses it: leave the field blank.
 */
export function cableDisplayName(
	a: {
		cableType?: string | null;
		connectorA?: string | null;
		connectorB?: string | null;
		lengthCm: number | null;
	},
	connectors: readonly ConnectorRow[] = []
): string {
	const rows = new Map(connectors.map((c) => [c.name.trim().toLowerCase(), c]));
	const familyOf = (name: string) =>
		rows.get(name.toLowerCase())?.family?.trim() || connectorBase(name);

	const nameA = a.connectorA?.trim() ?? '';
	const nameB = a.connectorB?.trim() ?? '';
	const familyA = nameA ? familyOf(nameA) : '';
	const familyB = nameB ? familyOf(nameB) : '';

	// Whether using this connector at both ends was a choice at all. From the
	// catalogue when it is loaded; otherwise from whether the name carries a
	// gender word, which is the same question asked of the string.
	const familyHasAlternatives = (family: string, name: string) => {
		if (rows.size === 0) return !!splitConnector(name).gender;
		const key = family.toLowerCase();
		const members = new Set(
			connectors
				.filter((c) => (c.family?.trim() || connectorBase(c.name)).toLowerCase() === key)
				.map((c) => c.name.trim().toLowerCase())
		);
		return members.size > 1;
	};

	// With no type stated, the ends name the cable: a lead with Schuko on both
	// ends is a "Schuko", and saying so was the only reason the type used to be
	// required. A type that *is* given always wins — that is where "CAT7" goes.
	const stated = a.cableType?.trim() ?? '';
	const fromEnds = nameA ? connectorBase(nameA) : nameB ? connectorBase(nameB) : '';

	let head: string;
	// Both ends have to be known before they can be compared at all — one end
	// alone is no evidence of anything.
	if (!nameA || !nameB) {
		head = stated || fromEnds;
	} else if (familyA.toLowerCase() !== familyB.toLowerCase()) {
		// Compared by family, but labelled by the name with its gender dropped.
		// A family is a *group* name and reads like one — C13's family is
		// "Kaltgeräte", which nobody calls a cable end. "Schuko → C13" is the cable.
		head = `${connectorBase(nameA)} → ${connectorBase(nameB)}`;
	} else if (nameA.toLowerCase() === nameB.toLowerCase() && familyHasAlternatives(familyA, nameA)) {
		head = `${nameA} → ${nameB}`;
	} else {
		head = stated || fromEnds;
	}

	if (!head) return '';
	return a.lengthCm ? `${head} ${formatLength(a.lengthCm)}` : head;
}

/** "XLR3 M → XLR3 F", one side alone if that is all that's known, '' for neither. */
export function connectorLabel(a: {
	connectorA: string | null;
	connectorB: string | null;
}): string {
	const ends = [a.connectorA?.trim(), a.connectorB?.trim()].filter(Boolean);
	return ends.join(' → ');
}

/**
 * Trims and turns every blank into a real null. Prisma reads `null` as IS NULL
 * and `undefined` as "no filter", so a batch lookup that left a blank field as
 * `''` would match nothing and create a second product every time.
 */
export function normalizeCable(input: {
	cableType?: string | null;
	connectorA?: string | null;
	connectorB?: string | null;
	lengthCm?: number | null;
}): CableInput {
	return {
		cableType: input.cableType?.trim() || null,
		connectorA: input.connectorA?.trim() || null,
		connectorB: input.connectorB?.trim() || null,
		lengthCm: input.lengthCm ?? null
	};
}

/**
 * One line of the batch form's quick entry: "10x 10m Schuko", "2 x 3m DMX
 * 3-Pin", "3× 1,5 m XLR", or just "Schuko 10m" for a single one. Never throws —
 * a line it can't read comes back null and the caller says so.
 */
export function parseCableQuickEntry(
	line: string
): { quantity: number; lengthCm: number | null; cableType: string } | null {
	let rest = line.trim();
	if (!rest) return null;

	let quantity = 1;
	const qty = rest.match(/^(\d+)\s*[x×*]\s*/i);
	if (qty) {
		quantity = parseInt(qty[1], 10);
		if (!quantity || quantity < 1) return null;
		rest = rest.slice(qty[0].length).trim();
	}

	// The length may lead ("10m Schuko") or trail ("Schuko 10m"). Anchored at one
	// end or the other so a number inside the type ("DMX 3-Pin", "CAT6A") is left
	// where it belongs.
	let lengthCm: number | null = null;
	const leading = rest.match(/^(\d+(?:[.,]\d+)?)\s*m\b\s*/i);
	const trailing = rest.match(/\s+(\d+(?:[.,]\d+)?)\s*m$/i);
	if (leading) {
		lengthCm = parseLengthMeters(leading[1]);
		rest = rest.slice(leading[0].length).trim();
	} else if (trailing) {
		lengthCm = parseLengthMeters(trailing[1]);
		rest = rest.slice(0, rest.length - trailing[0].length).trim();
	}

	if (!rest) return null;
	return { quantity, lengthCm, cableType: rest };
}

// A starter list of cable types, merged with whatever the catalogue already
// holds and losing to it on spelling: a first day's worth of vocabulary rather
// than a controlled list, because the next cable is always one nobody
// anticipated. Connectors have no equivalent here — they are rows in the
// Connector table, seeded once by the connector_catalog migration, so they can
// carry a picture.
export const CABLE_TYPE_SUGGESTIONS: readonly string[] = [
	'XLR',
	'DMX',
	'Schuko',
	'CEE16',
	'CEE32',
	'powerCON',
	'TRUE1',
	'Kaltgeräte',
	'Speakon',
	'CAT',
	'SDI',
	'HDMI',
	'Klinke',
	'USB'
];

/**
 * What each starter type usually has on its ends. Only consulted for a type the
 * catalogue has no product of yet — once one exists, the newest one of that
 * type is the better precedent, because it is what this pool actually owns.
 */
export const CABLE_TYPE_DEFAULTS: Readonly<
	Record<string, { connectorA: string; connectorB: string }>
> = {
	// Connector A is the end signal or power comes in on, so these follow the
	// department's direction (Category.cableInputGender): audio inputs carry 48 V
	// phantom and are female, so an audio cable's *female* end is the receiving
	// one — while DMX reverses that, console out being female. Same shell, and
	// deliberately opposite here.
	XLR: { connectorA: 'XLR3 F', connectorB: 'XLR3 M' },
	DMX: { connectorA: 'XLR5 M', connectorB: 'XLR5 F' },
	Schuko: { connectorA: 'Schuko M', connectorB: 'Schuko F' },
	CEE16: { connectorA: 'CEE16 M', connectorB: 'CEE16 F' },
	CEE32: { connectorA: 'CEE32 M', connectorB: 'CEE32 F' },
	powerCON: { connectorA: 'powerCON blau F', connectorB: 'powerCON grau F' },
	TRUE1: { connectorA: 'TRUE1 M', connectorB: 'TRUE1 F' },
	Kaltgeräte: { connectorA: 'Schuko M', connectorB: 'C13' },
	Speakon: { connectorA: 'NL4', connectorB: 'NL4' },
	CAT: { connectorA: 'RJ45', connectorB: 'RJ45' },
	SDI: { connectorA: 'BNC', connectorB: 'BNC' },
	HDMI: { connectorA: 'HDMI', connectorB: 'HDMI' },
	Klinke: { connectorA: 'Klinke 6.3', connectorB: 'Klinke 6.3' },
	USB: { connectorA: 'USB-A', connectorB: 'USB-C' }
};
