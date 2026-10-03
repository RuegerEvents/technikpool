import bwipjs from 'bwip-js/node';

// The GiroCode (EPC069-12) on an invoice: a QR a banking app turns into a
// filled-in SEPA transfer. The payload is twelve lines in a fixed order.

export type GiroCodeTransfer = {
	name: string;
	iban: string;
	bic: string | null;
	/** Euros; the code carries cents. */
	amount: number;
	/** The Verwendungszweck. */
	reference: string;
};

/** The standard's ceiling for the whole payload, in bytes. */
const MAX_BYTES = 331;

/**
 * The payload, or null where the standard has no code for this transfer (no
 * IBAN, nothing to pay). An invoice without a GiroCode is still an
 * invoice, so nothing here refuses.
 */
export function giroCodePayload(transfer: GiroCodeTransfer): string | null {
	// Not checked beyond what fits the field: the code repeats the IBAN the
	// footer prints, and whether that one is right is the org form's question.
	const iban = transfer.iban.replace(/\s+/g, '').toUpperCase();
	if (!/^[A-Z0-9]{1,34}$/.test(iban)) return null;
	// Version 002 lets the BIC stay empty, so a mistyped one is dropped rather
	// than handed to the banking app.
	const bic = (transfer.bic ?? '').replace(/\s+/g, '').toUpperCase();
	const cents = Math.round(transfer.amount * 100);
	if (!Number.isFinite(cents) || cents < 1 || cents > 99999999999) return null;
	const line = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max);
	const name = line(transfer.name, 70);
	if (!name) return null;

	const payload = [
		'BCD',
		'002',
		'1', // UTF-8
		'SCT',
		/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic) ? bic : '',
		name,
		iban,
		`EUR${(cents / 100).toFixed(2)}`,
		'', // purpose code
		'', // structured reference — a German invoice number is not one
		line(transfer.reference, 140)
	].join('\n');
	return Buffer.byteLength(payload, 'utf8') <= MAX_BYTES ? payload : null;
}

/** The code's modules, row by row, so a PDF can draw them as vectors. */
export function giroCodeModules(payload: string): { size: number; dark: boolean[] } {
	// Error correction M is what the standard prescribes. As a string, because
	// the typings know no option that belongs to one symbology.
	const [symbol] = bwipjs.raw('qrcode', payload, 'eclevel=M');
	if (!('pixs' in symbol)) throw new Error('bwip-js returned no matrix for a QR code');
	return { size: symbol.pixx, dark: symbol.pixs.map((module) => module === 1) };
}
