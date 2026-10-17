import type { Prisma } from '#lib/prisma/client.js';
import { prisma } from '#lib/server/auth.js';
import { appError } from '#lib/errors.js';
import { ACTIVE_ASSET_WHERE, isRetiredStatus } from '#lib/asset-status.js';
import { inspectionDue, requiresInspection, type InspectionResult } from '#lib/inspection-due.js';
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

/** Products whose units need DGUV inspections — see `requiresInspection`. */
const REQUIRES_INSPECTION_WHERE = {
	isLicense: false,
	OR: [
		{ requiresInspection: true },
		{ requiresInspection: null, category: { requiresInspection: true } }
	]
} satisfies Prisma.ProductWhereInput;

/**
 * What a new unit of a product starts with in this org: the org's default
 * interval if the product needs inspecting, and nothing otherwise. Never
 * inspected, so it is due at once. Synchronous once built, so it can sit
 * inside a create whose tags are drawn in order.
 */
export async function initialInspection(
	tx: Pick<Tx, 'organization' | 'product'>,
	organizationId: string
) {
	const [org, required] = await Promise.all([
		tx.organization.findUniqueOrThrow({
			where: { id: organizationId },
			select: { defaultInspectionIntervalMonths: true }
		}),
		tx.product.findMany({ where: REQUIRES_INSPECTION_WHERE, select: { id: true } })
	]);
	const requiredIds = new Set(required.map((p) => p.id));
	const now = new Date();
	return (productId: string) => {
		const interval = requiredIds.has(productId) ? org.defaultInspectionIntervalMonths : null;
		return {
			inspectionIntervalMonths: interval,
			nextInspectionDue: inspectionDue(interval, null, now)
		};
	};
}

/**
 * After a product's or a category's "needs inspecting" changed: units that now
 * need it and have no interval get their org's default, units that no longer
 * do lose theirs. A unit with an interval of its own that still needs
 * inspecting keeps it. Logged like any interval change.
 */
export async function applyInspectionRequirement(tx: Tx, userId: string, productIds: string[]) {
	if (productIds.length === 0) return [];
	const products = await tx.product.findMany({
		where: { id: { in: productIds } },
		select: {
			id: true,
			isLicense: true,
			requiresInspection: true,
			category: { select: { requiresInspection: true } }
		}
	});
	const required = new Set(products.filter(requiresInspection).map((p) => p.id));
	const assets = await tx.asset.findMany({
		where: {
			productId: { in: productIds },
			...ACTIVE_ASSET_WHERE
		},
		select: {
			id: true,
			productId: true,
			inspectionIntervalMonths: true,
			organization: { select: { defaultInspectionIntervalMonths: true } }
		}
	});
	const changed: string[] = [];
	for (const asset of assets) {
		const next = required.has(asset.productId)
			? (asset.inspectionIntervalMonths ?? asset.organization.defaultInspectionIntervalMonths)
			: null;
		if (next === asset.inspectionIntervalMonths) continue;
		await tx.asset.update({ where: { id: asset.id }, data: { inspectionIntervalMonths: next } });
		await tx.assetTransaction.create({
			data: {
				assetId: asset.id,
				userId,
				action: 'UPDATED',
				data: {
					type: 'UPDATED',
					changes: [
						{
							field: 'inspectionIntervalMonths',
							from: asset.inspectionIntervalMonths?.toString() ?? null,
							to: next?.toString() ?? null
						}
					]
				}
			}
		});
		changed.push(asset.id);
	}
	await refreshInspectionDue(tx, changed);
	return changed;
}

/**
 * The mains connectors a product has — on its panel, at either cable end, or on
 * any way of a loom. Mains means electrical equipment, which needs DGUV V3
 * inspections; a product with one that isn't marked so gets a hint.
 */
export async function mainsConnectorNames(productId: string) {
	const rows = await prisma.connector.findMany({
		where: {
			mains: true,
			OR: [
				{ ports: { some: { productId } } },
				{ productEndsA: { some: { id: productId } } },
				{ productEndsB: { some: { id: productId } } },
				{ wayEndsA: { some: { productId } } },
				{ wayEndsB: { some: { productId } } }
			]
		},
		select: { name: true },
		orderBy: { name: 'asc' }
	});
	return rows.map((r) => r.name);
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
