import { query, command } from '$app/server';
import * as v from 'valibot';
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
	return result;
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
