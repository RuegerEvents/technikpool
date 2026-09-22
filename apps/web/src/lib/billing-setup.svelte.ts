// What an org has to fill in before it can issue an offer or invoice — the
// dashboard's to-do card lists these. The PDF renderer's `validateDocument`
// is the rule that actually refuses a document; this mirrors its org half so
// nobody finds out at the moment they press "Generate".
//
// A `.svelte.ts` module so wuchale extracts the labels.

export type BillingSetupOrg = {
	addressId: string | null;
	taxId: string | null;
	isKleinunternehmer: boolean;
	billingEmail: string | null;
	bankAccountHolder: string | null;
	bankName: string | null;
	iban: string | null;
	bic: string | null;
};

export type BillingSetupStep = { key: string; label: string; done: boolean };

const filled = (value: string | null) => !!value?.trim();

export function billingSetupSteps(org: BillingSetupOrg): BillingSetupStep[] {
	return [
		{ key: 'address', label: 'Address', done: !!org.addressId },
		{
			key: 'tax',
			label: 'Tax number or VAT ID',
			done: org.isKleinunternehmer || filled(org.taxId)
		},
		{ key: 'email', label: 'Billing email', done: filled(org.billingEmail) },
		{
			key: 'bank',
			label: 'Bank account',
			done: [org.bankAccountHolder, org.bankName, org.iban, org.bic].every(filled)
		}
	];
}
