import { query, command } from '$app/server';
import { prisma } from '#lib/server/auth.js';
import * as v from 'valibot';
import {
	isSystemAdmin,
	requireAuth,
	requireOrgInventory,
	userOrgIds
} from '#lib/server/services/access.js';
import { ACTIVE_ASSET_WHERE } from '#lib/asset-status.js';
import { appError } from '#lib/errors.js';
import { INSPECTION_RESULTS } from '#lib/inspection-due.js';
import {
	deleteInspection as deleteInspectionRecord,
	parseInspectionDate,
	recordInspections,
	refreshInspectionDue
} from '#lib/server/services/inspections.js';
import { getAsset, getAssetHistory, getAssets } from '#lib/remote/assets.remote.js';
import { getDashboardStats } from '#lib/remote/productions.remote.js';

const UPCOMING_WINDOW_DAYS = 30;

export const getOverdueAssets = query(async () => {
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);
	const orgIds = systemAdmin ? undefined : await userOrgIds(user.id);

	const now = new Date();
	const upcomingCutoff = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 86_400_000);

	const assets = await prisma.asset.findMany({
		where: {
			...(orgIds ? { organizationId: { in: orgIds } } : {}),
			...ACTIVE_ASSET_WHERE,
			nextInspectionDue: { not: null, lte: upcomingCutoff }
		},
		include: {
			product: { include: { manufacturer: true } },
			organization: {
				select: { id: true, name: true, shortName: true, color: true, avatarLabel: true }
			},
			location: { select: { name: true } },
			// The latest one, to tell "never inspected" and "failed" from "due again".
			inspections: {
				select: { performedAt: true, result: true },
				orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }],
				take: 1
			}
		},
		orderBy: { nextInspectionDue: 'asc' }
	});

	return {
		overdue: assets.filter((a) => a.nextInspectionDue! < now),
		upcoming: assets.filter((a) => a.nextInspectionDue! >= now)
	};
});

export const getOverdueInspectionCount = query(async () => {
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);
	const orgIds = systemAdmin ? undefined : await userOrgIds(user.id);

	return prisma.asset.count({
		where: {
			...(orgIds ? { organizationId: { in: orgIds } } : {}),
			...ACTIVE_ASSET_WHERE,
			nextInspectionDue: { not: null, lt: new Date() }
		}
	});
});

export const getAssetInspections = query(v.string(), async (assetId: string) => {
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);
	if (!systemAdmin) {
		const asset = await prisma.asset.findUniqueOrThrow({
			where: { id: assetId },
			select: { organizationId: true }
		});
		const orgIds = await userOrgIds(user.id);
		if (!orgIds.includes(asset.organizationId)) appError(403, 'unauthorized');
	}

	return prisma.inspection.findMany({
		where: { assetId },
		orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }]
	});
});

/** What shows a unit's inspection state, after any change to it. */
async function refreshInspectionViews(assetIds: string[], statusChanged: string[]) {
	const orgIds = statusChanged.length
		? (
				await prisma.asset.findMany({
					where: { id: { in: statusChanged } },
					select: { organizationId: true },
					distinct: ['organizationId']
				})
			).map((a) => a.organizationId)
		: [];
	await Promise.all([
		...assetIds.flatMap((id) => [
			getAsset(id).refresh(),
			getAssetHistory(id).refresh(),
			getAssetInspections(id).refresh()
		]),
		...(statusChanged.length > 0
			? [...orgIds.map((id) => getAssets(id).refresh()), getAssets().refresh()]
			: []),
		getOverdueAssets().refresh(),
		getOverdueInspectionCount().refresh(),
		getDashboardStats().refresh()
	]);
}

const logInspectionSchema = v.object({
	assetIds: v.pipe(v.array(v.string()), v.minLength(1)),
	performedAt: v.string(),
	result: v.picklist(INSPECTION_RESULTS),
	notes: v.optional(v.string()),
	inspectorName: v.optional(v.string())
});

/** One inspection for each of these units — one from its page, or a selection. */
export const logInspection = command(logInspectionSchema, async (input) => {
	const user = await requireAuth();
	const created = await recordInspections(user.id, {
		assetIds: input.assetIds,
		performedAt: parseInspectionDate(input.performedAt),
		result: input.result,
		inspectorName: input.inspectorName,
		notes: input.notes
	});
	await refreshInspectionViews(
		input.assetIds,
		created.filter((c) => c.markedBroken).map((c) => c.assetId)
	);
	return { count: created.length, markedBroken: created.filter((c) => c.markedBroken).length };
});

export const deleteInspection = command(v.string(), async (inspectionId) => {
	const user = await requireAuth();
	const { assetId } = await deleteInspectionRecord(user.id, inspectionId);
	await refreshInspectionViews([assetId], []);
});

const setIntervalSchema = v.object({
	assetIds: v.pipe(v.array(v.string()), v.minLength(1)),
	intervalMonths: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(120)))
});

/** The interval for a selection of units; their due dates follow from it. */
export const setInspectionInterval = command(setIntervalSchema, async (input) => {
	const user = await requireAuth();
	const assets = await prisma.asset.findMany({
		where: { id: { in: input.assetIds }, ...ACTIVE_ASSET_WHERE },
		select: { id: true, organizationId: true, inspectionIntervalMonths: true }
	});
	if (assets.length === 0) appError(404, 'assets_not_found');
	for (const orgId of new Set(assets.map((a) => a.organizationId))) {
		await requireOrgInventory(orgId);
	}

	const changing = assets.filter((a) => a.inspectionIntervalMonths !== input.intervalMonths);
	const ids = changing.map((a) => a.id);
	if (ids.length > 0) {
		await prisma.$transaction(async (tx) => {
			await tx.asset.updateMany({
				where: { id: { in: ids } },
				data: { inspectionIntervalMonths: input.intervalMonths }
			});
			await tx.assetTransaction.createMany({
				data: changing.map((a) => ({
					assetId: a.id,
					userId: user.id,
					action: 'UPDATED',
					data: {
						type: 'UPDATED',
						changes: [
							{
								field: 'inspectionIntervalMonths',
								from: a.inspectionIntervalMonths?.toString() ?? null,
								to: input.intervalMonths?.toString() ?? null
							}
						]
					}
				}))
			});
			await refreshInspectionDue(tx, ids);
		});
		await refreshInspectionViews(ids, []);
	}
	return { updated: ids.length, unchanged: assets.length - ids.length };
});
