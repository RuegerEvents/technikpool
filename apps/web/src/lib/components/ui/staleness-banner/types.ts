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
	// Set with `error`: what the document is billed from, so the banner can ask
	// which prices and rates are missing and let them be filled in on the spot.
	billing?: {
		productionId: string;
		organizationId: string;
		assetScope: 'ALL' | 'OWN_ORG_ONLY' | 'LENT';
	};
	added: DiffLine[];
	removed: DiffLine[];
	changed: ChangedLine[];
};
