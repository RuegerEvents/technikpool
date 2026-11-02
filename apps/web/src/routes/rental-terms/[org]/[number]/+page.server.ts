import { error } from '@sveltejs/kit';
import { prisma } from '#lib/server/auth.js';
import { renderMarkdown } from '#lib/server/markdown.js';
import { rentalTermsDate } from '#lib/server/services/rental-terms.js';
import type { PageServerLoad } from './$types';

// One version of an org's rental terms, signed out: the link printed on its
// offers, invoices and delivery notes, /rental-terms/<org slug>/<number>. A
// version never changes, so the link on an old invoice still shows what
// applied then; if the org has saved newer terms since, the page says so and
// links them.
export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const number = Number(params.number);
	if (!Number.isInteger(number) || number < 1) error(404, 'Not found');
	const version = await prisma.rentalTermsVersion.findFirst({
		where: { number, organization: { slug: params.org } },
		select: {
			id: true,
			number: true,
			body: true,
			createdAt: true,
			organization: {
				select: {
					name: true,
					slug: true,
					logoPath: true,
					rentalTermsVersion: { select: { id: true, number: true } }
				}
			}
		}
	});
	if (!version) error(404, 'Not found');
	setHeaders({ 'cache-control': 'public, max-age=300' });
	const current = version.organization.rentalTermsVersion;
	return {
		orgName: version.organization.name,
		orgSlug: version.organization.slug,
		logoPath: version.organization.logoPath,
		number: version.number,
		date: rentalTermsDate(version),
		html: renderMarkdown(version.body),
		newerNumber: current && current.id !== version.id ? current.number : null
	};
};
