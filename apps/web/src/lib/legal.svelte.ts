// The operator's legal pages: imprint, privacy policy, terms of use. Each is
// either a link to the operator's own site or text kept here and rendered at
// /legal/<slug>, set on /admin/legal; one with neither is linked nowhere.
// `.svelte.ts` so wuchale extracts the titles.

export const LEGAL_SLUGS = ['imprint', 'privacy', 'terms', 'dpa'] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

// What the footer, the user menu and /api/v1/legal list. The data processing
// agreement is between the operator and each organization, not every reader, so
// it is offered to organization owners instead (DpaGate, the proof page).
export const PUBLIC_LEGAL_SLUGS = ['imprint', 'privacy', 'terms'] as const;
export type PublicLegalSlug = (typeof PUBLIC_LEGAL_SLUGS)[number];

export type LegalLink = {
	slug: PublicLegalSlug;
	href: string;
	external: boolean;
};

export function legalTitle(slug: LegalSlug): string {
	switch (slug) {
		case 'imprint':
			return 'Imprint';
		case 'privacy':
			return 'Privacy policy';
		case 'terms':
			return 'Terms of use';
		case 'dpa':
			return 'Data processing agreement';
	}
}
