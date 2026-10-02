import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { renderEquipmentSheet } from '$lib/server/services/equipment-sheet';
import { pdfResponse } from '$lib/server/pdf-response';

// The plain URL, for a bookmark or a link. The production page asks
// `streamEquipmentSheet` instead, which reports progress while the pictures load.
export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const { bytes, filename } = await renderEquipmentSheet(
		'packing-list',
		params.id,
		url.searchParams.get('org')
	);
	return pdfResponse(bytes, filename);
};
