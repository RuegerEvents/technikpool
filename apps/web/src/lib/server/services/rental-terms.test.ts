import { describe, expect, it, vi } from 'vitest';

// The service imports the Prisma client; these tests only need its pure half.
vi.mock('../auth', () => ({ prisma: {} }));

const { DEFAULT_RENTAL_TERMS, renderRentalTerms, rentalTermsHash } = await import('./rental-terms');

const org = {
	name: 'Beispiel Veranstaltungstechnik GmbH',
	paymentTermsDays: 10,
	address: { line1: 'Hauptstraße 1', line2: null, postalCode: '10115', city: 'Berlin' }
};

describe('rental terms', () => {
	it('fills in every placeholder the default uses', () => {
		const body = renderRentalTerms(DEFAULT_RENTAL_TERMS, org);
		expect(body).toContain('Beispiel Veranstaltungstechnik GmbH, Hauptstraße 1');
		expect(body).toContain('innerhalb von 10 Tagen');
		expect(body).not.toMatch(/\{[A-Za-z]+\}/);
	});

	it('leaves a placeholder it does not know as written', () => {
		expect(renderRentalTerms('{org} {unknown}', org)).toBe(
			'Beispiel Veranstaltungstechnik GmbH {unknown}'
		);
	});

	it('hashes the text, so the same words are the same version', () => {
		expect(rentalTermsHash('a')).toBe(rentalTermsHash('a'));
		expect(rentalTermsHash('a')).not.toBe(rentalTermsHash('b'));
	});
});
