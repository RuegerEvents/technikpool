import { prisma } from '#lib/server/auth.js';
import { CABLE_ENDS } from '#lib/server/services/cable-ends.js';
import { apiError, ApiResponse, type Schemas } from '#lib/server/api.js';
import {
	isSystemAdmin,
	productionVisibility,
	userOrgIds,
	visibleProductionName
} from '#lib/server/services/access.js';
import {
	toAsset,
	toAssetTransaction,
	toInspection,
	toProductDocument,
	toProduction
} from '#lib/server/services/api-mappers.js';
import { productDocuments } from '#lib/server/services/product-documents.js';
import { KIT_SELECT, kitOf } from '#lib/server/services/production-list.js';
import { bundleCaseOf } from '#lib/server/services/asset-lookup.js';
import { DEFAULT_INSPECTION_TYPE_ID } from '#lib/inspection-due.js';

// One unit as `GET /assets/by-tag/{tag}` and `GET /assets/{assetId}` both
// answer it, so a unit opened from a list and one scanned show the same.

const HISTORY_LIMIT = 20;
const INSPECTION_LIMIT = 10;

export async function assetDetail(
	userId: string,
	assetId: string
): Promise<Schemas['AssetDetail']> {
	const asset = await prisma.asset.findUnique({
		where: { id: assetId },
		include: {
			product: {
				include: { manufacturer: true, category: true, ...CABLE_ENDS }
			},
			location: { include: { address: true, organization: true } },
			organization: true,
			bundle: { select: KIT_SELECT },
			inspections: {
				orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }],
				take: INSPECTION_LIMIT
			},
			inspectionSchedules: { orderBy: { type: { sortOrder: 'asc' } } }
		}
	});
	if (!asset) {
		throw new ApiResponse(apiError(404, 'asset_not_found', `Asset "${assetId}" not found`));
	}
	const electrical = asset.inspectionSchedules.find((s) => s.typeId === DEFAULT_INSPECTION_TYPE_ID);

	const admin = await isSystemAdmin(userId);
	const orgIds = await userOrgIds(userId);
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
						id: true,
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
	const canSee = await productionVisibility(userId);
	const body: Schemas['AssetDetail'] = {
		...toAsset(asset),
		documents: (await productDocuments(asset.productId)).map(toProductDocument),
		kit: kitOf(asset.bundle),
		// A container in a bundle is its case: its tag means the whole kit.
		isBundleCase:
			asset.bundleId !== null && asset.product.isContainer
				? (await bundleCaseOf(asset.bundleId))?.id === asset.id
				: false,
		inspectionIntervalMonths: electrical?.intervalMonths ?? null,
		nextInspectionDue: asset.nextInspectionDue?.toISOString() ?? null,
		inspectionSchedules: asset.inspectionSchedules.map((s) => ({
			typeId: s.typeId,
			intervalMonths: s.intervalMonths,
			nextDue: s.nextDue.toISOString()
		})),
		inspections: asset.inspections.map(toInspection),
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
	return body;
}
