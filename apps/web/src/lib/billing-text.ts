export const DEFAULT_OFFER_INTRO =
	'Gerne bieten wir Ihnen für die Produktion „{production}“ im Zeitraum {servicePeriod} die folgenden Leistungen an.';
export const DEFAULT_OFFER_CLOSING =
	'Wir freuen uns auf Ihre Rückmeldung und stehen für Fragen gerne zur Verfügung.';
export const DEFAULT_INVOICE_INTRO =
	'Wie vereinbart, stellen wir Ihnen die folgenden Leistungen für die Produktion „{production}“ in Rechnung.';
export const DEFAULT_INVOICE_CLOSING =
	'Bitte überweisen Sie den Gesamtbetrag innerhalb von {paymentTermsDays} Tagen unter Angabe des Verwendungszwecks „{documentNumber}“ auf das unten angegebene Konto.';

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

/**
 * A document's texts have its number written into them, so a corrected number
 * has to be corrected there as well. Only where it stands on its own: "1" must
 * not rewrite the "14" of a payment term.
 */
export function replaceDocumentNumber(text: string | null, from: string, to: string) {
	if (!text || !from || from === to) return text;
	const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return text.replace(
		new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'gu'),
		() => to
	);
}

export function formatBillingDate(date: Date): string {
	return date.toLocaleDateString('de-DE');
}
