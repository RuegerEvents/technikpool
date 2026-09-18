// What a licence unit's credentials look like once opened. Shared by the server
// (which seals and opens them) and the page (which shows them), so the two
// cannot disagree about which fields a kind has.

export const LICENSE_CREDENTIAL_KINDS = ['key', 'login'] as const;

export type LicenseCredentialKind = (typeof LICENSE_CREDENTIAL_KINDS)[number];

/**
 * `key` is a serial or activation code; `login` is an account the software is
 * used through (a cloud seat, a vendor portal). `note` is for what neither
 * says — the email the key is registered to, how many activations are left —
 * and is sealed with the rest, because it is usually just as sensitive.
 */
export type LicenseCredentials =
	| { kind: 'key'; licenseKey: string; note: string | null }
	| { kind: 'login'; username: string; password: string | null; note: string | null };

/**
 * On what grounds a user may see a licence's credentials — also what the audit
 * entry records. `location`: they may write in the org that keeps the licence.
 * `production`: it is checked out to a production they crew or may write in.
 */
export type RevealGrant =
	| { via: 'admin' }
	| { via: 'location' }
	| { via: 'production'; productionId: string; productionName: string };

/**
 * Who has a licence right now: a production it is checked out to. For a
 * production the user may not open, `productionId` is null and the name is the
 * org's, the same masking every other list of bookings applies.
 */
export type LicenseHolder = {
	productionId: string | null;
	productionName: string;
	startDate: Date | null;
	endDate: Date | null;
	/** When it was checked out, and by whom — null where that isn't known or isn't ours to say. */
	since: Date | null;
	checkedOutBy: string | null;
};
