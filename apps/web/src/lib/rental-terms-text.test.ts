import { describe, expect, it } from 'vitest';
import { DEFAULT_INVOICE_CLOSING, DEFAULT_OFFER_CLOSING } from './billing-text.ts';
import { applyRentalTerms } from './rental-terms-text.ts';

const terms = { date: '02.11.2026', url: 'https://example.org/rental-terms/acme/3' };

describe('applyRentalTerms', () => {
	it('fills in the version a document cites', () => {
		expect(applyRentalTerms(DEFAULT_INVOICE_CLOSING, terms)).toContain(
			'Es gelten unsere Allgemeinen Mietbedingungen (Stand 02.11.2026), abrufbar unter https://example.org/rental-terms/acme/3.'
		);
	});

	it('drops the line that cites them when there are none', () => {
		expect(applyRentalTerms(DEFAULT_OFFER_CLOSING, null)).toBe(
			'Wir freuen uns auf Ihre Rückmeldung und stehen für Fragen gerne zur Verfügung.'
		);
	});

	it('leaves a text without the placeholders alone', () => {
		expect(applyRentalTerms('Danke.\n\n\nBis bald.', null)).toBe('Danke.\n\n\nBis bald.');
	});
});
