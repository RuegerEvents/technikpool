// An invoice as EN 16931 sees it: the semantic model behind the CII XML that a
// ZUGFeRD PDF carries (see ./cii.ts for the syntax, ./pdfa3.ts for the PDF).
//
// Pure and synchronous on purpose — every number in here has to agree with
// the PDF it is embedded in, so both read the same sources: `billingTotals`
// for the sums and `groupBillingItems` for the lines, which makes position 3
// in the XML position 3 on paper.
//
// Business terms (BT-…) are named where a field maps onto one, since that is
// what a validator's message refers to.

import { billingTotals } from '../../billing-totals.ts';
import { groupBillingItems, lineSubtitle, type GroupableItem } from '../../billing-lines.ts';
import type { SnapshotOrganization } from '../../org-snapshot.ts';

export type EInvoiceSource = {
	number: string;
	issueDate: Date;
	customerName: string;
	customerContactPerson: string | null;
	customerEmail: string | null;
	customerVatId: string | null;
	customerAddressLine1: string | null;
	customerAddressLine2: string | null;
	customerPostalCode: string | null;
	customerCity: string | null;
	customerCountry: string;
	serviceStartDate: Date | null;
	serviceEndDate: Date | null;
	paymentTermsDays: number;
	dayCount: number;
	discountType: string | null;
	discountValue: unknown;
	vatRatePercent: unknown;
	isKleinunternehmerSnapshot: boolean;
	organization: SnapshotOrganization;
	items: GroupableItem[];
};

export type PostalAddress = {
	line1: string;
	line2: string | null;
	postalCode: string;
	city: string;
	/** ISO 3166-1 alpha-2 (BT-40 / BT-55). */
	country: string;
};

/** UN/ECE Recommendation 20 codes for the units a line can be billed in. */
export type UnitCode = 'C62' | 'H87' | 'HUR' | 'DAY' | 'LS' | 'KMT';

/** VAT category (UNTDID 5305): standard rate, or exempt under §19 UStG. */
export type VatCategory = 'S' | 'E';

export type EInvoiceLine = {
	/** BT-126, the position printed on the PDF. */
	id: string;
	/** BT-153. */
	name: string;
	/** BT-154. */
	description: string | null;
	/** BT-129 / BT-130. */
	quantity: number;
	unitCode: UnitCode;
	/** BT-146, up to four decimals. */
	netPrice: number;
	/** BT-149: the quantity netPrice is for; 1 unless the price would not divide evenly. */
	priceBaseQuantity: number;
	/** BT-131. */
	netAmount: number;
};

export type EInvoice = {
	number: string;
	issueDate: Date;
	/** BT-9. */
	dueDate: Date;
	/** BT-20. */
	paymentTerms: string;
	seller: {
		name: string;
		address: PostalAddress;
		email: string | null;
		vatId: string | null;
		/** Steuernummer (BT-32, scheme FC). */
		taxNumber: string | null;
	};
	buyer: {
		name: string;
		contactPerson: string | null;
		address: PostalAddress;
		email: string | null;
		vatId: string | null;
	};
	/** BG-14, the service period. */
	period: { start: Date; end: Date } | null;
	payment: { iban: string; bic: string | null; accountName: string | null } | null;
	vat: {
		category: VatCategory;
		ratePercent: number;
		/** BT-120, only for an exempt category. */
		exemptionReason: string | null;
	};
	/** BG-20: the document's discount, if it has one. */
	allowance: { amount: number; percent: number | null; base: number | null } | null;
	lines: EInvoiceLine[];
	totals: {
		/** BT-106. */
		lineTotal: number;
		/** BT-107. */
		allowanceTotal: number;
		/** BT-109. */
		taxBasis: number;
		/** BT-110. */
		taxTotal: number;
		/** BT-112 / BT-115. */
		grandTotal: number;
	};
};

export const KLEINUNTERNEHMER_REASON =
	'Kein Ausweis von Umsatzsteuer, da Kleinunternehmer gemäß § 19 UStG';

const SERVICE_UNIT_CODES: Record<string, UnitCode> = {
	hour: 'HUR',
	day: 'DAY',
	flat: 'LS',
	km: 'KMT',
	piece: 'H87'
};

const cents = (value: number) => Math.round(value * 100);

/**
 * Quantity × price has to come out at the line's total. A price that divides
 * evenly is written per unit; one that would not (10,00 € over three units)
 * is written for the whole quantity instead, via the base quantity — exact,
 * where 3,3333 × 3 would be a cent off on a long enough line.
 */
