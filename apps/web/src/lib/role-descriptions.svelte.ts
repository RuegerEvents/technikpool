import type { OrgRole } from './roles';

/**
 * What each role may do, in the words someone granting it needs.
 *
 * Separate from `roles.ts` for the same reason `error-messages.svelte.ts` is
 * separate from `errors.ts`: the rung is the contract and the wording is not.
 * Living in a `.svelte.ts` module is what gets these into the catalogs — a
 * server module's strings are never extracted, so this text could not be
 * translated anywhere else.
 */
export function roleName(role: OrgRole): string {
	switch (role) {
		case 'VIEWER':
			return 'Viewer';
		case 'MEMBER':
			return 'Member';
		case 'ADMIN':
			return 'Admin';
		case 'OWNER':
			return 'Owner';
	}
}

/** One line, phrased as what the person can do — not as what the rank is called. */
export function roleSummary(role: OrgRole): string {
	switch (role) {
		case 'VIEWER':
			return 'Can see everything, but change nothing.';
		case 'MEMBER':
			return 'Can scan, check equipment out and back in, and plan productions.';
		case 'ADMIN':
			return 'Everything a member can, plus the inventory itself: register and retire units, prices, inspections, loan requests, offers and invoices.';
		case 'OWNER':
			return 'Everything an admin can, plus the organization: members, their roles, settings and category rates.';
	}
}
