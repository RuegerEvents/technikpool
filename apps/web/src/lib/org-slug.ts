// An org's name as it appears in public URLs (/rental-terms/<slug>/<n>). Made
// once, when the org is created, from its short name where it has one (the
// name people call it by), and never changed, because those URLs are
// printed on offers and invoices. The migration that filled it in for older
// orgs (20261102130000_org_slug_rental_terms_number) follows the same rules.

const MAX = 40;

export function slugify(name: string): string {
	const full = name
		.toLowerCase()
		.replaceAll('ä', 'ae')
		.replaceAll('ö', 'oe')
		.replaceAll('ü', 'ue')
		.replaceAll('ß', 'ss')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	// At most MAX characters, cut after a whole word where there is one.
	const cut =
		full.length <= MAX
			? full
			: full.slice(0, MAX + 1).includes('-')
				? full.slice(0, MAX + 1).replace(/-[^-]*$/, '')
				: full.slice(0, MAX);
	return cut.replace(/^-+|-+$/g, '') || 'org';
}

/** What an org's slug is made from: its short name, else its name. */
export function slugSource(org: { name: string; shortName?: string | null }) {
	return org.shortName?.trim() || org.name;
}

/** `base`, else `base-2`, `base-3` … — the first that `taken` says is free. */
export async function uniqueSlug(name: string, taken: (slug: string) => Promise<boolean>) {
	const base = slugify(name);
	for (let n = 1; ; n++) {
		const slug = n === 1 ? base : `${base}-${n}`;
		if (!(await taken(slug))) return slug;
	}
}
