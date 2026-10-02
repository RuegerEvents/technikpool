import { naturalCompare } from '$lib/sort';

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
	manufacturerName: string | null;
	lentBy: string | null;
	group: ListGroup;
	/** Every unit on the line. They are also in the list's items, one by one. */
	assetIds: string[];
	total: number;
	done: number;
	/** The lowest count this user can bring the line to: ticks of others stay. */
	floor: number;
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
};

export type ListRow<U> = { kind: 'unit'; unit: U } | { kind: 'line'; line: ListLine };

export interface ListSection<U> {
	key: string;
	group: ListGroup;
	rows: ListRow<U>[];
}

/**
 * The list as the page draws it: sections in order, and within each the
 * counted lines slotted in among the units by name. The units that make up a
 * line are left out — the line stands for them. `items` arrive sorted by
 * section, each unit followed by its accessories.
 */
export function listSections<U extends ListedUnit>(items: U[], lines: ListLine[]) {
	const counted = new Set(lines.flatMap((l) => l.assetIds));
	const sections = new Map<string, ListSection<U>>();
	const section = (group: ListGroup) => {
		const key = groupKey(group);
		let s = sections.get(key);
		if (!s) sections.set(key, (s = { key, group, rows: [] }));
		return s;
	};

	// Blocks of a unit and its accessories, so a line never lands between them.
	type Block = { id: string | null; name: string; rows: ListRow<U>[] };
	const blocks = new Map<string, Block[]>();
	for (const unit of items) {
		if (counted.has(unit.assetId)) continue;
		const key = groupKey(unit.group);
		section(unit.group);
		const list = blocks.get(key) ?? [];
		const last = list.at(-1);
		if (unit.accessoryOf && last?.id === unit.accessoryOf) last.rows.push({ kind: 'unit', unit });
		else list.push({ id: unit.assetId, name: unit.productName, rows: [{ kind: 'unit', unit }] });
		blocks.set(key, list);
	}
	for (const line of lines) {
		const key = groupKey(line.group);
		section(line.group);
		const list = blocks.get(key) ?? [];
		const at = list.findIndex((b) => naturalCompare(b.name, line.productName) > 0);
		const block = {
			id: null,
			name: line.productName,
			rows: [{ kind: 'line', line } as ListRow<U>]
		};
		if (at === -1) list.push(block);
		else list.splice(at, 0, block);
		blocks.set(key, list);
	}

	return [...sections.values()]
		.sort((a, b) => compareGroups(a.group, b.group))
		.map((s) => ({ ...s, rows: (blocks.get(s.key) ?? []).flatMap((b) => b.rows) }));
}
