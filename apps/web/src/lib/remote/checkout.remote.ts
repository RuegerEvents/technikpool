import { query, command } from '$app/server';
import { prisma } from '$lib/server/auth';
import * as v from 'valibot';
import { getAsset, getAssets, getBundle, getBundles } from './assets.remote';
import { getProduction } from './productions.remote';
import { requireAuth, userOrgIds } from '$lib/server/services/access';
import {
	CheckoutError,
	performBulkCheckout,
	performScan,
	type AffectedRecords
} from '$lib/server/services/checkout';
import { appError, type AppErrorCode } from '$lib/errors';

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
		// The Devices list without an org filter reads the argument-less variant,
		// which is a cache entry of its own — refreshing only the per-org ones left
		// a bulk move looking undone until the page was reloaded.
		getAssets().refresh(),
		...affected.bundleIds.map((id) => getBundle(id).refresh()),
		// Only when a bundle actually moved — the org-wide bundle list is a
		// heavy query and most scans don't touch one.
		...(affected.bundleIds.length > 0
			? [...affected.organizationIds.map((id) => getBundles(id).refresh()), getBundles().refresh()]
			: []),
		...affected.productionIds.map((id) => getProduction(id).refresh())
	]);
}

/**
 * The service is framework-agnostic and reports what went wrong as its own code
 * (`/api/v1` maps the same codes onto HTTP statuses). Here they become the app's
 * error codes, so the browser gets a translated sentence rather than the bare
 * 500 a plain throw would turn into.
 */
const ERROR_CODES: Record<CheckoutError['code'], AppErrorCode> = {
	asset_not_found: 'asset_not_found',
	forbidden: 'unauthorized',
	wrong_organization: 'asset_wrong_organization',
	asset_retired: 'asset_retired_no_booking',
	asset_unavailable: 'asset_unavailable_no_booking'
};

const STATUS_BY_CODE: Record<CheckoutError['code'], number> = {
	asset_not_found: 404,
	forbidden: 403,
	wrong_organization: 403,
	asset_retired: 409,
	asset_unavailable: 409
};

async function withCheckoutErrors<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof CheckoutError) {
			appError(STATUS_BY_CODE[err.code], ERROR_CODES[err.code], [err.assetTag ?? '']);
		}
		throw err;
	}
}

const scanAssetSchema = v.object({
	assetTag: v.string(),
	targetType: v.picklist(['location', 'production']),
	targetId: v.string()
});

export const scanAsset = command(scanAssetSchema, async (input) => {
	const user = await requireAuth();
	const { result, affected } = await withCheckoutErrors(() => performScan(user.id, input));
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
	const { result, affected } = await withCheckoutErrors(() => performBulkCheckout(user.id, input));
	await refreshAffected(affected);
	return result;
});
