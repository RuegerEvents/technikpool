import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/auth';
import { apiError, apiJson, handleApi, requireApiUser, type Schemas } from '$lib/server/api';
import { ApiResponse } from '$lib/server/api';
import {
	isSystemAdmin,
	productionVisibility,
	userOrgIds,
	visibleProductionName
} from '$lib/server/services/access';
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
					production: {
						select: {
							name: true,
							organizationId: true,
							organization: { select: { name: true, shortName: true } }
						}
					}
				},
				orderBy: { createdAt: 'desc' },
				take: HISTORY_LIMIT
			})
		]);

		// Someone else's production still holds the unit, so it is reported — under
		// its org's name, as openapi.yaml promises. Same rule as the web's history.
		const canSee = await productionVisibility(user.id);
		const body: Schemas['AssetDetail'] = {
			...toAsset(asset),
			currentProduction: openItem
				? toProduction({
						...openItem.production,
						name: visibleProductionName(openItem.production, canSee)
					})
				: null,
			history: history.map((tx) =>
				toAssetTransaction({
					...tx,
					production: tx.production && { name: visibleProductionName(tx.production, canSee) }
				})
			)
		};
		return apiJson('AssetDetail', body);
	});
