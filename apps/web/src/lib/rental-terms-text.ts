// How documents cite an org's rental terms. Pure and client-safe, so the PDF,
// the e-invoice XML, the text editors and their tests agree. German, like every
// generated document.

export type RentalTermsCitation = {
	/** "02.11.2026", the version's "Stand". */
	date: string;
	/** Where that version can be read, signed out. */
	url: string;
};

/**
 * The placeholders an offer's or invoice's texts cite the terms with. They are
 * left in a draft's text (the version is only fixed when it is finalized) and
 * filled in on the PDF and, for good, on finalizing.
 */
export const RENTAL_TERMS_PLACEHOLDERS = ['{rentalTermsDate}', '{rentalTermsUrl}'] as const;

/**
 * Fills in the rental-terms placeholders. Without terms (the org has none on),
 * every line that holds one is dropped, so the sentence citing them goes with
 * them and no "(Stand )" is left on paper.
 */
export function applyRentalTerms(text: string, terms: RentalTermsCitation | null | undefined) {
	if (terms) {
		return text
			.replaceAll('{rentalTermsDate}', terms.date)
			.replaceAll('{rentalTermsUrl}', terms.url);
	}
	if (!RENTAL_TERMS_PLACEHOLDERS.some((p) => text.includes(p))) return text;
	return text
		.split('\n')
		.filter((line) => !RENTAL_TERMS_PLACEHOLDERS.some((p) => line.includes(p)))
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/** The fixed sentences: the e-invoice's note and the delivery note's confirmation. */
export function rentalTermsNote(kind: 'invoice' | 'delivery-note', terms: RentalTermsCitation) {
	const where = `abrufbar unter ${terms.url}`;
	switch (kind) {
		case 'invoice':
			return `Es gelten unsere Allgemeinen Mietbedingungen (Stand ${terms.date}), ${where}.`;
		case 'delivery-note':
			return (
				'Mit seiner Unterschrift bestätigt der Empfänger den Empfang der aufgeführten Mietsache. ' +
				'Mängel, die hier nicht vermerkt sind, gelten als bei Übergabe nicht vorhanden, solange der ' +
				`Empfänger nichts anderes nachweist. Es gelten unsere Allgemeinen Mietbedingungen (Stand ${terms.date}), ${where}.`
			);
	}
}
