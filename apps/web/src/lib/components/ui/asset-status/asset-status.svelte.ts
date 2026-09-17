import { ASSET_STATUSES, type AssetStatus } from '$lib/asset-status';

/**
 * Display name for a status. The value on the wire never moves — only its
 * label does — so an unknown value falls through to the raw string rather
 * than being hidden.
 */
export function assetStatusLabel(status: string): string {
	switch (status) {
		case 'AVAILABLE':
			return 'Available';
		case 'UNAVAILABLE':
			return 'Unavailable';
		case 'MAINTENANCE':
			return 'Maintenance';
		case 'BROKEN':
			return 'Broken';
		case 'SOLD':
			return 'Sold';
		case 'DECOMMISSIONED':
			return 'Decommissioned';
		default:
			return status;
	}
}

/**
 * What the status actually does, for the places where someone sets one. The
 * non-obvious part is that `MAINTENANCE` and `BROKEN` say something about the
 * unit's condition and still allow planning, while `UNAVAILABLE` is the one that
 * takes a unit out of bookings without taking it out of the pool — nobody can
 * guess that from the names alone.
 */
export function assetStatusDescription(status: string): string {
	switch (status) {
		case 'AVAILABLE':
			return 'In the pool and free to plan with.';
		case 'UNAVAILABLE':
			return 'Held back: cannot be booked, checked out or put in a bundle. Stays in the lists.';
		case 'MAINTENANCE':
			return 'Being serviced. Can still be booked — a unit back before the show is plannable.';
		case 'BROKEN':
			return 'Defective. Can still be booked — a repair that lands in time is plannable.';
		case 'SOLD':
			return 'Gone: sold on. Out of every list and count; only the status can still be changed.';
		case 'DECOMMISSIONED':
			return 'Gone: retired for good. Out of every list and count; only the status can still be changed.';
		default:
			return '';
	}
}

/** Badge colours. Retired statuses read as muted, not as an alarm. */
export function assetStatusClass(status: string): string {
	switch (status) {
		case 'AVAILABLE':
			return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
		case 'UNAVAILABLE':
			// Its own hue: not an alarm like BROKEN, not a promise like AVAILABLE.
			return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
		case 'MAINTENANCE':
			return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
		case 'BROKEN':
			return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
		case 'SOLD':
		case 'DECOMMISSIONED':
			return 'bg-muted text-muted-foreground';
		default:
			return '';
	}
}

export function assetStatusOptions(): { value: AssetStatus; label: string }[] {
	return ASSET_STATUSES.map((value) => ({ value, label: assetStatusLabel(value) }));
}
