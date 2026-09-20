/**
 * The pairing code a scanner shows while it waits to be approved.
 *
 * Three places have to agree on it: `deviceAuthorization` in
 * `server/auth.ts` generates it, the scanner app displays it, and `/devices`
 * takes it back — so the length lives here rather than in each of them.
 * `formattedUserCode` in `apps/scanner/lib/api/auth_service.dart` groups it the
 * same way.
 */
export const USER_CODE_LENGTH = 8;

/**
 * What the server matches on: bare alphanumerics, upper case, never longer
 * than a code. Better-auth strips the same characters before looking a code up,
 * so a typed dash or space is no reason to refuse one.
 */
export function normalizeUserCode(input: string): string {
	return input
		.replace(/[^a-zA-Z0-9]/g, '')
		.toUpperCase()
		.slice(0, USER_CODE_LENGTH);
}

/** Grouped in fours, which is how the scanner displays it — ABCD-EFGH. */
export function formatUserCode(input: string): string {
	const bare = normalizeUserCode(input);
	return bare.length > 4 ? `${bare.slice(0, 4)}-${bare.slice(4)}` : bare;
}
