// Asset.status is a plain string column, so this file is the enum: every
// producer and consumer of a status value goes through it.

export const ASSET_STATUSES = [
	'AVAILABLE',
	'MAINTENANCE',
	'BROKEN',
	'SOLD',
	'DECOMMISSIONED'
] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number];

/**
 * End of life: the unit has physically left the pool. A retired asset can't be
 * booked, scanned onto a production, put in a bundle, attached as an accessory
 * or otherwise edited, and it drops out of every listing — the only change
 * still allowed is its status, so a mis-click can be undone.
 */
export const RETIRED_ASSET_STATUSES = [
	'SOLD',
	'DECOMMISSIONED'
] as const satisfies readonly AssetStatus[];

export function isRetiredStatus(status: string): boolean {
	return (RETIRED_ASSET_STATUSES as readonly string[]).includes(status);
}

/**
 * Prisma `where` fragment for "still in the pool". Spread it into any query
 * whose results feed a listing, a booking or an availability count.
 */
export const ACTIVE_ASSET_WHERE = {
	status: { notIn: [...RETIRED_ASSET_STATUSES] as string[] }
};

/** The mirror image — the listing that deliberately shows what has left. */
export const RETIRED_ASSET_WHERE = {
	status: { in: [...RETIRED_ASSET_STATUSES] as string[] }
};
