import { naturalCompare } from '#lib/sort.js';
import { compareCases, type ListCase } from '#lib/pack-cases.js';

export type { ListCase };

// The shape of a production's list (check, handout, return), shared by the
// server that builds it and the page that draws it. The server half is
// services/production-list.ts.

/**
 * `location`: the shelf the unit is kept on — packing is walking from one to the
 * next. `lender`: lent units, one section per lending org, because they come
 * from someone else's shelves and arrive as one delivery. `none`: no location.
 */
export interface ListGroup {
	kind: 'location' | 'lender' | 'none';
	name: string | null;
}

/**
 * Units that are told apart by nothing: no tag, not part of a kit, no
 * accessories and not one themselves. The list shows them as one row with a
 * number, and a count picks that many of `assetIds`.
 */
export interface ListLine {
	/** Product, shelf and owner — what makes two units interchangeable here. */
	key: string;
	productName: string;
	productCaption: string | null;
	/** The product's picture, as a stored key — see #lib/images. */
	productImagePath: string | null;
	manufacturerName: string | null;
	lentBy: string | null;
	/** The org the units belong to, and their length: what the cable colour is read off. */
	ownerOrgId?: string;
	lengthCm?: number | null;
	group: ListGroup;
	/** Every unit on the line. They are also in the list's items, one by one. */
	assetIds: string[];
	total: number;
	done: number;
	/** The lowest count this user can bring the line to: ticks of others stay. */
	floor: number;
	/**
	 * The pack case its units are in. Part of the key, so a line splits when
	 * only some of its units go into a case. Absent on lists built before cases.
	 */
	packCase?: ListCase | null;
}

/**
 * The kit a unit is in, so the list can put a kit's units under one heading
 * and tick them at once. An accessory is shown with its parent's kit.
 */
export interface ListKit {
	id: string;
	/** The kit's name with its caption. */
	name: string;
	tag: string | null;
	/**
	 * The kit this one sits inside — the FOH case around the adapter set. The
	 * inner kit is a heading of its own, placed right after the outer one's
	 * units. Absent on lists built before kits could nest.
	 */
	parent?: { id: string; name: string; tag: string | null } | null;
}

const GROUP_ORDER: Record<ListGroup['kind'], number> = { location: 0, none: 1, lender: 2 };

export function compareGroups(a: ListGroup, b: ListGroup) {
	return GROUP_ORDER[a.kind] - GROUP_ORDER[b.kind] || naturalCompare(a.name ?? '', b.name ?? '');
}

export function groupKey(group: ListGroup) {
	return `${group.kind}:${group.name ?? ''}`;
}

type ListedUnit = {
	assetId: string;
	accessoryOf: string | null;
	productName: string;
	group: ListGroup;
	kit: ListKit | null;
	/** The pack case it is listed under — see `ListCase`. Absent on a list without cases. */
	packCase?: ListCase | null;
};

export type ListRow<U> =
	| { kind: 'unit'; unit: U }
	| { kind: 'line'; line: ListLine }
	/** A kit's heading; its units follow, up to the next heading or plain unit. */
	| { kind: 'kit'; kit: ListKit; units: U[] };

export interface ListSection<U> {
	key: string;
	group: ListGroup;
	/**
	 * A pack case's section: the case's own row first, then what is packed in
	 * it. Null for the sections of what is loose, by shelf or lender as before.
	 */
	packCase: ListCase | null;
	/** How many cases the case sits in; 0 for a case in none, and for loose sections. */
	depth: number;
	rows: ListRow<U>[];
}

const NO_GROUP: ListGroup = { kind: 'none', name: null };

/**
 * The rows of one section: blocks of a unit and its accessories, so a line
 * never lands between them — a kit is one block, headed by its name, holding
 * all of its units — and the counted lines slotted in among them by name.
 */
