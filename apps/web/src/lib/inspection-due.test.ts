import { describe, expect, it } from 'vitest';
import { addMonths, inspectionDue } from './inspection-due.ts';

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
