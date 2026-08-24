import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/auth';
import { apiError, apiJson, handleApi, requireApiUser, type Schemas } from '$lib/server/api';
import { ApiResponse } from '$lib/server/api';
import { isSystemAdmin, userOrgIds } from '$lib/server/services/access';
import { toAsset, toAssetTransaction, toProduction } from '$lib/server/services/api-mappers';

const HISTORY_LIMIT = 20;

export const GET: RequestHandler = ({ locals, params }) =>
	handleApi(async () => {
		const user = requireApiUser(locals);

		const asset = await prisma.asset.findFirst({
			where: { assetTag: params.tag },
			include: {
				product: { include: { manufacturer: true, category: true } },
				location: { include: { address: true, organization: true } },
				organization: true
			}
		});

		if (!asset) {
			throw new ApiResponse(apiError(404, 'asset_not_found', `Tag "${params.tag}" not found`));
		}

		const admin = await isSystemAdmin(user.id);
		const orgIds = await userOrgIds(user.id);
		if (!admin && !orgIds.includes(asset.organizationId)) {
			throw new ApiResponse(apiError(403, 'forbidden', 'No access to this asset'));
		}

		const [openItem, history] = await Promise.all([
			prisma.productionItem.findFirst({
				where: { assetId: asset.id, status: 'CHECKED_OUT' },
				include: { production: { include: { organization: true } } },
				orderBy: { id: 'desc' }
			}),
			prisma.assetTransaction.findMany({
				where: { assetId: asset.id },
				include: {
					user: { select: { name: true, email: true } },
					production: { select: { name: true } }
				},
				orderBy: { createdAt: 'desc' },
				take: HISTORY_LIMIT
			})
		]);

		const body: Schemas['AssetDetail'] = {
			...toAsset(asset),
			currentProduction: openItem ? toProduction(openItem.production) : null,
			history: history.map(toAssetTransaction)
		};
		return apiJson('AssetDetail', body);
	});
