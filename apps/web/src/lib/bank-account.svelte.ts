import { messageForErrorCode } from './error-messages.svelte';

// An IBAN carries its own check digits, so a typo is caught where it is typed
// rather than by the customer's bank. One rule for the org form, `updateOrg`
// behind it, and the document check that stops an invoice from printing one.

const compact = (value: string) => value.replace(/\s+/g, '').toUpperCase();

export function isValidIban(value: string): boolean {
	const iban = compact(value);
	if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
	// ISO 13616: country and check digits to the end, letters as 10–35, mod 97.
	let remainder = 0;
	for (const char of iban.slice(4) + iban.slice(0, 4)) {
		for (const digit of String(parseInt(char, 36)))
			remainder = (remainder * 10 + Number(digit)) % 97;
	}
	return remainder === 1;
}

export function isValidBic(value: string): boolean {
	return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(compact(value));
}

/** The message to show, or null. An empty field is not this check's business. */
export function bankAccountProblem(account: { iban: string; bic: string }): string | null {
	if (account.iban.trim() && !isValidIban(account.iban))
		return messageForErrorCode('org_iban_invalid');
	if (account.bic.trim() && !isValidBic(account.bic)) return messageForErrorCode('org_bic_invalid');
	return null;
}
