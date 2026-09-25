import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server/auth';
import { apiError, apiJson, handleApi, requireApiUser, type Schemas } from '$lib/server/api';
import {
	API_ASSET_INCLUDE,
	ASSET_TAG_ERROR_STATUS,
	AssetTagError,
	registerTaggedUnit
} from '$lib/server/services/asset-tags';
import { isSystemAdmin, productionVisibility, userOrgIds } from '$lib/server/services/access';
import { toAsset } from '$lib/server/services/api-mappers';
import { ApiResponse } from '$lib/server/api';
import type { Prisma } from '$lib/prisma/client';
import { ACTIVE_ASSET_WHERE } from '$lib/asset-status';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const ASSET_INCLUDE = API_ASSET_INCLUDE;

export const GET: RequestHandler = ({ locals, url }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const admin = await isSystemAdmin(user.id);
		const orgIds = await userOrgIds(user.id);

		const rawLimit = url.searchParams.get('limit');
		const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);
		if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
			throw new ApiResponse(
				apiError(400, 'invalid_limit', `limit must be an integer between 1 and ${MAX_LIMIT}.`)
			);
		}

		const locationId = url.searchParams.get('locationId');
		const productionId = url.searchParams.get('productionId');
		const categoryId = url.searchParams.get('categoryId');
		const productId = url.searchParams.get('productId');
		const q = url.searchParams.get('q')?.trim();
		const cursor = url.searchParams.get('cursor');

		// Filtering by production is a read *of* that production — the same read
		// the web gates with `requireProductionRead` before it will list a
		// production's kit. Without this the org scope below still holds, so only
		// the caller's own units come back, but a DEVICE_VIEWER could take the
		// production id out of an asset's `currentProduction` (masked by name,
		// not by id) and get the kit list for a production they may not open.
		//
		// Refused rather than quietly emptied, the way `scopedOrgIds` refuses a
		// filter for an org the caller doesn't belong to: a filter narrows a
		// result, it never silently answers a different question.
		if (productionId) {
			const production = await prisma.production.findUnique({
				where: { id: productionId },
				select: { id: true, organizationId: true }
			});
			if (!production) {
				throw new ApiResponse(
					apiError(404, 'production_not_found', `Production "${productionId}" not found`)
				);
			}
			const canSee = await productionVisibility(user.id);
			if (!canSee(production)) {
				throw new ApiResponse(apiError(403, 'forbidden', 'No access to this production'));
			}
		}

		const where: Prisma.AssetWhereInput = {
			...(admin ? {} : { organizationId: { in: orgIds } }),
			// Sold and decommissioned units are out of the pool — see openapi.yaml.
			...ACTIVE_ASSET_WHERE,
			...(locationId ? { locationId } : {}),
			// "Booked to this production" means an item row that hasn't come back yet.
			...(productionId
				? {
						productionItems: {
							some: { productionId, status: { in: ['PENDING', 'APPROVED', 'CHECKED_OUT'] } }
						}
					}
				: {}),
			...(categoryId ? { product: { categoryId } } : {}),
			...(productId ? { productId } : {}),
			...(q
				? {
						OR: [
							{ assetTag: { contains: q, mode: 'insensitive' } },
							{ serialNumber: { contains: q, mode: 'insensitive' } },
							{ product: { name: { contains: q, mode: 'insensitive' } } },
							{ product: { manufacturer: { name: { contains: q, mode: 'insensitive' } } } }
						]
					}
				: {})
		};

		// Fetch one extra row to learn whether another page exists without a
		// second count query.
		const rows = await prisma.asset.findMany({
			where,
			include: ASSET_INCLUDE,
			orderBy: { id: 'asc' },
			take: limit + 1,
			...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
		});

		const items = rows.slice(0, limit);
		const body: Schemas['AssetPage'] = {
			items: items.map(toAsset),
			nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null
		};
		return apiJson('AssetPage', body);
	});

export const POST: RequestHandler = ({ locals, request }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);
		const body = (await request.json().catch(() => null)) as Partial<
			Schemas['AssetCreateRequest']
		> | null;
		const field = (key: keyof Schemas['AssetCreateRequest']) =>
			typeof body?.[key] === 'string' ? body[key].trim() : '';
		const input = {
			productId: field('productId'),
			organizationId: field('organizationId'),
			locationId: field('locationId'),
			assetTag: field('assetTag')
		};
		if (Object.values(input).some((v) => !v)) {
			throw new ApiResponse(
				apiError(
					400,
					'invalid_request',
					'productId, organizationId, locationId and assetTag are required.'
				)
			);
		}
		try {
			const asset = await registerTaggedUnit(user.id, input);
			return json(toAsset(asset) satisfies Schemas['Asset'], { status: 201 });
		} catch (err) {
			if (err instanceof AssetTagError) {
				return apiError(ASSET_TAG_ERROR_STATUS[err.code], err.code, err.message);
			}
			throw err;
		}
	});
