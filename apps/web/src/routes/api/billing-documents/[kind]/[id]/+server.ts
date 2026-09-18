import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/auth';
import { getObject } from '$lib/server/storage';
import { requireOrgInventory } from '$lib/server/services/access';
import { generateBillingPdf, organizationFromSnapshot } from '$lib/server/billing-pdf';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const document =
		params.kind === 'offers'
			? await prisma.offer.findUnique({
					where: { id: params.id },
					include: { items: { orderBy: { createdAt: 'asc' } } }
				})
			: params.kind === 'invoices'
				? await prisma.invoice.findUnique({
						where: { id: params.id },
						include: { items: { orderBy: { createdAt: 'asc' } } }
					})
				: null;
	if (!document) error(404, 'Document not found');
	// Same rung as the pages that link here — see `billingOrgIds` in offers.remote.ts.
	await requireOrgInventory(document.organizationId, 'billing_manage_forbidden');
	let bytes: Uint8Array;
	if (document.pdfPath) bytes = (await getObject(document.pdfPath)).bytes;
	else {
		try {
			// Draft previews render from the document's org snapshot too — the
			// preview must show exactly what finalizing would archive.
			bytes = await generateBillingPdf(
				params.kind === 'offers' ? 'offer' : 'invoice',
				{ ...document, organization: organizationFromSnapshot(document) },
				{ draft: true }
			);
		} catch (cause) {
			error(422, cause instanceof Error ? cause.message : 'PDF cannot be generated');
		}
	}
	const filename =
		params.kind === 'invoices'
			? `Rechnung-${document.number}.pdf`
			: `Angebot-${document.number}.pdf`;
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