function rowsOf<U extends ListedUnit>(units: U[], lines: ListLine[], counted: Set<string>) {
	type Block = { id: string | null; kitId: string | null; name: string; rows: ListRow<U>[] };
	const list: Block[] = [];
	for (const unit of units) {
		if (counted.has(unit.assetId)) continue;
		const last = list.at(-1);
		if (unit.accessoryOf && last?.id === unit.accessoryOf) {
			last.rows.push({ kind: 'unit', unit });
			if (last.kitId) (last.rows[0] as { units: U[] }).units.push(unit);
		} else if (unit.kit && last?.kitId === unit.kit.id) {
			last.id = unit.assetId;
			last.rows.push({ kind: 'unit', unit });
			(last.rows[0] as { units: U[] }).units.push(unit);
		} else if (unit.kit) {
			list.push({
				id: unit.assetId,
				kitId: unit.kit.id,
				name: unit.kit.name,
				rows: [
					{ kind: 'kit', kit: unit.kit, units: [unit] },
					{ kind: 'unit', unit }
				]
			});
		} else {
			list.push({
				id: unit.assetId,
				kitId: null,
				name: unit.productName,
				rows: [{ kind: 'unit', unit }]
			});
		}
	}
	for (const line of lines) {
		const at = list.findIndex((b) => naturalCompare(b.name, line.productName) > 0);
		const block: Block = {
			id: null,
			kitId: null,
			name: line.productName,
			rows: [{ kind: 'line', line }]
		};
		if (at === -1) list.push(block);
		else list.splice(at, 0, block);
	}
	return list.flatMap((b) => b.rows);
}

/**
 * The list as the page draws it: first a section per pack case, a case inside
 * another right after it (`depth` says how far in), each headed by the case's
 * own row; then what is loose, in sections by shelf and lender as always.
 * Within each, the counted lines are slotted in among the units by name, and
 * the units that make up a line are left out — the line stands for them.
 * `items` arrive sorted by section, each unit followed by its accessories.
 */
export function listSections<U extends ListedUnit>(
	items: U[],
	lines: (ListLine & { packCase?: ListCase | null })[]
): ListSection<U>[] {
	const counted = new Set(lines.flatMap((l) => l.assetIds));

	// The cases, the ones around them included, so a case inside one this list
	// has nothing of still reads as inside it.
	const cases = new Map<string, { packCase: ListCase; units: U[]; lines: ListLine[] }>();
	const caseEntry = (c: ListCase) => {
		c.path.forEach((ref, i) => {
			if (!cases.has(ref.assetId)) {
				cases.set(ref.assetId, {
					packCase: { ...ref, path: c.path.slice(0, i) },
					units: [],
					lines: []
				});
			}
		});
		let entry = cases.get(c.assetId);
		if (!entry) cases.set(c.assetId, (entry = { packCase: c, units: [], lines: [] }));
		return entry;
	};
	const looseUnits: U[] = [];
	const looseLines: ListLine[] = [];
	for (const unit of items) {
		if (unit.packCase) caseEntry(unit.packCase).units.push(unit);
		else looseUnits.push(unit);
	}
	for (const line of lines) {
		if (line.packCase) caseEntry(line.packCase).lines.push(line);
		else looseLines.push(line);
	}

	const caseSections: ListSection<U>[] = [...cases.values()]
		.sort((a, b) => compareCases(a.packCase, b.packCase))
		.map(({ packCase, units, lines }) => {
			const own = units.filter((u) => u.assetId === packCase.assetId);
			const rest = units.filter((u) => u.assetId !== packCase.assetId);
			return {
				key: `case:${packCase.assetId}`,
				group: own[0]?.group ?? NO_GROUP,
				packCase,
				depth: packCase.path.length,
				rows: rowsOf([...own, ...rest], lines, counted)
			};
		});

	const groups = new Map<string, { group: ListGroup; units: U[]; lines: ListLine[] }>();
	const groupEntry = (group: ListGroup) => {
		const key = groupKey(group);
		let entry = groups.get(key);
		if (!entry) groups.set(key, (entry = { group, units: [], lines: [] }));
		return entry;
	};
	for (const unit of looseUnits) {
		// A unit a line stands for makes no section of its own.
		if (!counted.has(unit.assetId)) groupEntry(unit.group).units.push(unit);
	}
	for (const line of looseLines) groupEntry(line.group).lines.push(line);
	const looseSections: ListSection<U>[] = [...groups.entries()]
		.sort(([, a], [, b]) => compareGroups(a.group, b.group))
		.map(([key, { group, units, lines }]) => ({
			key,
			group,
			packCase: null,
			depth: 0,
			rows: rowsOf(units, lines, counted)
		}));

	return [...caseSections, ...looseSections];
}
