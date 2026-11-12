// When a unit's next inspection of one type is due. Nobody sets this date: it
// follows from the unit's interval for that type and its inspections of that
// type, and is stored on the schedule (`AssetInspectionSchedule.nextDue`, the
// earliest of them on `Asset.nextInspectionDue`) only so lists can sort and
// filter by it. Every write goes through `inspectionDue`.

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
 * The seeded inspection types (migration 20261111120000_inspection_types). Their
 * ids are fixed there, so code can name them without a lookup; a type a system
 * admin adds later has an id like any other row and no special meaning.
 */
export const INSPECTION_TYPE_IDS = {
	electrical: 'inst_electrical',
	lifting: 'inst_lifting',
	visual: 'inst_visual',
	calibration: 'inst_calibration'
} as const;

/** What an inspection without a type is — the only kind there was before types. */
export const DEFAULT_INSPECTION_TYPE_ID = INSPECTION_TYPE_IDS.electrical;

export type RequirementProduct = {
	isLicense: boolean;
	inspectionTypes: { typeId: string; required: boolean }[];
	category: { inspectionTypes: { typeId: string }[] };
};

/**
 * Which inspection types a product's units need: per type, the product's own
 * answer if it has one, else its category's. A licence is software and needs none.
 */
export function requiredInspectionTypes(product: RequirementProduct): Set<string> {
	if (product.isLicense) return new Set();
	const required = new Set(product.category.inspectionTypes.map((t) => t.typeId));
	for (const own of product.inspectionTypes) {
		if (own.required) required.add(own.typeId);
		else required.delete(own.typeId);
	}
	return required;
}

export function requiresInspection(product: RequirementProduct, typeId: string): boolean {
	return requiredInspectionTypes(product).has(typeId);
}

/** The product's own answer for one type: true, false, or null to follow the category. */
export function inspectionOverride(product: RequirementProduct, typeId: string): boolean | null {
	return product.inspectionTypes.find((t) => t.typeId === typeId)?.required ?? null;
}

/**
 * An org's interval for each type: its own where it set one (null included,
 * which means it tracks none), else the type's default.
 */
export function orgIntervals(
	types: { id: string; defaultIntervalMonths: number | null }[],
	own: { typeId: string; months: number | null }[]
): Map<string, number | null> {
	const byType = new Map(own.map((row) => [row.typeId, row.months]));
	return new Map(
		types.map((t) => [t.id, byType.has(t.id) ? byType.get(t.id)! : t.defaultIntervalMonths])
	);
}

/** The earliest of a unit's due dates, which is what `Asset.nextInspectionDue` holds. */
export function earliestDue(dates: (Date | null)[]): Date | null {
	let earliest: Date | null = null;
	for (const d of dates) if (d && (!earliest || d < earliest)) earliest = d;
	return earliest;
}
