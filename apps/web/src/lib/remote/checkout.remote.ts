import { query, command } from '$app/server';
import * as v from 'valibot';
import { prisma } from '#lib/server/auth.js';
import { requireAuth } from '#lib/server/services/access.js';
import {
	performBulkCheckout,
	performScan,
	productionTargets
} from '#lib/server/services/checkout.js';
import { refreshAffected, withCheckoutErrors } from './checkout-shared';

export const getAllProductions = query(async () => {
	const user = await requireAuth();
	return await productionTargets(user.id);
});

const scanAssetSchema = v.object({
	assetTag: v.string(),
	targetType: v.picklist(['location', 'production']),
	targetId: v.string()
});

export const scanAsset = command(scanAssetSchema, async (input) => {
	const user = await requireAuth();
	const { result, affected } = await withCheckoutErrors(() => performScan(user.id, input));
	await refreshAffected(user.id, affected);
	// The Scan page shows product pictures. Added here rather than in
	// performScan, whose result is also /api/v1's ScanResult as it stands.
	const ids = [result.asset.id, ...(result.group?.units.map((u) => u.id) ?? [])];
	const images = new Map(
		(
			await prisma.asset.findMany({
				where: { id: { in: ids } },
				select: { id: true, product: { select: { imagePath: true } } }
			})
		).map((a) => [a.id, a.product.imagePath])
	);
	const imageOf = (id: string) => images.get(id) ?? null;
	return {
		...result,
		asset: { ...result.asset, imagePath: imageOf(result.asset.id) },
		group: result.group && {
			...result.group,
			units: result.group.units.map((u) => ({ ...u, imagePath: imageOf(u.id) }))
		}
	};
});

const checkoutAssetsSchema = v.object({
	assetIds: v.array(v.string()),
	targetType: v.picklist(['location', 'production']),
	targetId: v.string()
});

export const checkoutAssets = command(checkoutAssetsSchema, async (input) => {
	const user = await requireAuth();
	const { result, affected } = await withCheckoutErrors(() => performBulkCheckout(user.id, input));
	await refreshAffected(user.id, affected);
	return result;
});