function priced(quantity: number, netAmount: number) {
	if (quantity > 0) {
		const unitPrice = Math.round((netAmount / quantity) * 10000) / 10000;
		if (cents(unitPrice * quantity) === cents(netAmount))
			return { netPrice: unitPrice, priceBaseQuantity: 1 };
		return { netPrice: netAmount, priceBaseQuantity: quantity };
	}
	return { netPrice: netAmount, priceBaseQuantity: 1 };
}

function days(count: number) {
	return count === 1 ? '1 Tag' : `${count} Tage`;
}

function addDays(date: Date, count: number) {
	const result = new Date(date);
	result.setDate(result.getDate() + count);
	return result;
}

export function buildEInvoice(source: EInvoiceSource): EInvoice {
	const org = source.organization;
	// Both are in billingDocumentIssues, which the renderer runs first.
	if (!org.address) throw new Error('E-invoice needs the seller address');
	if (!source.customerAddressLine1 || !source.customerPostalCode || !source.customerCity)
		throw new Error('E-invoice needs the customer address');

	const totals = billingTotals(source);
	const exempt = source.isKleinunternehmerSnapshot;
	const groups = groupBillingItems(
		source.items,
		(item) => item.categoryNameDe || item.categoryName || 'Ohne Kategorie'
	);

	let position = 0;
	const lines: EInvoiceLine[] = [];
	for (const group of groups)
		for (const line of group.lines) {
			position++;
			// Summed in cents: the stored totals are cents, a float sum need not be.
			const netAmount =
				line.items.reduce((sum, item) => sum + cents(Number(item.lineTotal)), 0) / 100;
			const service = line.service;
			const subtitle = lineSubtitle(line);
			if (service) {
				const quantity = Number(line.quantity) * (service.perDay ? source.dayCount : 1);
				lines.push({
					id: String(position),
					name: line.label.split('\n')[0],
					description:
						[subtitle, service.perDay ? `je Tag, ${days(source.dayCount)}` : '']
							.filter(Boolean)
							.join('\n') || null,
					quantity,
					unitCode: SERVICE_UNIT_CODES[service.unit ?? ''] ?? 'C62',
					...priced(quantity, netAmount),
					netAmount
				});
			} else {
				// Equipment is rented by the unit for the billed days: the price is
				// per unit for the whole period, and the days go into the description.
				lines.push({
					id: String(position),
					name: line.label.split('\n')[0],
					description: [`Miete für ${days(source.dayCount)}`, subtitle].filter(Boolean).join('\n'),
					quantity: line.quantity,
					unitCode: 'C62',
					...priced(line.quantity, netAmount),
					netAmount
				});
			}
		}

	const percent = source.discountType === 'PERCENT' ? Number(source.discountValue) : null;
	return {
		number: source.number,
		issueDate: source.issueDate,
		dueDate: addDays(source.issueDate, source.paymentTermsDays),
		paymentTerms:
			source.paymentTermsDays === 0
				? 'Zahlbar sofort ohne Abzug'
				: `Zahlbar innerhalb von ${source.paymentTermsDays} Tagen ohne Abzug`,
		seller: {
			name: org.name,
			address: { ...org.address, country: 'DE' },
			email: org.billingEmail?.trim() || null,
			vatId: org.vatId?.trim() || null,
			taxNumber: org.taxNumber?.trim() || null
		},
		buyer: {
			name: source.customerName,
			contactPerson: source.customerContactPerson?.trim() || null,
			address: {
				line1: source.customerAddressLine1!.trim(),
				line2: source.customerAddressLine2?.trim() || null,
				postalCode: source.customerPostalCode!.trim(),
				city: source.customerCity!.trim(),
				country: source.customerCountry
			},
			email: source.customerEmail?.trim() || null,
			vatId: source.customerVatId?.trim() || null
		},
		period:
			source.serviceStartDate && source.serviceEndDate
				? { start: source.serviceStartDate, end: source.serviceEndDate }
				: null,
		payment: org.iban
			? {
					iban: org.iban.replace(/\s+/g, '').toUpperCase(),
					bic: org.bic?.replace(/\s+/g, '').toUpperCase() || null,
					accountName: org.bankAccountHolder?.trim() || org.name
				}
			: null,
		vat: {
			category: exempt ? 'E' : 'S',
			ratePercent: exempt ? 0 : totals.vatRatePercent,
			exemptionReason: exempt ? KLEINUNTERNEHMER_REASON : null
		},
		allowance: totals.discount
			? {
					amount: totals.discount,
					percent,
					base: percent === null ? null : totals.subtotal
				}
			: null,
		lines,
		totals: {
			lineTotal: totals.subtotal,
			allowanceTotal: totals.discount,
			taxBasis: totals.net,
			taxTotal: totals.vat,
			grandTotal: totals.gross
		}
	};
}
