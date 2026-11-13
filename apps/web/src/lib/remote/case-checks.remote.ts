import { query, command } from '$app/server';
import * as v from 'valibot';
import { requireAuth } from '#lib/server/services/access.js';
import { appError, type AppErrorCode } from '#lib/errors.js';
import {
	CASE_CHECK_ERROR_STATUS,
	CaseCheckError,
	findCase,
	getCaseCheck as load,
	recordCaseCheck as record,
	scanIntoCase
} from '#lib/server/services/case-check.js';
import { getAssetHistory } from './assets.remote';

// The web's door to case checks. The rules are in services/case-check.ts,
// shared with /api/v1; this file turns its errors into the app's codes.

const ERROR_CODES: Record<CaseCheckError['code'], AppErrorCode> = {
	asset_not_found: 'asset_not_found',
	serial_ambiguous: 'asset_serial_ambiguous',
	not_a_case: 'case_not_a_case',
	forbidden: 'unauthorized'
};

async function withCaseErrors<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof CaseCheckError) {
			appError(CASE_CHECK_ERROR_STATUS[err.code], ERROR_CODES[err.code], [err.param ?? '']);
		}
		throw err;
	}
}

const caseRef = v.object({ kind: v.picklist(['bundle', 'asset']), id: v.string() });

export const getCaseCheck = query(caseRef, async (ref) => {
	const user = await requireAuth();
	return await withCaseErrors(() => load(user.id, ref));
});

/** The case a scanned code opens, and the unit the code was on, which counts as found. */
export const findCaseByCode = command(v.string(), async (code) => {
	const user = await requireAuth();
	return await withCaseErrors(() => findCase(user.id, code));
});

/**
 * A code scanned into a case that is not on the page's list: a unit that takes
 * the place of a missing one of the same product (they swap, and the case comes
 * back as it is now), or what it is, for "not part of this case".
 */
export const scanCaseCode = command(
	v.object({ ref: caseRef, code: v.string(), foundAssetIds: v.array(v.string()) }),
	async ({ ref, code, foundAssetIds }) => {
		const user = await requireAuth();
		const outcome = await withCaseErrors(() => scanIntoCase(user.id, ref, code, foundAssetIds));
		if (outcome.outcome === 'swapped') {
			getCaseCheck(ref).refresh();
			getAssetHistory(outcome.assetId).refresh();
			getAssetHistory(outcome.swap.partnerAssetId).refresh();
		}
		return outcome;
	}
);

export const recordCaseCheck = command(
	v.object({ ref: caseRef, foundAssetIds: v.array(v.string()) }),
	async ({ ref, foundAssetIds }) => {
		const user = await requireAuth();
		const result = await withCaseErrors(() => record(user.id, ref, foundAssetIds));
		getCaseCheck(ref).refresh();
		if (ref.kind === 'asset') getAssetHistory(ref.id).refresh();
		return result;
	}
);
