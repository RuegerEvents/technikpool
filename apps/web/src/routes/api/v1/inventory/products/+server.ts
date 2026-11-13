import type { RequestHandler } from './$types';
import { prisma } from '#lib/server/auth.js';
import { apiError, ApiResponse, handleApi, requireApiUser, type Schemas } from '#lib/server/api.js';
import { isSystemAdmin, userOrgIds } from '#lib/server/services/access.js';
import { CABLE_ENDS } from '#lib/server/services/cable-ends.js';
import { toProduct } from '#lib/server/services/api-mappers.js';
import { ACTIVE_ASSET_WHERE } from '#lib/asset-status.js';
import { searchMatcher } from '#lib/search.js';
import { naturalCompare } from '#lib/sort.js';
import { orgLabel } from '#lib/utils.js';

// What the caller's orgs hold, a row per product and org, counted here rather
// than on a handheld walking every unit page by page. Same search as every
// search box; `looseOnly` leaves kit members to the kits' own rows.

export const GET: RequestHandler = ({ locals, url }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const memberOf = await userOrgIds(user.id);
		const organizationId = url.searchParams.get('organizationId');
		if (organizationId && !memberOf.includes(organizationId) && !(await isSystemAdmin(user.id))) {
			throw new ApiResponse(apiError(403, 'forbidden', 'Not a member of this organization'));
		}
		const orgIds = organizationId ? [organizationId] : memberOf;
		const locationId = url.searchParams.get('locationId');
		const categoryId = url.searchParams.get('categoryId');
		const looseOnly = url.searchParams.get('looseOnly') === 'true';

		const units = await prisma.asset.findMany({
			where: {
				organizationId: { in: orgIds },
				...ACTIVE_ASSET_WHERE,
				...(locationId ? { locationId } : {}),
				...(categoryId ? { product: { categoryId } } : {}),
				...(looseOnly ? { bundleId: null } : {})
			},
			select: { productId: true, organizationId: true, status: true, assetTag: true }
		});

		type Row = {
			productId: string;
			organizationId: string;
			count: number;
			available: number;
			untagged: number;
		};
		const rows = new Map<string, Row>();
		for (const unit of units) {
			const key = `${unit.productId}|${unit.organizationId}`;
			const row = rows.get(key) ?? {
				productId: unit.productId,
				organizationId: unit.organizationId,
				count: 0,
				available: 0,
				untagged: 0
			};
			row.count += 1;
			if (unit.status === 'AVAILABLE') row.available += 1;
			if (!unit.assetTag) row.untagged += 1;
			rows.set(key, row);
		}

		const [products, orgs] = await Promise.all([
			prisma.product.findMany({
				where: { id: { in: [...new Set([...rows.values()].map((r) => r.productId))] } },
				include: { manufacturer: true, category: true, ...CABLE_ENDS }
			}),
			prisma.organization.findMany({
				where: { id: { in: orgIds } },
				select: { id: true, name: true, shortName: true }
			})
		]);
		const productById = new Map(products.map((p) => [p.id, p]));
		const orgById = new Map(orgs.map((o) => [o.id, o]));
		const matchSearch = searchMatcher(url.searchParams.get('q') ?? '');

		const body: Schemas['InventoryProduct'][] = [...rows.values()]
			.flatMap((row) => {
				const product = productById.get(row.productId);
				const org = orgById.get(row.organizationId);
				if (!product || !org) return [];
				const shown = toProduct(product);
				if (
					!matchSearch(
						product.name,
						product.caption,
						product.manufacturer?.name,
						product.cableType,
						product.connectorARef?.name,
						product.connectorBRef?.name
					)
				)
					return [];
				return [
					{
						product: shown,
						organizationId: org.id,
						organizationName: orgLabel(org),
						count: row.count,
						available: row.available,
						untagged: row.untagged
					}
				];
			})
			.sort(
				(a, b) =>
					naturalCompare(a.product.name, b.product.name) ||
					naturalCompare(a.organizationName, b.organizationName)
			);
		return Response.json(body);
	});
