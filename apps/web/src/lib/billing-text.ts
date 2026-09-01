export const DEFAULT_OFFER_INTRO =
	'Gerne bieten wir Ihnen für die Produktion „{production}“ im Zeitraum {servicePeriod} die folgenden Leistungen an.';
export const DEFAULT_OFFER_CLOSING =
	'Wir freuen uns auf Ihre Rückmeldung und stehen für Fragen gerne zur Verfügung.';
export const DEFAULT_INVOICE_INTRO =
	'Wie vereinbart, stellen wir Ihnen die folgenden Leistungen für die Produktion „{production}“ in Rechnung.';
export const DEFAULT_INVOICE_CLOSING =
	'Bitte überweisen Sie den Gesamtbetrag innerhalb von {paymentTermsDays} Tagen auf das unten angegebene Konto.';

export type BillingTextVariables = {
	production: string;
	startDate: string;
	endDate: string;
	servicePeriod: string;
	customer: string;
	documentNumber?: string;
	paymentTermsDays: number;
};

export function renderBillingText(template: string, values: BillingTextVariables): string {
	return template.replace(/\{([A-Za-z]+)\}/g, (placeholder, key: keyof BillingTextVariables) => {
		const value = values[key];
		return value === undefined ? placeholder : String(value);
	});
}

export function formatBillingDate(date: Date): string {
	return date.toLocaleDateString('de-DE');
}
