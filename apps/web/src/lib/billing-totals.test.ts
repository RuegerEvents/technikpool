import { describe, expect, it } from 'vitest';
import { billingTotals } from './billing-totals.ts';

const lines = (...totals: number[]) => totals.map((lineTotal) => ({ lineTotal }));

describe('discount down to a fixed price', () => {
	it('keeps the net price when lines are added', () => {
		const fixed = { discountType: 'TARGET_NET', discountValue: 1000, vatRatePercent: 19 };
		expect(billingTotals({ ...fixed, items: lines(800, 400) }).net).toBe(1000);
		// The bug: the discount was stored as the 200 it came to on the day.
		const later = billingTotals({ ...fixed, items: lines(800, 400, 150) });
		expect(later.net).toBe(1000);
		expect(later.discount).toBe(350);
	});

	it('lands the gross on the cent, or just below where no net reaches it', () => {
		const grossFor = (gross: number) =>
			billingTotals({
				items: lines(2000),
				discountType: 'TARGET_GROSS',
				discountValue: gross,
				vatRatePercent: 19
			}).gross;
		for (const gross of [1000, 999.99, 250]) expect(grossFor(gross)).toBe(gross);
		// At 19 % no net comes to 1234.56: 1037.44 makes 1234.55, 1037.45 makes 1234.57.
		expect(grossFor(1234.56)).toBe(1234.55);
	});

	it('never adds a surcharge when the lines come to less', () => {
		const totals = billingTotals({
			items: lines(500),
			discountType: 'TARGET_NET',
			discountValue: 1000,
			vatRatePercent: 19
		});
		expect(totals.discount).toBe(0);
		expect(totals.net).toBe(500);
	});
});
