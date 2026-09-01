import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/auth';
import { getObject } from '$lib/server/storage';
import { isSystemAdmin, userOrgIds } from '$lib/server/services/access';
import { generateBillingPdf } from '$lib/server/billing-pdf';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const document =
		params.kind === 'offers'
			? await prisma.offer.findUnique({
					where: { id: params.id },
					include: {
						organization: { include: { address: true } },
						items: { orderBy: { createdAt: 'asc' } }
					}
				})
			: params.kind === 'invoices'
				? await prisma.invoice.findUnique({
						where: { id: params.id },
						include: {
							organization: { include: { address: true } },
							items: { orderBy: { createdAt: 'asc' } }
						}
					})
				: null;
	if (!document) error(404, 'Document not found');
	const allowed =
		(await isSystemAdmin(locals.user.id)) ||
		(await userOrgIds(locals.user.id)).includes(document.organizationId);
	if (!allowed) error(403, 'Unauthorized');
	let bytes: Uint8Array;
	if (document.pdfPath) bytes = (await getObject(document.pdfPath)).bytes;
	else {
		try {
			bytes = await generateBillingPdf(params.kind === 'offers' ? 'offer' : 'invoice', document, {
				draft: true
			});
		} catch (cause) {
			error(422, cause instanceof Error ? cause.message : 'PDF cannot be generated');
		}
	}
	const filename =
		params.kind === 'invoices' && 'number' in document
			? `Rechnung-${document.number}.pdf`
			: `Angebot-${params.id}.pdf`;
	return new Response(bytes as BodyInit, {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': `inline; filename="${filename}"`,
			'cache-control': document.pdfPath
				? 'private, immutable, max-age=31536000'
				: 'private, no-store'
		}
	});
};
