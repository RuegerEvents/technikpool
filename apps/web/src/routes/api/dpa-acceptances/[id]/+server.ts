import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/auth';
import { isSystemAdmin, orgRole } from '$lib/server/services/access';
import { dpaAcceptancePdf, dpaPdfFilename } from '$lib/server/services/legal';

// An acceptance of the data processing agreement as a PDF, for the two parties
// to it: the organization's owners and the operator (system admins). Once the
// organization is deleted only the operator can still reach it.
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const acceptance = await prisma.dpaAcceptance.findUnique({
		where: { id: params.id },
		select: { id: true, organizationId: true, orgName: true, acceptedAt: true }
	});
	if (!acceptance) error(404, 'Not found');

	const allowed =
		(await isSystemAdmin(locals.user.id)) ||
		(!!acceptance.organizationId &&
			(await orgRole(locals.user.id, acceptance.organizationId)) === 'OWNER');
	// Same answer as a missing one: whether an organization has signed is not
	// anyone else's business.
	if (!allowed) error(404, 'Not found');

	const bytes = await dpaAcceptancePdf(acceptance.id);
	return new Response(bytes as BodyInit, {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': `inline; filename="${dpaPdfFilename(acceptance.orgName, acceptance.acceptedAt)}"`,
			// Written once and never changed.
			'cache-control': 'private, immutable, max-age=31536000'
		}
	});
};
