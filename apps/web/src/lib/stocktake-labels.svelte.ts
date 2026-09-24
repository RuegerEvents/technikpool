// Display names for a stocktake's vocabulary. The values stay English and
// lowercase on the wire (the API publishes them); only what a person reads is
// translated, which is why this is a `.svelte.ts` module — wuchale extracts
// from these, not from plain `.ts`.

export type StocktakeItemState = 'open' | 'found' | 'out' | 'missing' | 'unexpected';

export function stocktakeStateLabel(state: StocktakeItemState): string {
	switch (state) {
		case 'open':
			return 'Not counted yet';
		case 'found':
			return 'Found';
		case 'out':
			return 'Out on a production';
		case 'missing':
			return 'Missing';
		case 'unexpected':
			return 'Unexpected';
	}
}

export function stocktakeStateClass(state: StocktakeItemState): string {
	switch (state) {
		case 'found':
			return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300';
		case 'missing':
			return 'bg-destructive/10 text-destructive';
		case 'unexpected':
			return 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200';
		case 'out':
			return 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200';
		default:
			return 'bg-muted text-muted-foreground';
	}
}

export function unexpectedReasonLabel(reason: string | null): string {
	switch (reason) {
		case 'other_org':
			return 'Belongs to another organization';
		case 'retired':
			return 'Sold or decommissioned';
		case 'other_location':
			return 'Booked to a location outside this stocktake';
		case 'out_of_scope':
			return 'Not part of this stocktake';
		default:
			return 'Not on the list';
	}
}

export function foundViaLabel(via: string | null): string {
	switch (via) {
		case 'scan':
			return 'Scanned';
		case 'manual':
			return 'Ticked by hand';
		case 'parent':
			return 'Confirmed with its parent unit';
		case 'bundle':
			return 'Confirmed with its bundle';
		default:
			return '';
	}
}
