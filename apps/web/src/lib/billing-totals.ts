// The sums under an offer or invoice, and the only place they are worked out:
// the page, the lists, the PDF and the e-invoice XML all read them from here.
//
// Everything is counted in whole cents, rounded at the steps EN 16931 rounds at
// (BT-106 … BT-112): the line totals are already cents, the discount is rounded
// once, the VAT is rounded once from the discounted net, and the gross is their
// sum. Worked out in floats and rounded only for display, the printed lines
// could disagree with their own total by a cent — harmless on paper, a
// validation error in the XML a ZUGFeRD invoice carries.

export type BillingTotalsInput = {
	items: { lineTotal: unknown }[];
	discountType: string | null;
	discountValue: unknown;
	vatRatePercent: unknown;
};

export type BillingTotals = {
	/** Sum of the lines (BT-106). */
	subtotal: number;
	/** Document-level discount (BT-107); 0 without one. */
	discount: number;
	/** Taxable amount (BT-109). */
	net: number;
	vatRatePercent: number;
	/** BT-110. */
	vat: number;
	/** Amount due (BT-112). */
	gross: number;
};

const cents = (value: unknown) => Math.round(Number(value ?? 0) * 100);

export function billingTotals(doc: BillingTotalsInput): BillingTotals {
	const subtotal = doc.items.reduce((sum, item) => sum + cents(item.lineTotal), 0);
	const value = Number(doc.discountValue ?? 0);
	let discount = 0;
	if (doc.discountType === 'PERCENT' && value > 0) discount = Math.round((subtotal * value) / 100);
	else if (doc.discountType === 'AMOUNT' && value > 0) discount = cents(value);
	discount = Math.min(Math.max(subtotal, 0), discount);
	const net = subtotal - discount;
	const vatRatePercent = Number(doc.vatRatePercent ?? 0);
	const vat = Math.round((net * vatRatePercent) / 100);
	return {
		subtotal: subtotal / 100,
		discount: discount / 100,
		net: net / 100,
		vatRatePercent,
		vat: vat / 100,
		gross: (net + vat) / 100
	};
}
