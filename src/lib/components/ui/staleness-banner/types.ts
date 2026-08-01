export type DiffLine = { key: string; description: string; lineTotal: number };
export type ChangedLine = { key: string; description: string; before: number; after: number };

export type Staleness = {
	applicable: boolean;
	stale: boolean;
	error?: string;
	added: DiffLine[];
	removed: DiffLine[];
	changed: ChangedLine[];
};
