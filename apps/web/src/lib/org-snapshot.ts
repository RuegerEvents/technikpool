// The issuing-org fields Offer and Invoice snapshot at creation, and the diff
// against the live Organization that the document pages show a hint for.
// Client-safe: used by the org-snapshot banner as well as the server command
// that re-snapshots a draft.

export type OrgSnapshotSource = {
	name: string;
	taxNumber: string | null;
	vatId: string | null;
	billingEmail: string | null;
	billingWebsite: string | null;
	bankAccountHolder: string | null;
	bankName: string | null;
	iban: string | null;
	bic: string | null;
	isKleinunternehmer: boolean;
	logoPath: string | null;
	address: { line1: string; line2: string | null; postalCode: string; city: string } | null;
};

export type OrgSnapshotColumns = {
	orgName: string;
	orgAddressLine1: string | null;
	orgAddressLine2: string | null;
	orgPostalCode: string | null;
	orgCity: string | null;
	orgTaxNumber: string | null;
	orgVatId: string | null;
	orgBillingEmail: string | null;
	orgBillingWebsite: string | null;
	orgBankAccountHolder: string | null;
	orgBankName: string | null;
	orgIban: string | null;
	orgBic: string | null;
	orgLogoPath: string | null;
	isKleinunternehmerSnapshot: boolean;
};

export function orgSnapshotColumns(org: OrgSnapshotSource): OrgSnapshotColumns {
	return {
		orgName: org.name,
		orgAddressLine1: org.address?.line1 ?? null,
		orgAddressLine2: org.address?.line2 ?? null,
		orgPostalCode: org.address?.postalCode ?? null,
		orgCity: org.address?.city ?? null,
		orgTaxNumber: org.taxNumber,
		orgVatId: org.vatId,
		orgBillingEmail: org.billingEmail,
		orgBillingWebsite: org.billingWebsite,
		orgBankAccountHolder: org.bankAccountHolder,
		orgBankName: org.bankName,
		orgIban: org.iban,
		orgBic: org.bic,
		orgLogoPath: org.logoPath,
		isKleinunternehmerSnapshot: org.isKleinunternehmer
	};
}

/** Grouped, user-meaningful keys — the banner maps these to labels. */
export type OrgSnapshotDiffKey =
	'name' | 'address' | 'tax' | 'contact' | 'bank' | 'logo' | 'vatStatus';

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
	if (differs(['orgTaxNumber', 'orgVatId'])) diff.push('tax');
	if (differs(['orgBillingEmail', 'orgBillingWebsite'])) diff.push('contact');
	if (differs(['orgBankAccountHolder', 'orgBankName', 'orgIban', 'orgBic'])) diff.push('bank');
	if (differs(['orgLogoPath'])) diff.push('logo');
	if (doc.isKleinunternehmerSnapshot !== live.isKleinunternehmerSnapshot) diff.push('vatStatus');
	return diff;
}

/** The issuing org as a document renders it: from its snapshot, never live. */
export type SnapshotOrganization = {
	name: string;
	address: { line1: string; line2: string | null; postalCode: string; city: string } | null;
	taxNumber: string | null;
	vatId: string | null;
	billingEmail: string | null;
	billingWebsite: string | null;
	bankAccountHolder: string | null;
	iban: string | null;
	bic: string | null;
	bankName: string | null;
	/** Object key of the letterhead logo. */
	logoPath?: string | null;
	isKleinunternehmer?: boolean;
};

/**
 * Documents render from the snapshot columns, never from the live
 * Organization — an org moving offices must not rewrite an already-issued
 * document.
 */
export function organizationFromSnapshot(doc: OrgSnapshotColumns): SnapshotOrganization {
	return {
		name: doc.orgName,
		address:
			doc.orgAddressLine1 && doc.orgPostalCode && doc.orgCity
				? {
						line1: doc.orgAddressLine1,
						line2: doc.orgAddressLine2,
						postalCode: doc.orgPostalCode,
						city: doc.orgCity
					}
				: null,
		taxNumber: doc.orgTaxNumber,
		vatId: doc.orgVatId,
		billingEmail: doc.orgBillingEmail,
		billingWebsite: doc.orgBillingWebsite,
		bankAccountHolder: doc.orgBankAccountHolder,
		iban: doc.orgIban,
		bic: doc.orgBic,
		bankName: doc.orgBankName,
		logoPath: doc.orgLogoPath,
		isKleinunternehmer: doc.isKleinunternehmerSnapshot
	};
}
