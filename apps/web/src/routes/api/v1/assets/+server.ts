import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/auth';
import { apiError, apiJson, handleApi, requireApiUser, type Schemas } from '$lib/server/api';
import { isSystemAdmin, userOrgIds } from '$lib/server/services/access';
import { toAsset } from '$lib/server/services/api-mappers';
import { ApiResponse } from '$lib/server/api';
import type { Prisma } from '$lib/prisma/client';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const ASSET_INCLUDE = {
	product: { include: { manufacturer: true, category: true } },
	location: { include: { address: true, organization: true } },
	organization: true
} satisfies Prisma.AssetInclude;

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
		const q = url.searchParams.get('q')?.trim();
		const cursor = url.searchParams.get('cursor');

		const where: Prisma.AssetWhereInput = {
			...(admin ? {} : { organizationId: { in: orgIds } }),
			...(locationId ? { locationId } : {}),
			// "Booked to this production" means an item row that hasn't come back yet.
			...(productionId
				? {
						productionItems: {
							some: { productionId, status: { in: ['PENDING', 'APPROVED', 'CHECKED_OUT'] } }
						}
					}
				: {}),
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
