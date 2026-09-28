import { query, command } from '$app/server';
import * as v from 'valibot';
import { requireAuth } from '$lib/server/services/access';
import { appError, type AppErrorCode } from '$lib/errors';
import {
	PRODUCTION_CHECK_ERROR_STATUS,
	ProductionCheckError,
	closeProductionCheck,
	confirmReceipt,
	getProductionCheck as loadCheck,
	handoverTodos,
	listProductionChecks,
	openProductionCheck,
	reportReturn,
	scanIntoCheck,
	tickCheckItems,
	untickCheckItem
} from '$lib/server/services/production-check';
import { getProduction } from './productions.remote';
import { getAssetHistory } from './assets.remote';

// The web's door to production checks and the borrower's handover steps. The
// rules are in services/production-check.ts, shared with /api/v1; this file
// turns its errors into the app's codes and refreshes what a change makes stale.

const ERROR_CODES: Record<ProductionCheckError['code'], AppErrorCode> = {
	not_found: 'check_not_found',
	forbidden: 'unauthorized',
	asset_not_found: 'asset_not_found',
	serial_ambiguous: 'asset_serial_ambiguous',
	check_closed: 'check_closed',
	tick_not_yours: 'check_not_your_tick',
	production_cancelled: 'production_cancelled',
	receipt_forbidden: 'check_receipt_forbidden'
};

async function withCheckErrors<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof ProductionCheckError) {
			appError(PRODUCTION_CHECK_ERROR_STATUS[err.code], ERROR_CODES[err.code], [err.param ?? '']);
		}
		throw err;
	}
}

export const getProductionChecks = query(v.string(), async (productionId) => {
	const user = await requireAuth();
	return await withCheckErrors(() => listProductionChecks(user.id, productionId));
});

export const getProductionCheck = query(v.string(), async (checkId) => {
	const user = await requireAuth();
	return await withCheckErrors(() => loadCheck(user.id, checkId));
});

export const getHandoverTodos = query(async () => {
	const user = await requireAuth();
	return await handoverTodos(user.id);
});

export const startProductionCheck = command(
	v.object({ productionId: v.string(), organizationId: v.optional(v.string()) }),
	async ({ productionId, organizationId }) => {
		const user = await requireAuth();
		const check = await withCheckErrors(() =>
			openProductionCheck(user.id, productionId, organizationId)
		);
		await getProductionChecks(productionId).refresh();
		return check;
	}
);

export const scanProductionCheck = command(
	v.object({ checkId: v.string(), code: v.string() }),
	async ({ checkId, code }) => {
		const user = await requireAuth();
		const result = await withCheckErrors(() => scanIntoCheck(user.id, checkId, code));
		await getProductionCheck(checkId).refresh();
		return result;
	}
);

export const tickProductionCheck = command(
	v.object({ checkId: v.string(), assetIds: v.array(v.string()) }),
	async ({ checkId, assetIds }) => {
		const user = await requireAuth();
		const result = await withCheckErrors(() => tickCheckItems(user.id, checkId, assetIds));
		await getProductionCheck(checkId).refresh();
		return result;
	}
);

export const untickProductionCheck = command(
	v.object({ checkId: v.string(), assetId: v.string() }),
	async ({ checkId, assetId }) => {
		const user = await requireAuth();
		await withCheckErrors(() => untickCheckItem(user.id, checkId, assetId));
		await getProductionCheck(checkId).refresh();
	}
);

export const closeCheck = command(
	v.object({ checkId: v.string(), productionId: v.string() }),
	async ({ checkId, productionId }) => {
		const user = await requireAuth();
		const result = await withCheckErrors(() => closeProductionCheck(user.id, checkId));
		await Promise.all([
			getProductionCheck(checkId).refresh(),
			getProductionChecks(productionId).refresh()
		]);
		return result;
	}
);

async function refreshHandover(
	checkId: string,
	result: { productionId: string; assetIds: string[] }
) {
	await Promise.all([
		getProductionCheck(checkId).refresh(),
		getProduction(result.productionId).refresh(),
		getHandoverTodos().refresh(),
		...result.assetIds.map((id) => getAssetHistory(id).refresh())
	]);
}

export const confirmCheckReceipt = command(v.string(), async (checkId) => {
	const user = await requireAuth();
	const result = await withCheckErrors(() => confirmReceipt(user.id, checkId));
	await refreshHandover(checkId, result);
	return { count: result.count };
});

export const reportCheckReturn = command(v.string(), async (checkId) => {
	const user = await requireAuth();
	const result = await withCheckErrors(() => reportReturn(user.id, checkId));
	await refreshHandover(checkId, result);
	return { count: result.count };
});
