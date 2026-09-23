import { query, command } from '$app/server';
import * as v from 'valibot';
import { prisma } from '$lib/server/auth';
import { requireAuth, writableOrgIds, isSystemAdmin } from '$lib/server/services/access';
import { appError, type AppErrorCode } from '$lib/errors';
import { ACTIVE_ASSET_WHERE } from '$lib/asset-status';
import {
	STOCKTAKE_ACTIONS,
	STOCKTAKE_ERROR_STATUS,
	StocktakeError,
	actionCandidates,
	applyStocktakeAction as applyAction,
	cancelStocktake as cancel,
	closeStocktake as close,
	createRecount,
	createStocktake as create,
	getStocktake as loadStocktake,
	itemState,
	listStocktakes,
	previewStocktake as preview,
	productCounts,
	scanIntoStocktake,
	setStocktakeCount as setCount,
	setStocktakeItemNote,
	tickStocktakeItems,
	untickStocktakeItem
} from '$lib/server/services/stocktake';
import { getAsset, getAssets, getAssetHistory } from './assets.remote';

// The web's door to stocktakes. The rules are in services/stocktake.ts, shared
// with /api/v1; this file turns its errors into the app's codes and refreshes
// what a change makes stale.

const ERROR_CODES: Record<StocktakeError['code'], AppErrorCode> = {
	stocktake_not_found: 'stocktake_not_found',
	stocktake_closed: 'stocktake_closed',
	stocktake_not_closed: 'stocktake_not_closed',
	stocktake_empty: 'stocktake_empty',
	stocktake_action_applied: 'stocktake_action_applied',
	stocktake_not_your_tick: 'stocktake_not_your_tick',
	stocktake_not_found_yet: 'stocktake_not_found_yet',
	stocktake_product_not_counted: 'stocktake_product_not_counted',
	asset_not_found: 'asset_not_found',
	serial_ambiguous: 'asset_serial_ambiguous',
	forbidden: 'unauthorized',
	wrong_organization: 'asset_wrong_organization',
	invalid_request: 'stocktake_invalid_request'
};

async function withStocktakeErrors<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof StocktakeError) {
			appError(STOCKTAKE_ERROR_STATUS[err.code], ERROR_CODES[err.code], [err.param ?? '']);
		}
		throw err;
	}
}

export const getStocktakes = query(async () => {
	const user = await requireAuth();
	return await listStocktakes(user.id);
});

export const getStocktake = query(v.string(), async (id) => {
	const user = await requireAuth();
	return await withStocktakeErrors(async () => {
		const detail = await loadStocktake(user.id, id);
		const closed = detail.status === 'CLOSED';
		return {
			...detail,
			me: user.id,
			items: detail.items.map((i) => ({ ...i, state: itemState(i, closed) })),
			products: productCounts(detail, user.id),
			candidates: closed ? await actionCandidates(user.id, id) : null
		};
	});
});

/** What the start form offers: the orgs one may count in, with their locations. */
export const getStocktakeFormOptions = query(async () => {
	const user = await requireAuth();
	const orgIds = (await isSystemAdmin(user.id))
		? (await prisma.organization.findMany({ select: { id: true } })).map((o) => o.id)
		: await writableOrgIds(user.id);
	const [orgs, categories] = await Promise.all([
		prisma.organization.findMany({
			where: { id: { in: orgIds } },
			select: {
				id: true,
				name: true,
				shortName: true,
				locations: { select: { id: true, name: true }, orderBy: { name: 'asc' } }
			},
			orderBy: { name: 'asc' }
		}),
		prisma.category.findMany({
			select: { id: true, name: true, nameDe: true, color: true },
			orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
		})
	]);
	return { orgs, categories };
});

/** The products an org holds units of, for narrowing a stocktake to a few of them. */
export const getStocktakeProducts = query(v.string(), async (organizationId) => {
	const user = await requireAuth();
	if (
		!(await isSystemAdmin(user.id)) &&
		!(await writableOrgIds(user.id)).includes(organizationId)
	) {
		return [];
	}
	return await prisma.product.findMany({
		where: { assets: { some: { organizationId, ...ACTIVE_ASSET_WHERE } } },
		select: {
			id: true,
			name: true,
			categoryId: true,
			manufacturer: { select: { name: true } }
		},
		orderBy: { name: 'asc' }
	});
});

