import { query, command } from '$app/server';
import { prisma } from '$lib/server/auth';
import * as v from 'valibot';
import { getAsset, getAssets, getBundle, getBundles } from './assets.remote';
import { getProduction } from './productions.remote';
import { requireAuth, userOrgIds } from '$lib/server/services/access';
import {
	performBulkCheckout,
	performScan,
	type AffectedRecords
} from '$lib/server/services/checkout';

export const getAllProductions = query(async () => {
	const user = await requireAuth();
	const orgIds = await userOrgIds(user.id);
	return await prisma.production.findMany({
		where: { organizationId: { in: orgIds } },
		include: { organization: { select: { name: true, shortName: true } } },
		orderBy: [{ startDate: 'desc' }, { name: 'asc' }]
	});
});

/**
 * Invalidate the queries backing whatever the service just changed. The service
 * itself is framework-agnostic and only reports which records it touched.
 */
async function refreshAffected(affected: AffectedRecords) {
	await Promise.all([
		...affected.assetIds.map((id) => getAsset(id).refresh()),
		...affected.organizationIds.map((id) => getAssets(id).refresh()),
		...affected.bundleIds.map((id) => getBundle(id).refresh()),
		// Only when a bundle actually moved — the org-wide bundle list is a
		// heavy query and most scans don't touch one.
		...(affected.bundleIds.length > 0
			? affected.organizationIds.map((id) => getBundles(id).refresh())
			: []),
		...affected.productionIds.map((id) => getProduction(id).refresh())
	]);
}

const scanAssetSchema = v.object({
	assetTag: v.string(),
	targetType: v.picklist(['location', 'production']),
	targetId: v.string()
});

export const scanAsset = command(scanAssetSchema, async (input) => {
	const user = await requireAuth();
	const { result, affected } = await performScan(user.id, input);
	await refreshAffected(affected);
	return result;
});

const checkoutAssetsSchema = v.object({
	assetIds: v.array(v.string()),
	targetType: v.picklist(['location', 'production']),
	targetId: v.string()
});

export const checkoutAssets = command(checkoutAssetsSchema, async (input) => {
	const user = await requireAuth();
	const { result, affected } = await performBulkCheckout(user.id, input);
	await refreshAffected(affected);
	return result;
});
