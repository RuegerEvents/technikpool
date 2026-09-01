// The issuing-org fields Offer and Invoice snapshot at creation, and the diff
// against the live Organization that the document pages show a hint for.
// Client-safe: used by the org-snapshot banner as well as the server command
// that re-snapshots a draft.

export type OrgSnapshotSource = {
	name: string;
	taxId: string | null;
	billingEmail: string | null;
	billingWebsite: string | null;
	bankAccountHolder: string | null;
	bankName: string | null;
	iban: string | null;
	bic: string | null;
	isKleinunternehmer: boolean;
	address: { line1: string; line2: string | null; postalCode: string; city: string } | null;
};

export type OrgSnapshotColumns = {
	orgName: string;
	orgAddressLine1: string | null;
	orgAddressLine2: string | null;
	orgPostalCode: string | null;
	orgCity: string | null;
	orgTaxId: string | null;
	orgBillingEmail: string | null;
	orgBillingWebsite: string | null;
	orgBankAccountHolder: string | null;
	orgBankName: string | null;
	orgIban: string | null;
	orgBic: string | null;
	isKleinunternehmerSnapshot: boolean;
};

export function orgSnapshotColumns(org: OrgSnapshotSource): OrgSnapshotColumns {
	return {
		orgName: org.name,
		orgAddressLine1: org.address?.line1 ?? null,
		orgAddressLine2: org.address?.line2 ?? null,
		orgPostalCode: org.address?.postalCode ?? null,
		orgCity: org.address?.city ?? null,
		orgTaxId: org.taxId,
		orgBillingEmail: org.billingEmail,
		orgBillingWebsite: org.billingWebsite,
		orgBankAccountHolder: org.bankAccountHolder,
		orgBankName: org.bankName,
		orgIban: org.iban,
		orgBic: org.bic,
		isKleinunternehmerSnapshot: org.isKleinunternehmer
	};
}

/** Grouped, user-meaningful keys — the banner maps these to labels. */
export type OrgSnapshotDiffKey = 'name' | 'address' | 'taxId' | 'contact' | 'bank' | 'vatStatus';

export function orgSnapshotDiff(
	doc: OrgSnapshotColumns,
	org: OrgSnapshotSource
): OrgSnapshotDiffKey[] {
	const live = orgSnapshotColumns(org);
	const differs = (keys: (keyof OrgSnapshotColumns)[]) =>
		keys.some((key) => (doc[key] ?? null) !== (live[key] ?? null));

	const diff: OrgSnapshotDiffKey[] = [];
	if (differs(['orgName'])) diff.push('name');
	if (differs(['orgAddressLine1', 'orgAddressLine2', 'orgPostalCode', 'orgCity']))
		diff.push('address');
	if (differs(['orgTaxId'])) diff.push('taxId');
	if (differs(['orgBillingEmail', 'orgBillingWebsite'])) diff.push('contact');
	if (differs(['orgBankAccountHolder', 'orgBankName', 'orgIban', 'orgBic'])) diff.push('bank');
	if (doc.isKleinunternehmerSnapshot !== live.isKleinunternehmerSnapshot) diff.push('vatStatus');
	return diff;
}
