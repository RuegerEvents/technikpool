// The EN 16931 model (./model.ts) as UN/CEFACT Cross Industry Invoice XML —
// the syntax ZUGFeRD 2 / Factur-X embeds, in its EN 16931 ("COMFORT") profile.
//
// Written by hand rather than through a builder: the schema is strict about
// element order, and a template that reads top to bottom in that order is the
// easiest thing to hold against the spec. The order of every block below is
// the XSD's, not a choice.

import type { EInvoice, EInvoiceLine, PostalAddress } from './model.ts';

/** BT-24 for the EN 16931 profile of ZUGFeRD 2.x / Factur-X 1.x. */
export const EN16931_GUIDELINE = 'urn:cen.eu:en16931:2017';

function esc(value: string) {
	return (
		value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			// Control characters other than tab and line breaks are not allowed in XML 1.0.
			// eslint-disable-next-line no-control-regex -- matching them is the point
			.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
	);
}

const amount = (value: number) => value.toFixed(2);
// Up to four decimals (BT-146), two where that is all it has.
function price(value: number) {
	const fixed = value.toFixed(4);
	return fixed.endsWith('00') ? value.toFixed(2) : fixed;
}
const quantity = (value: number) => String(Math.round(value * 10000) / 10000);

/** Format 102 (CCYYMMDD), from the same local date the PDF prints. */
function date(value: Date) {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}`;
}

function dateTime(tag: string, value: Date) {
	return `<ram:${tag}><udt:DateTimeString format="102">${date(value)}</udt:DateTimeString></ram:${tag}>`;
}

function element(tag: string, value: string | null | undefined) {
	return value ? `<ram:${tag}>${esc(value)}</ram:${tag}>` : '';
}

function address(value: PostalAddress) {
	return [
		'<ram:PostalTradeAddress>',
		element('PostcodeCode', value.postalCode),
		element('LineOne', value.line1),
		element('LineTwo', value.line2),
		element('CityName', value.city),
		element('CountryID', value.country),
		'</ram:PostalTradeAddress>'
	].join('');
}

function email(value: string | null) {
	return value
		? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(value)}</ram:URIID></ram:URIUniversalCommunication>`
		: '';
}

function taxRegistration(scheme: 'VA' | 'FC', value: string | null) {
	return value
		? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="${scheme}">${esc(value)}</ram:ID></ram:SpecifiedTaxRegistration>`
		: '';
}

function line(invoice: EInvoice, item: EInvoiceLine) {
	const { vat } = invoice;
	return [
		'<ram:IncludedSupplyChainTradeLineItem>',
		`<ram:AssociatedDocumentLineDocument>${element('LineID', item.id)}</ram:AssociatedDocumentLineDocument>`,
		'<ram:SpecifiedTradeProduct>',
		element('Name', item.name),
		element('Description', item.description),
		'</ram:SpecifiedTradeProduct>',
		'<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice>',
		`<ram:ChargeAmount>${price(item.netPrice)}</ram:ChargeAmount>`,
		item.priceBaseQuantity === 1
			? ''
			: `<ram:BasisQuantity unitCode="${item.unitCode}">${quantity(item.priceBaseQuantity)}</ram:BasisQuantity>`,
		'</ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>',
		`<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${item.unitCode}">${quantity(item.quantity)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>`,
		'<ram:SpecifiedLineTradeSettlement>',
		`<ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${vat.category}</ram:CategoryCode><ram:RateApplicablePercent>${amount(vat.ratePercent)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`,
		`<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amount(item.netAmount)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>`,
		'</ram:SpecifiedLineTradeSettlement>',
		'</ram:IncludedSupplyChainTradeLineItem>'
	].join('');
}

