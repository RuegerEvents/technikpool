import { query, command } from '$app/server';
import * as v from 'valibot';
import { requireAuth } from '$lib/server/services/access';
import {
	getHandout,
	handoutSummary,
	packTodos,
	scanIntoHandout,
	setHandoutDone,
	setHandoutLineCount,
	type HandoutMode
} from '$lib/server/services/production-handout';
import type { AffectedRecords } from '$lib/server/services/checkout';
import { refreshAffected, withCheckoutErrors } from './checkout-shared';

// The web's door to handing a production's equipment out and taking it back
// against its list. The rules are in services/production-handout.ts, shared
// with /api/v1.

const mode = v.picklist(['checkout', 'checkin']);
/**
 * The side the list is seen from (`HandoutSide`); '' for the default. Always
 * a string, never left out, so the page and a command's refresh name the same
 * cache entry.
 */
const side = v.optional(v.string(), '');

export const getProductionHandout = query(
	v.object({ productionId: v.string(), mode, organizationId: v.string() }),
	async ({ productionId, mode, organizationId }) => {
		const user = await requireAuth();
		return await withCheckoutErrors(() =>
			getHandout(user.id, productionId, mode, organizationId || undefined)
		);
	}
);

export const getPackTodos = query(async () => {
	const user = await requireAuth();
	return await packTodos(user.id);
});

export const getHandoutSummary = query(v.string(), async (productionId) => {
	const user = await requireAuth();
	return await handoutSummary(user.id, productionId);
});

/** A tick in one list moves the other too: what went out is what comes back. */
async function refreshHandout(
	userId: string,
	productionId: string,
	organizationId: string,
	affected: AffectedRecords
) {
	await Promise.all([
		refreshAffected(userId, affected),
		...(['checkout', 'checkin'] as HandoutMode[]).map((m) =>
			getProductionHandout({ productionId, mode: m, organizationId }).refresh()
		)
	]);
}

export const scanProductionHandout = command(
	v.object({ productionId: v.string(), mode, organizationId: side, code: v.string() }),
	async ({ productionId, mode, organizationId, code }) => {
		const user = await requireAuth();
		const { result, affected } = await withCheckoutErrors(() =>
			scanIntoHandout(user.id, productionId, mode, code)
		);
		await refreshHandout(user.id, productionId, organizationId, affected);
		return result;
	}
);

export const setProductionHandoutDone = command(
	v.object({
		productionId: v.string(),
		mode,
		organizationId: side,
		assetIds: v.array(v.string()),
		done: v.boolean()
	}),
	async ({ productionId, mode, organizationId, assetIds, done }) => {
		const user = await requireAuth();
		const { result, affected } = await withCheckoutErrors(() =>
			setHandoutDone(user.id, productionId, mode, assetIds, done)
		);
		await refreshHandout(user.id, productionId, organizationId, affected);
		return result;
	}
);

export const setProductionHandoutLine = command(
	v.object({
		productionId: v.string(),
		mode,
		organizationId: side,
		key: v.string(),
		count: v.pipe(v.number(), v.integer(), v.minValue(0))
	}),
	async ({ productionId, mode, organizationId, key, count }) => {
		const user = await requireAuth();
		const { result, affected } = await withCheckoutErrors(() =>
			setHandoutLineCount(user.id, productionId, mode, key, count)
		);
		await refreshHandout(user.id, productionId, organizationId, affected);
		return result;
	}
);
