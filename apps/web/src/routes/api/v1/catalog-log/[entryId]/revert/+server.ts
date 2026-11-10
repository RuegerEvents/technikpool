import type { RequestHandler } from './$types';
import { prisma } from '#lib/server/auth.js';
import { apiError, ApiResponse, apiJson, handleApi, requireApiUser } from '#lib/server/api.js';
import { revertCatalogChange } from '#lib/server/services/products.js';
import { catalogProductBody } from '#lib/server/api-catalog.js';

export const POST: RequestHandler = ({ locals, params }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const entry = await prisma.catalogTransaction.findUnique({
			where: { id: params.entryId },
			select: { id: true }
		});
		if (!entry) {
			throw new ApiResponse(
				apiError(404, 'catalog_entry_not_found', `Catalog log entry "${params.entryId}" not found`)
			);
		}
		const { productId, unitsChanged } = await revertCatalogChange(user.id, params.entryId);
		return apiJson('ProductUpdated', {
			product: await catalogProductBody(user.id, productId),
			unitsChanged: unitsChanged.length
		});
	});
