import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/auth';
import { requireProductionRead } from '$lib/server/services/access';
import { deliveryNoteData } from '$lib/server/services/delivery-note';
import { generateDeliveryNotePdf } from '$lib/server/delivery-note-pdf';

// Rendered fresh on every request: a delivery note has no number and is not
// archived, so it always shows what is booked right now.
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const production = await prisma.production.findUnique({
		where: { id: params.id },
		select: { id: true, organizationId: true, name: true }
	});
	if (!production) error(404, 'Production not found');
	// Anyone who may open the production may print what ships with it. Checked
	// before loading: gathering the note can regenerate preview images.
	await requireProductionRead(production);
	const bytes = await generateDeliveryNotePdf(await deliveryNoteData(params.id));
	const ascii = production.name.normalize('NFKD').replace(/[^\w.-]+/g, '-');
	const utf8 = encodeURIComponent(`Lieferschein-${production.name}.pdf`);
	return new Response(bytes as BodyInit, {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': `inline; filename="Lieferschein-${ascii}.pdf"; filename*=UTF-8''${utf8}`,
			'cache-control': 'private, no-store'
		}
	});
};
