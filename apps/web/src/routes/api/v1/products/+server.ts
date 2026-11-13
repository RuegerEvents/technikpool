import type { RequestHandler } from './$types';
import { prisma } from '#lib/server/auth.js';
import {
	apiError,
	ApiResponse,
	apiJson,
	handleApi,
	requireApiUser,
	type Schemas
} from '#lib/server/api.js';
import { isSystemAdmin, managedOrgIds, userOrgIds } from '#lib/server/services/access.js';
import {
	inspectionNotRequiredWhere,
	inspectionRequiredWhere,
	listInspectionTypes,
	mainsConnectorsByProduct
} from '#lib/server/services/inspections.js';
import { DEFAULT_INSPECTION_TYPE_ID } from '#lib/inspection-due.js';
import {
	CATALOG_PRODUCT_INCLUDE,
	catalogUnitCounts,
	createProduct
} from '#lib/server/services/products.js';
import { findOrCreateManufacturer } from '#lib/server/services/manufacturers.js';
import { toCatalogProduct, toProduct } from '#lib/server/services/api-mappers.js';
import { jsonBody, requireString } from '#lib/server/stocktake-api.js';
import { appError } from '#lib/errors.js';
import { ACTIVE_ASSET_WHERE } from '#lib/asset-status.js';
import type { Prisma } from '#lib/prisma/client.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function booleanParam(url: URL, name: string): boolean | undefined {
	const raw = url.searchParams.get(name);
	if (raw === null) return undefined;
	if (raw === 'true') return true;
	if (raw === 'false') return false;
	throw new ApiResponse(apiError(400, 'invalid_request', `${name} must be true or false.`));
}

export const GET: RequestHandler = ({ locals, url }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const orgIds = (await isSystemAdmin(user.id)) ? null : await userOrgIds(user.id);

		const rawLimit = url.searchParams.get('limit');
		const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);
		if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
			throw new ApiResponse(
				apiError(400, 'invalid_limit', `limit must be an integer between 1 and ${MAX_LIMIT}.`)
			);
		}
		const q = url.searchParams.get('q')?.trim();
		const categoryId = url.searchParams.get('categoryId');
		const cursor = url.searchParams.get('cursor');
		const inspectionRequired = booleanParam(url, 'inspectionRequired');
		const inspectionTypeId = url.searchParams.get('inspectionTypeId') || DEFAULT_INSPECTION_TYPE_ID;
		const mains = booleanParam(url, 'mains');
		const tracked = booleanParam(url, 'tracked');
		const overdue = booleanParam(url, 'overdue');

		const now = new Date();
		// The unit filters see the caller's units only, like the counts.
		const unitScope: Prisma.AssetWhereInput = {
			...ACTIVE_ASSET_WHERE,
			...(orgIds ? { organizationId: { in: orgIds } } : {})
		};
		const mainsByProduct = await mainsConnectorsByProduct();
		const mainsIds = Object.keys(mainsByProduct);

		const and: Prisma.ProductWhereInput[] = [];
		if (categoryId) and.push({ categoryId });
		if (q) {
			and.push({
				OR: [
					{ name: { contains: q, mode: 'insensitive' } },
					{ caption: { contains: q, mode: 'insensitive' } },
					{ manufacturer: { name: { contains: q, mode: 'insensitive' } } }
				]
			});
		}
		if (inspectionRequired !== undefined) {
			and.push(
				inspectionRequired
					? inspectionRequiredWhere(inspectionTypeId)
					: inspectionNotRequiredWhere(inspectionTypeId)
			);
		}
		if (mains !== undefined) {
			and.push(mains ? { id: { in: mainsIds } } : { id: { notIn: mainsIds } });
		}
		if (tracked !== undefined) {
			const units = { ...unitScope, inspectionSchedules: { some: {} } };
			and.push(tracked ? { assets: { some: units } } : { assets: { none: units } });
		}
		if (overdue !== undefined) {
			const units = { ...unitScope, nextInspectionDue: { lte: now } };
			and.push(overdue ? { assets: { some: units } } : { assets: { none: units } });
		}

		const rows = await prisma.product.findMany({
			where: { AND: and },
			include: CATALOG_PRODUCT_INCLUDE,
			orderBy: [{ name: 'asc' }, { id: 'asc' }],
			take: limit + 1,
			...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
		});
		const items = rows.slice(0, limit);
		const [units, types] = await Promise.all([
			catalogUnitCounts(
				items.map((p) => p.id),
				orgIds,
				now
			),
			listInspectionTypes()
		]);
		const typeIds = types.map((t) => t.id);

		return apiJson('CatalogProductPage', {
			items: items.map((p) =>
				toCatalogProduct(p, {
					mainsConnectors: mainsByProduct[p.id] ?? [],
					units: units(p.id),
					typeIds
				})
			),
			nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null
		});
	});

// ProductCreateRequest in openapi.yaml. The same rules as a new product on the
// web's asset form (`createProduct`); the right to add one is ADMIN of the org
// the units are for, as `createAssets` asks for it there.
export const POST: RequestHandler = ({ locals, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const body = await jsonBody(request);
		const organizationId = requireString(body, 'organizationId').trim();
		const name = requireString(body, 'name').trim();
		const categoryId = requireString(body, 'categoryId').trim();
		const optional = (key: string) => {
			const value = body[key];
			if (value === undefined || value === null) return null;
			if (typeof value !== 'string') {
				throw new ApiResponse(apiError(400, 'invalid_request', `${key} must be a string.`));
			}
			return value.trim() || null;
		};
		const manufacturerName = optional('manufacturerName');
		const caption = optional('caption');

		if (
			!(await isSystemAdmin(user.id)) &&
			!(await managedOrgIds(user.id)).includes(organizationId)
		) {
			appError(403, 'asset_create_forbidden');
		}
		const manufacturerId = manufacturerName
			? (await findOrCreateManufacturer(user.id, manufacturerName)).manufacturer.id
			: null;
		const { product } = await createProduct(user.id, {
			name,
			manufacturerId,
			categoryId,
			caption
		});
		return Response.json(toProduct(product) satisfies Schemas['Product'], { status: 201 });
	});
