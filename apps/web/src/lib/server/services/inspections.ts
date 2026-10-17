import type { Prisma } from '#lib/prisma/client.js';
import { prisma } from '#lib/server/auth.js';
import { appError } from '#lib/errors.js';
import { isRetiredStatus } from '#lib/asset-status.js';
import { inspectionDue, type InspectionResult } from '#lib/inspection-due.js';
import { requireOrgInventory } from '#lib/server/services/access.js';
import type { InspectedData, InspectionDeletedData } from '#lib/types/asset-transaction.js';

// DGUV inspections, shared by the remote functions and /api/v1. The only
// things anyone does are recording an inspection and deleting one entered by
// mistake; the next due date follows from those and the unit's interval (see
// `inspectionDue`) and is never set by hand.

type Tx = Prisma.TransactionClient;

/** YYYY-MM-DD → midnight UTC, refusing what isn't a real day or hasn't happened yet. */
export function parseInspectionDate(value: string): Date {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
	if (!match) appError(400, 'inspection_date_invalid');
	const date = new Date(`${match[0]}T00:00:00.000Z`);
	if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match[0]) {
		appError(400, 'inspection_date_invalid');
	}
	// A day ahead of UTC is still today somewhere the app is used.
	if (date.getTime() > Date.now() + 86_400_000) appError(400, 'inspection_date_future');
	return date;
}

/**
 * Writes `nextInspectionDue` for these units from their interval and their
 * latest inspection. The one place the column is derived after creation.
 */
export async function refreshInspectionDue(tx: Tx, assetIds: string[]) {
	if (assetIds.length === 0) return new Map<string, Date | null>();
	const assets = await tx.asset.findMany({
		where: { id: { in: assetIds } },
		select: {
			id: true,
			createdAt: true,
			inspectionIntervalMonths: true,
			inspections: {
				select: { performedAt: true, result: true },
				orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }],
				take: 1
			}
		}
	});
	const due = new Map<string, Date | null>();
	for (const asset of assets) {
		const next = inspectionDue(
			asset.inspectionIntervalMonths,
			asset.inspections[0] ?? null,
			asset.createdAt
		);
		due.set(asset.id, next);
		await tx.asset.update({ where: { id: asset.id }, data: { nextInspectionDue: next } });
	}
	return due;
}

export type RecordInspectionInput = {
	assetIds: string[];
	performedAt: Date;
	result: InspectionResult;
	inspectorName?: string | null;
	notes?: string | null;
};

/**
 * One inspection per unit, all with the same date, result and inspector — a
 * single unit from its page, a selection from the Devices list, or a scan.
 * A failed inspection marks the unit BROKEN and leaves it due until a passed
 * one is recorded.
 */
export async function recordInspections(userId: string, input: RecordInspectionInput) {
	const assetIds = [...new Set(input.assetIds)];
	const assets = await prisma.asset.findMany({
		where: { id: { in: assetIds } },
		select: { id: true, status: true, organizationId: true }
	});
	if (assets.length !== assetIds.length) appError(404, 'assets_not_found');
	if (assets.some((a) => isRetiredStatus(a.status))) appError(409, 'asset_retired_no_inspection');
	for (const orgId of new Set(assets.map((a) => a.organizationId))) {
		await requireOrgInventory(orgId);
	}

	const inspectorName = input.inspectorName?.trim() || null;
	const notes = input.notes?.trim() || null;
	const failed = input.result === 'FAILED';
	const performedAt = input.performedAt.toISOString().slice(0, 10);

	return prisma.$transaction(async (tx) => {
		const created: { id: string; assetId: string; markedBroken: boolean }[] = [];
		for (const asset of assets) {
			const markedBroken = failed && asset.status !== 'BROKEN';
			const inspection = await tx.inspection.create({
				data: {
					assetId: asset.id,
					performedAt: input.performedAt,
					result: input.result,
					inspectorName,
					notes
				}
			});
			const data: InspectedData = {
				type: 'INSPECTED',
				inspectionId: inspection.id,
				performedAt,
				result: input.result,
				inspectorName,
				markedBroken
			};
			await tx.assetTransaction.create({
				data: { assetId: asset.id, userId, action: 'INSPECTED', data }
			});
			if (markedBroken) {
				await tx.asset.update({ where: { id: asset.id }, data: { status: 'BROKEN' } });
			}
			created.push({ id: inspection.id, assetId: asset.id, markedBroken });
		}
		const due = await refreshInspectionDue(tx, assetIds);
		return created.map((c) => ({ ...c, nextInspectionDue: due.get(c.assetId) ?? null }));
	});
}

/**
 * Removes an inspection entered by mistake and derives the due date again from
 * what is left. A status the inspection set stays: whether the unit is broken
 * is for someone to decide, not something to roll back silently.
 */
export async function deleteInspection(userId: string, inspectionId: string) {
	const inspection = await prisma.inspection.findUnique({
		where: { id: inspectionId },
		include: { asset: { select: { organizationId: true } } }
	});
	if (!inspection) appError(404, 'inspection_not_found');
	await requireOrgInventory(inspection.asset.organizationId);

	return prisma.$transaction(async (tx) => {
		await tx.inspection.delete({ where: { id: inspectionId } });
		const data: InspectionDeletedData = {
			type: 'INSPECTION_DELETED',
			performedAt: inspection.performedAt.toISOString().slice(0, 10),
			result: inspection.result === 'FAILED' ? 'FAILED' : 'PASSED'
		};
		await tx.assetTransaction.create({
			data: { assetId: inspection.assetId, userId, action: 'INSPECTION_DELETED', data }
		});
		const due = await refreshInspectionDue(tx, [inspection.assetId]);
		return { assetId: inspection.assetId, nextInspectionDue: due.get(inspection.assetId) ?? null };
	});
}
