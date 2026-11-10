import type { RequestHandler } from './$types';
import { prisma } from '#lib/server/auth.js';
import { apiError, ApiResponse, handleApi, requireApiUser, type Schemas } from '#lib/server/api.js';
import { isSystemAdmin } from '#lib/server/services/access.js';
import { appError } from '#lib/errors.js';
import { productLabel } from '#lib/product-label.js';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

// System admin only, like /admin/catalog-log: it spans every org's activity.
export const GET: RequestHandler = ({ locals, url }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		if (!(await isSystemAdmin(user.id))) appError(403, 'admin_required');

		const rawLimit = url.searchParams.get('limit');
		const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);
		if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
			throw new ApiResponse(
				apiError(400, 'invalid_limit', `limit must be an integer between 1 and ${MAX_LIMIT}.`)
			);
		}
		const productId = url.searchParams.get('productId');

		const entries = await prisma.catalogTransaction.findMany({
			where: productId ? { productId } : {},
			orderBy: { createdAt: 'desc' },
			take: limit,
			include: { user: { select: { name: true } } }
		});
		// The log's references are soft: name what still exists.
		const products = await prisma.product.findMany({
			where: {
				id: { in: [...new Set(entries.flatMap((e) => (e.productId ? [e.productId] : [])))] }
			},
			select: { id: true, name: true, manufacturer: { select: { name: true } } }
		});
		const names = new Map(products.map((p) => [p.id, productLabel(p)]));

		const body: Schemas['CatalogLogEntry'][] = entries.map((e) => ({
			id: e.id,
			action: e.action,
			createdAt: e.createdAt.toISOString(),
			userName: e.user?.name ?? null,
			productId: e.productId,
			productName: e.productId ? (names.get(e.productId) ?? null) : null,
			manufacturerId: e.manufacturerId,
			categoryId: e.categoryId,
			data: (e.data ?? null) as Schemas['CatalogLogEntry']['data']
		}));
		return Response.json(body);
	});