const scopeSchema = v.object({
	organizationId: v.string(),
	locationIds: v.array(v.string()),
	categoryIds: v.array(v.string()),
	productIds: v.array(v.string())
});

export const getStocktakePreview = query(scopeSchema, async ({ organizationId, ...scope }) => {
	const user = await requireAuth();
	return await withStocktakeErrors(() => preview(user.id, { organizationId, scope }));
});

export const createStocktake = command(
	v.object({ ...scopeSchema.entries, name: v.optional(v.string()) }),
	async ({ organizationId, name, ...scope }) => {
		const user = await requireAuth();
		const stocktake = await withStocktakeErrors(() =>
			create(user.id, { organizationId, name, scope })
		);
		await getStocktakes().refresh();
		return { id: stocktake.id };
	}
);

export const recountStocktake = command(v.string(), async (id) => {
	const user = await requireAuth();
	const stocktake = await withStocktakeErrors(() => createRecount(user.id, id));
	await Promise.all([getStocktakes().refresh(), getStocktake(id).refresh()]);
	return { id: stocktake.id };
});

async function refresh(id: string) {
	await Promise.all([getStocktake(id).refresh(), getStocktakes().refresh()]);
}

export const scanStocktakeCode = command(
	v.object({ stocktakeId: v.string(), code: v.string(), locationId: v.string() }),
	async ({ stocktakeId, code, locationId }) => {
		const user = await requireAuth();
		const result = await withStocktakeErrors(() =>
			scanIntoStocktake(user.id, stocktakeId, { code, locationId })
		);
		await refresh(stocktakeId);
		return result;
	}
);

export const tickStocktake = command(
	v.object({
		stocktakeId: v.string(),
		assetIds: v.array(v.string()),
		locationId: v.string(),
		via: v.picklist(['manual', 'parent', 'bundle'])
	}),
	async ({ stocktakeId, ...input }) => {
		const user = await requireAuth();
		const result = await withStocktakeErrors(() => tickStocktakeItems(user.id, stocktakeId, input));
		await refresh(stocktakeId);
		return result;
	}
);

export const untickStocktake = command(
	v.object({ stocktakeId: v.string(), assetId: v.string() }),
	async ({ stocktakeId, assetId }) => {
		const user = await requireAuth();
		await withStocktakeErrors(() => untickStocktakeItem(user.id, stocktakeId, assetId));
		await refresh(stocktakeId);
	}
);

export const setStocktakeNote = command(
	v.object({
		stocktakeId: v.string(),
		assetId: v.string(),
		note: v.nullable(v.string()),
		needsAttention: v.boolean()
	}),
	async ({ stocktakeId, ...input }) => {
		const user = await requireAuth();
		await withStocktakeErrors(() => setStocktakeItemNote(user.id, stocktakeId, input));
		await getStocktake(stocktakeId).refresh();
	}
);

export const setStocktakeCount = command(
	v.object({
		stocktakeId: v.string(),
		productId: v.string(),
		locationId: v.string(),
		count: v.pipe(v.number(), v.integer(), v.minValue(0))
	}),
	async ({ stocktakeId, ...input }) => {
		const user = await requireAuth();
		await withStocktakeErrors(() => setCount(user.id, stocktakeId, input));
		await refresh(stocktakeId);
	}
);

export const closeStocktake = command(v.string(), async (id) => {
	const user = await requireAuth();
	await withStocktakeErrors(() => close(user.id, id));
	await refresh(id);
});

export const cancelStocktake = command(v.string(), async (id) => {
	const user = await requireAuth();
	await withStocktakeErrors(() => cancel(user.id, id));
	await getStocktakes().refresh();
});

export const applyStocktakeAction = command(
	v.object({ stocktakeId: v.string(), action: v.picklist(STOCKTAKE_ACTIONS) }),
	async ({ stocktakeId, action }) => {
		const user = await requireAuth();
		const result = await withStocktakeErrors(() => applyAction(user.id, stocktakeId, action));
		await Promise.all([
			getStocktake(stocktakeId).refresh(),
			...result.assetIds.flatMap((id) => [getAsset(id).refresh(), getAssetHistory(id).refresh()]),
			getAssets(result.organizationId).refresh(),
			getAssets().refresh()
		]);
		return { changed: result.changed };
	}
);
