export type DiffLine = { key: string; description: string; lineTotal: number };
export type SnapshotCategory = {
	id: string | null;
	name: string | null;
	nameDe: string | null;
	color: string | null;
};

export type ChangedLine = {
	key: string;
	description: string;
	before: number;
	after: number;
	priceChanged: boolean;
	// Null when that part of the line is unchanged.
	textBefore: string | null;
	textAfter: string | null;
	categoryBefore: SnapshotCategory | null;
	categoryAfter: SnapshotCategory | null;
};

export type Staleness = {
	applicable: boolean;
	stale: boolean;
	error?: string;
	added: DiffLine[];
	removed: DiffLine[];
	changed: ChangedLine[];
};
