import { describe, expect, it } from 'vitest';
import {
	addMonths,
	earliestDue,
	inspectionDue,
	inspectionOverride,
	orgIntervals,
	requiredInspectionTypes,
	requiresInspection
} from './inspection-due.ts';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('addMonths', () => {
	it('adds whole months', () => {
		expect(addMonths(day('2026-03-15'), 12)).toEqual(day('2027-03-15'));
	});

	it('clamps to the end of a shorter month, like Postgres', () => {
		expect(addMonths(day('2026-01-31'), 1)).toEqual(day('2026-02-28'));
		expect(addMonths(day('2028-01-31'), 1)).toEqual(day('2028-02-29'));
		expect(addMonths(day('2026-08-31'), 6)).toEqual(day('2027-02-28'));
	});
});

describe('inspectionDue', () => {
	const created = day('2026-01-10');

	it('is nothing without an interval', () => {
		expect(inspectionDue(null, null, created)).toBeNull();
		expect(inspectionDue(null, { performedAt: day('2026-02-01'), result: 'PASSED' }, created)).toBe(
			null
		);
	});

	it('is due at once when never inspected', () => {
		expect(inspectionDue(12, null, created)).toEqual(created);
	});

	it('is the last passed inspection plus the interval', () => {
		expect(
			inspectionDue(12, { performedAt: day('2026-02-01'), result: 'PASSED' }, created)
		).toEqual(day('2027-02-01'));
	});

	it('stays due after a failed inspection', () => {
		expect(
			inspectionDue(12, { performedAt: day('2026-02-01'), result: 'FAILED' }, created)
		).toEqual(day('2026-02-01'));
	});
});

describe('requiresInspection', () => {
	const product = (own: Record<string, boolean>, category: string[], isLicense = false) => ({
		isLicense,
		inspectionTypes: Object.entries(own).map(([typeId, required]) => ({ typeId, required })),
		category: { inspectionTypes: category.map((typeId) => ({ typeId })) }
	});

	it('follows the category per type unless the product says otherwise', () => {
		expect(requiresInspection(product({}, ['el']), 'el')).toBe(true);
		expect(requiresInspection(product({}, []), 'el')).toBe(false);
		expect(requiresInspection(product({ el: false }, ['el']), 'el')).toBe(false);
		expect(requiresInspection(product({ el: true }, []), 'el')).toBe(true);
	});

	it('answers each type on its own', () => {
		const hoist = product({ lift: true }, ['el']);
		expect([...requiredInspectionTypes(hoist)].sort()).toEqual(['el', 'lift']);
		expect(inspectionOverride(hoist, 'lift')).toBe(true);
		expect(inspectionOverride(hoist, 'el')).toBeNull();
	});

	it('never for a licence', () => {
		expect(requiredInspectionTypes(product({ el: true }, ['el'], true)).size).toBe(0);
	});
});

describe('orgIntervals', () => {
	const types = [
		{ id: 'el', defaultIntervalMonths: 12 },
		{ id: 'vis', defaultIntervalMonths: null }
	];

	it("takes the org's own interval, null included, else the type's default", () => {
		expect(orgIntervals(types, [])).toEqual(
			new Map([
				['el', 12],
				['vis', null]
			])
		);
		expect(orgIntervals(types, [{ typeId: 'el', months: null }]).get('el')).toBeNull();
		expect(orgIntervals(types, [{ typeId: 'vis', months: 3 }]).get('vis')).toBe(3);
	});
});

describe('earliestDue', () => {
	it('is the earliest date, ignoring types that are not due', () => {
		expect(earliestDue([null, day('2027-01-01'), day('2026-05-01')])).toEqual(day('2026-05-01'));
		expect(earliestDue([null])).toBeNull();
	});
});
