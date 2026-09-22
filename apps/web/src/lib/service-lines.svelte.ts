// Service lines: what an offer or invoice bills besides rented equipment —
// Personal, Transport, Vorprogrammierung, Beratung. Priced as quantity × unit
// price, and for a `perDay` line × the document's day count as well, so a
// technician booked per day follows the day count when it changes.
//
// A `.svelte.ts` module so wuchale extracts the unit labels. The PDF has its own
// German abbreviations in billing-pdf.ts, since a document prints in German
// whatever language the person issuing it reads.

export const SERVICE_UNITS = ['hour', 'day', 'flat', 'km', 'piece'] as const;
export type ServiceUnit = (typeof SERVICE_UNITS)[number];

export function isServiceUnit(value: unknown): value is ServiceUnit {
	return SERVICE_UNITS.includes(value as ServiceUnit);
}

/** The unit as a picker names it. */
export function serviceUnitLabel(unit: string | null | undefined): string {
	switch (unit) {
		case 'hour':
			return 'Hour';
		case 'day':
			return 'Day';
		case 'flat':
			return 'Flat rate';
		case 'km':
			return 'Kilometre';
		case 'piece':
			return 'Piece';
		default:
			return unit ?? '';
	}
}

/** The unit after a quantity, as in "8 hrs". */
export function serviceUnitShort(unit: string | null | undefined): string {
	switch (unit) {
		case 'hour':
			return 'Hrs.';
		case 'day':
			return 'Days';
		case 'flat':
			return 'Flat';
		case 'km':
			return 'km';
		case 'piece':
			return 'Pcs.';
		default:
			return unit ?? '';
	}
}

const toCents = (value: number) => Math.round(value * 100) / 100;

/** A service line's total, rounded the way `lineTotal` stores it. */
export function serviceLineTotal(
	quantity: number,
	unitPrice: number,
	perDay: boolean,
	dayCount: number
): number {
	return toCents(toCents(quantity) * toCents(unitPrice) * (perDay ? dayCount : 1));
}

/** "1,5" rather than "1.50" — a quantity prints without trailing zeros. */
export function formatQuantity(value: unknown): string {
	return Number(value).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}
