// When a unit's next DGUV inspection is due. Nobody sets this date: it follows
// from the unit's interval and its inspections, and is stored on the asset
// (`nextInspectionDue`) only so lists can sort and filter by it. Every write
// goes through `inspectionDue`, and the migration that introduced the rule
// computes the same thing in SQL.

export const INSPECTION_RESULTS = ['PASSED', 'FAILED'] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

/**
 * `date` plus whole months, in UTC, clamped to the end of a shorter month —
 * 31 January plus one month is 28 (or 29) February, the way Postgres adds an
 * interval, so the migration and the app agree on every date.
 */
export function addMonths(date: Date, months: number): Date {
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth() + months;
	const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	return new Date(
		Date.UTC(
			year,
			month,
			Math.min(date.getUTCDate(), lastDay),
			date.getUTCHours(),
			date.getUTCMinutes(),
			date.getUTCSeconds(),
			date.getUTCMilliseconds()
		)
	);
}

/**
 * - no interval: not tracked, nothing is due
 * - never inspected: due from the day the unit was registered, i.e. at once
 * - last inspection failed: due on that day, until a passed one is recorded
 * - otherwise: the last inspection plus the interval
 *
 * `latest` is the inspection with the latest `performedAt`, not the one entered
 * last, so recording an old inspection afterwards never moves the date back.
 */
export function inspectionDue(
	intervalMonths: number | null,
	latest: { performedAt: Date; result: string } | null,
	createdAt: Date
): Date | null {
	if (!intervalMonths) return null;
	if (!latest) return createdAt;
	if (latest.result === 'FAILED') return latest.performedAt;
	return addMonths(latest.performedAt, intervalMonths);
}

/**
 * Whether a product's units need DGUV inspections: the product's own answer if
 * it has one, else its category's. A licence is software and never does.
 */
export function requiresInspection(product: {
	requiresInspection: boolean | null;
	isLicense: boolean;
	category: { requiresInspection: boolean };
}): boolean {
	if (product.isLicense) return false;
	return product.requiresInspection ?? product.category.requiresInspection;
}

/** The interval a new unit of this product starts with: the org's, if it needs inspecting. */
export function initialInspectionInterval(
	product: Parameters<typeof requiresInspection>[0],
	orgDefaultMonths: number | null
): number | null {
	return requiresInspection(product) ? orgDefaultMonths : null;
}