export function toCii(invoice: EInvoice): string {
	const { seller, buyer, vat, totals, allowance, payment, period } = invoice;
	const categoryTax = `<ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${vat.category}</ram:CategoryCode><ram:RateApplicablePercent>${amount(vat.ratePercent)}</ram:RateApplicablePercent>`;
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rsm:CrossIndustryInvoice',
		' xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"',
		' xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"',
		' xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"',
		' xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">',
		'<rsm:ExchangedDocumentContext>',
		`<ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${EN16931_GUIDELINE}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>`,
		'</rsm:ExchangedDocumentContext>',
		'<rsm:ExchangedDocument>',
		element('ID', invoice.number),
		'<ram:TypeCode>380</ram:TypeCode>',
		dateTime('IssueDateTime', invoice.issueDate),
		'</rsm:ExchangedDocument>',
		'<rsm:SupplyChainTradeTransaction>',
		...invoice.lines.map((item) => line(invoice, item)),
		'<ram:ApplicableHeaderTradeAgreement>',
		'<ram:SellerTradeParty>',
		element('Name', seller.name),
		address(seller.address),
		email(seller.email),
		taxRegistration('VA', seller.vatId),
		taxRegistration('FC', seller.taxNumber),
		'</ram:SellerTradeParty>',
		'<ram:BuyerTradeParty>',
		element('Name', buyer.name),
		buyer.contactPerson
			? `<ram:DefinedTradeContact>${element('PersonName', buyer.contactPerson)}</ram:DefinedTradeContact>`
			: '',
		address(buyer.address),
		email(buyer.email),
		taxRegistration('VA', buyer.vatId),
		'</ram:BuyerTradeParty>',
		'</ram:ApplicableHeaderTradeAgreement>',
		'<ram:ApplicableHeaderTradeDelivery>',
		period
			? `<ram:ActualDeliverySupplyChainEvent>${dateTime('OccurrenceDateTime', period.end)}</ram:ActualDeliverySupplyChainEvent>`
			: '',
		'</ram:ApplicableHeaderTradeDelivery>',
		'<ram:ApplicableHeaderTradeSettlement>',
		// BT-83: the closing text asks for the invoice number as the reference.
		element('PaymentReference', invoice.number),
		'<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>',
		payment
			? [
					'<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode>',
					'<ram:PayeePartyCreditorFinancialAccount>',
					element('IBANID', payment.iban),
					element('AccountName', payment.accountName),
					'</ram:PayeePartyCreditorFinancialAccount>',
					payment.bic
						? `<ram:PayeeSpecifiedCreditorFinancialInstitution>${element('BICID', payment.bic)}</ram:PayeeSpecifiedCreditorFinancialInstitution>`
						: '',
					'</ram:SpecifiedTradeSettlementPaymentMeans>'
				].join('')
			: '',
		'<ram:ApplicableTradeTax>',
		`<ram:CalculatedAmount>${amount(totals.taxTotal)}</ram:CalculatedAmount>`,
		'<ram:TypeCode>VAT</ram:TypeCode>',
		element('ExemptionReason', vat.exemptionReason),
		`<ram:BasisAmount>${amount(totals.taxBasis)}</ram:BasisAmount>`,
		`<ram:CategoryCode>${vat.category}</ram:CategoryCode>`,
		`<ram:RateApplicablePercent>${amount(vat.ratePercent)}</ram:RateApplicablePercent>`,
		'</ram:ApplicableTradeTax>',
		period
			? `<ram:BillingSpecifiedPeriod>${dateTime('StartDateTime', period.start)}${dateTime('EndDateTime', period.end)}</ram:BillingSpecifiedPeriod>`
			: '',
		allowance
			? [
					'<ram:SpecifiedTradeAllowanceCharge>',
					'<ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator>',
					allowance.percent === null
						? ''
						: `<ram:CalculationPercent>${amount(allowance.percent)}</ram:CalculationPercent>`,
					allowance.base === null
						? ''
						: `<ram:BasisAmount>${amount(allowance.base)}</ram:BasisAmount>`,
					`<ram:ActualAmount>${amount(allowance.amount)}</ram:ActualAmount>`,
					'<ram:Reason>Rabatt</ram:Reason>',
					`<ram:CategoryTradeTax>${categoryTax}</ram:CategoryTradeTax>`,
					'</ram:SpecifiedTradeAllowanceCharge>'
				].join('')
			: '',
		'<ram:SpecifiedTradePaymentTerms>',
		element('Description', invoice.paymentTerms),
		dateTime('DueDateDateTime', invoice.dueDate),
		'</ram:SpecifiedTradePaymentTerms>',
		'<ram:SpecifiedTradeSettlementHeaderMonetarySummation>',
		`<ram:LineTotalAmount>${amount(totals.lineTotal)}</ram:LineTotalAmount>`,
		`<ram:ChargeTotalAmount>0.00</ram:ChargeTotalAmount>`,
		`<ram:AllowanceTotalAmount>${amount(totals.allowanceTotal)}</ram:AllowanceTotalAmount>`,
		`<ram:TaxBasisTotalAmount>${amount(totals.taxBasis)}</ram:TaxBasisTotalAmount>`,
		`<ram:TaxTotalAmount currencyID="EUR">${amount(totals.taxTotal)}</ram:TaxTotalAmount>`,
		`<ram:GrandTotalAmount>${amount(totals.grandTotal)}</ram:GrandTotalAmount>`,
		`<ram:DuePayableAmount>${amount(totals.grandTotal)}</ram:DuePayableAmount>`,
		'</ram:SpecifiedTradeSettlementHeaderMonetarySummation>',
		'</ram:ApplicableHeaderTradeSettlement>',
		'</rsm:SupplyChainTradeTransaction>',
		'</rsm:CrossIndustryInvoice>',
		''
	].join('\n');
}
