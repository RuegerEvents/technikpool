import { query, command } from '$app/server';
import * as v from 'valibot';
import { requireAuth } from '#lib/server/services/access.js';
import {
	getHandout,
	handOutCandidates,
	handoutSummary,
	packIntoCase,
	packTodos,
	returnTodos,
	scanIntoHandout,
	searchHandoutCandidates,
	setHandoutDone,
	setHandoutLineCount
} from '#lib/server/services/production-handout.js';
import type { AffectedRecords } from '#lib/server/services/checkout.js';
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
			getHandout(user.id, productionId, mode, organizationId || undefined, { extras: true })
		);
	}
);

export const getPackTodos = query(async () => {
	const user = await requireAuth();
	return await packTodos(user.id);
});

/** What is still out after the event — see `returnTodos`. */
export const getReturnTodos = query(async () => {
	const user = await requireAuth();
	return await returnTodos(user.id);
});

export const getHandoutSummary = query(v.string(), async (productionId) => {
	const user = await requireAuth();
	return await handoutSummary(user.id, productionId);
});

/**
 * A tick in one list moves the other too: what went out is what comes back.
 * Both lists are among the `EQUIPMENT_VIEWS` the page names, and refreshed for
 * the productions the service touched.
 */
async function refreshHandout(productionId: string, affected: AffectedRecords) {
	await refreshAffected({
		...affected,
		productionIds: [...new Set([...affected.productionIds, productionId])]
	});
}

export const scanProductionHandout = command(
	v.object({
		productionId: v.string(),
		mode,
		organizationId: side,
		code: v.string(),
		/** The case open for packing — see "Pack cases" in CLAUDE.md. */
		packInto: v.optional(v.nullable(v.string()))
	}),
	async ({ productionId, mode, code, packInto }) => {
		const user = await requireAuth();
		const { result, affected } = await withCheckoutErrors(() =>
			scanIntoHandout(user.id, productionId, mode, code, {
				packInto: mode === 'checkout' ? (packInto ?? null) : null
			})
		);
		await refreshHandout(productionId, affected);
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
	async ({ productionId, mode, assetIds, done }) => {
		const user = await requireAuth();
		const { result, affected } = await withCheckoutErrors(() =>
			setHandoutDone(user.id, productionId, mode, assetIds, done)
		);
		await refreshHandout(productionId, affected);
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
	async ({ productionId, mode, key, count }) => {
		const user = await requireAuth();
		const { result, affected } = await withCheckoutErrors(() =>
			setHandoutLineCount(user.id, productionId, mode, key, count, { extras: true })
		);
		await refreshHandout(productionId, affected);
		return result;
	}
);

/** Units into a pack case, or with `caseAssetId: null` out of theirs — see `packIntoCase`. */
export const packProductionCase = command(
	v.object({
		productionId: v.string(),
		organizationId: side,
		caseAssetId: v.nullable(v.string()),
		assetIds: v.optional(v.array(v.string())),
		line: v.optional(
			v.object({ key: v.string(), count: v.pipe(v.number(), v.integer(), v.minValue(0)) })
		)
	}),
	async ({ productionId, organizationId, caseAssetId, assetIds, line }) => {
		const user = await requireAuth();
		const { result, affected } = await withCheckoutErrors(() =>
			packIntoCase(
				user.id,
				productionId,
				caseAssetId,
				{ assetIds, line },
				organizationId || undefined
			)
		);
		await refreshHandout(productionId, affected);
		return result;
	}
);

/** Units not on the list, found by name — see `searchHandoutCandidates`. */
export const searchHandoutAdditions = query(
	v.object({ productionId: v.string(), organizationId: side, text: v.string() }),
	async ({ productionId, organizationId, text }) => {
		const user = await requireAuth();
		return await withCheckoutErrors(() =>
			searchHandoutCandidates(user.id, productionId, text, organizationId)
		);
	}
);

export const handOutAdditions = command(
	v.object({
		productionId: v.string(),
		organizationId: side,
		productId: v.string(),
		ownerId: v.string(),
		locationId: v.string(),
		count: v.pipe(v.number(), v.integer(), v.minValue(1))
	}),
	async ({ productionId, organizationId, productId, ownerId, locationId, count }) => {
		const user = await requireAuth();
		const { result, affected } = await withCheckoutErrors(() =>
			handOutCandidates(
				user.id,
				productionId,
				{ productId, organizationId: ownerId, locationId },
				count,
				organizationId
			)
		);
		await refreshHandout(productionId, affected);
		return result;
	}
);
