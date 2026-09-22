// What an offer or invoice needs before it can become a PDF. One rule for both
// sides: the renderer refuses with it (`validateDocument` in billing-pdf.ts),
// and the document pages run it first so the missing pieces are listed where
// they can be filled in — instead of a PDF link that dies on a bare 4xx.
//
// A `.svelte.ts` module so wuchale extracts the labels.

import type { SnapshotOrganization } from './org-snapshot';

export type BillingDocumentCheckInput = {
	number?: string | null;
	createdAt?: Date;
	issueDate?: Date | null;
	customerName: string;
	customerAddress: string | null;
	serviceStartDate: Date | null;
	serviceEndDate: Date | null;
	introText: string | null;
	closingText: string | null;
	paymentTermsDays: number;
	organization: SnapshotOrganization;
	items: {
		description: string;
		categoryName: string | null;
		categoryNameDe?: string | null;
		lineTotal: unknown;
	}[];
};

/** Where an issue gets fixed, so a page can point at the right place. */
export type BillingIssueArea = 'organization' | 'customer' | 'document' | 'lines';

export type BillingIssue = { area: BillingIssueArea; label: string };

const blank = (value: unknown) =>
	typeof value === 'string' ? !value.trim() : value === null || value === undefined;

export function billingDocumentIssues(
	kind: 'offer' | 'invoice',
	data: BillingDocumentCheckInput
): BillingIssue[] {
	const issues: BillingIssue[] = [];
	const need = (area: BillingIssueArea, value: unknown, label: string) => {
		if (blank(value)) issues.push({ area, label });
	};
	const org = data.organization;

	need('organization', org.name, 'Organization name');
	if (!org.address) issues.push({ area: 'organization', label: 'Organization address' });
	need('organization', org.billingEmail, 'Billing email');
	// §14 Abs. 4 Nr. 2 UStG: one of the two, from a Kleinunternehmer as well.
	if (blank(org.taxNumber) && blank(org.vatId))
		issues.push({ area: 'organization', label: 'Tax number or VAT ID' });
	need('organization', org.bankAccountHolder, 'Bank account holder');
	need('organization', org.bankName, 'Bank name');
	need('organization', org.iban, 'IBAN');
	need('organization', org.bic, 'BIC');

	need('customer', data.customerName, 'Customer name');
	need('customer', data.customerAddress, 'Customer address');

	need('document', data.serviceStartDate, 'Service start date');
	need('document', data.serviceEndDate, 'Service end date');
	need('document', data.introText, 'Introduction text');
	need('document', data.closingText, 'Closing text');
	need('document', data.issueDate ?? data.createdAt, 'Document date');
	need('document', data.number, kind === 'invoice' ? 'Invoice number' : 'Offer number');
	if (!Number.isInteger(data.paymentTermsDays) || data.paymentTermsDays < 0)
		issues.push({ area: 'document', label: 'Valid payment term' });

	if (data.items.length === 0) issues.push({ area: 'lines', label: 'At least one line item' });
	data.items.forEach((item, index) => {
		const line = index + 1;
		if (!item.description.trim())
			issues.push({ area: 'lines', label: `Description for line ${line}` });
		if (!item.categoryName && !item.categoryNameDe)
			issues.push({ area: 'lines', label: `Category for line ${line}` });
		if (!Number.isFinite(Number(item.lineTotal)))
			issues.push({ area: 'lines', label: `Valid total for line ${line}` });
	});
	return issues;
}
