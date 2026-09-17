// Asset.status is a plain string column, so this file is the enum: every
// producer and consumer of a status value goes through it.

export const ASSET_STATUSES = [
	'AVAILABLE',
	'UNAVAILABLE',
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
 * Not bookable, but still in the pool. `UNAVAILABLE` is the status for a unit
 * that is physically fine and still ours, yet must not be planned with — lent
 * out privately, held back for something, missing for now. It stays in every
 * listing, keeps its history and can be edited like any other unit; what it
 * cannot do is join a production, be checked out by a scan, or be added to a
 * bundle.
 *
 * This is deliberately stricter than `MAINTENANCE` and `BROKEN`, which say
 * something about the unit's condition and still allow planning — a fixture
 * that comes back from repair before the show is a normal booking.
 *
 * It applies to what someone books, not to what comes along: an accessory is
 * never booked on its own, so one marked unavailable still travels with the
 * unit it is bolted to. A bundle is the other way round, because its members
 * are units in their own right — an unavailable one is left out and the rest
 * of the bundle still goes.
 */
export const UNBOOKABLE_ASSET_STATUSES = [
	'UNAVAILABLE',
	...RETIRED_ASSET_STATUSES
] as const satisfies readonly AssetStatus[];

export function isBookableStatus(status: string): boolean {
	return !(UNBOOKABLE_ASSET_STATUSES as readonly string[]).includes(status);
}

/**
 * Prisma `where` fragment for "still in the pool". Spread it into any query
 * whose results feed a listing. For anything that feeds a booking, use
 * `BOOKABLE_ASSET_WHERE` below instead.
 */
export const ACTIVE_ASSET_WHERE = {
	status: { notIn: [...RETIRED_ASSET_STATUSES] as string[] }
};

/**
 * Prisma `where` fragment for "can be planned with". Narrower than
 * `ACTIVE_ASSET_WHERE`: use it wherever the result feeds a booking, a checkout
 * or a count of what someone could still ask for. A listing of the pool keeps
 * `ACTIVE_ASSET_WHERE` — an unavailable unit is still on the shelf and still
 * has to be findable.
 */
export const BOOKABLE_ASSET_WHERE = {
	status: { notIn: [...UNBOOKABLE_ASSET_STATUSES] as string[] }
};

/** The mirror image — the listing that deliberately shows what has left. */
export const RETIRED_ASSET_WHERE = {
	status: { in: [...RETIRED_ASSET_STATUSES] as string[] }
};
