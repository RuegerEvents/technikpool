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

/** Badge colours. Retired statuses read as muted, not as an alarm. */
export function assetStatusClass(status: string): string {
	switch (status) {
		case 'AVAILABLE':
			return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
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
