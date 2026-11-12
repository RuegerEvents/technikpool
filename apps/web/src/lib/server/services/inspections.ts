import type { Prisma } from '#lib/prisma/client.js';
import { prisma } from '#lib/server/auth.js';
import { appError } from '#lib/errors.js';
import { ACTIVE_ASSET_WHERE, isRetiredStatus } from '#lib/asset-status.js';
import {
	DEFAULT_INSPECTION_TYPE_ID,
	INSPECTION_TYPE_IDS,
	earliestDue,
	inspectionDue,
	orgIntervals,
	requiredInspectionTypes,
	type InspectionResult
} from '#lib/inspection-due.js';
import { isSystemAdmin, requireOrgInventory, writableOrgIds } from '#lib/server/services/access.js';
import { validQualifications } from '#lib/server/services/qualifications.js';
import type { InspectedData, InspectionDeletedData } from '#lib/types/asset-transaction.js';

// Inspections of every type, shared by the remote functions and /api/v1. The
// only things anyone does are recording an inspection and deleting one entered
// by mistake; each type's next due date follows from those and the unit's
// interval for that type (see `inspectionDue`) and is never set by hand.

type Tx = Prisma.TransactionClient;

/** What `requiredInspectionTypes` reads, as a Prisma select on a product. */
export const REQUIREMENT_SELECT = {
	isLicense: true,
	inspectionTypes: { select: { typeId: true, required: true } },
	category: { select: { inspectionTypes: { select: { typeId: true } } } }
} satisfies Prisma.ProductSelect;

/** `requiresInspection` in `inspection-due.ts` for one type, as a filter on products. */
export function inspectionRequiredWhere(typeId: string): Prisma.ProductWhereInput {
	return {
		isLicense: false,
		OR: [
			{ inspectionTypes: { some: { typeId, required: true } } },
			{
				inspectionTypes: { none: { typeId } },
				category: { inspectionTypes: { some: { typeId } } }
			}
		]
	};
}

/**
 * Its negation, spelt out rather than `NOT: inspectionRequiredWhere(…)`, which
 * Prisma would turn into SQL that drops rows on every relation filter.
 */
export function inspectionNotRequiredWhere(typeId: string): Prisma.ProductWhereInput {
	return {
		OR: [
			{ isLicense: true },
			{ inspectionTypes: { some: { typeId, required: false } } },
			{
				inspectionTypes: { none: { typeId } },
				category: { inspectionTypes: { none: { typeId } } }
			}
		]
	};
}

/** Products that need at least one type. */
export const ANY_INSPECTION_REQUIRED_WHERE: Prisma.ProductWhereInput = {
	isLicense: false,
	OR: [
		{ inspectionTypes: { some: { required: true } } },
		{ category: { inspectionTypes: { some: {} } } }
	]
};

/** The inspection types in their order, for pickers and per-type settings. */
export function listInspectionTypes(tx: Pick<Tx, 'inspectionType'> = prisma) {
	return tx.inspectionType.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
}

export async function requireInspectionType(typeId: string) {
	const type = await prisma.inspectionType.findUnique({ where: { id: typeId } });
	if (!type) appError(404, 'inspection_type_not_found');
	return type;
}

/** An org's interval per type — its own, else the type's default (`orgIntervals`). */
export async function orgIntervalsFor(
	tx: Pick<Tx, 'inspectionType' | 'orgInspectionInterval'>,
	organizationId: string
) {
	const [types, own] = await Promise.all([
		tx.inspectionType.findMany({ select: { id: true, defaultIntervalMonths: true } }),
		tx.orgInspectionInterval.findMany({ where: { organizationId } })
	]);
	return orgIntervals(types, own);
}

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
 * Writes each schedule's `nextDue` for these units from its interval and the
 * latest inspection of its type, and the earliest of them into
 * `Asset.nextInspectionDue`. The one place either is derived after creation.
 * Returns the earliest per unit.
 */
export async function refreshInspectionDue(tx: Tx, assetIds: string[]) {
	const due = new Map<string, Date | null>();
	if (assetIds.length === 0) return due;
	const assets = await tx.asset.findMany({
		where: { id: { in: assetIds } },
		select: {
			id: true,
			createdAt: true,
			inspectionSchedules: { select: { typeId: true, intervalMonths: true, nextDue: true } },
			inspections: {
				select: { typeId: true, performedAt: true, result: true },
				orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }]
			}
		}
	});
	for (const asset of assets) {
		const dates: Date[] = [];
		for (const schedule of asset.inspectionSchedules) {
			const latest = asset.inspections.find((i) => i.typeId === schedule.typeId) ?? null;
			const next = inspectionDue(schedule.intervalMonths, latest, asset.createdAt)!;
			dates.push(next);
			if (next.getTime() !== schedule.nextDue.getTime()) {
				await tx.assetInspectionSchedule.update({
					where: { assetId_typeId: { assetId: asset.id, typeId: schedule.typeId } },
					data: { nextDue: next }
				});
			}
		}
		const earliest = earliestDue(dates);
		due.set(asset.id, earliest);
		await tx.asset.update({ where: { id: asset.id }, data: { nextInspectionDue: earliest } });
	}
	return due;
}

/**
 * The intervals that apply in these orgs: per org and type its own (null =
 * tracks none), else the type's default; per org, product and type its own
 * on top. `intervalFor` is the precedence below a unit's own.
 */
export async function intervalSources(
	tx: Pick<Tx, 'inspectionType' | 'orgInspectionInterval' | 'orgProductInspectionInterval'>,
	organizationIds: string[]
) {
	const [types, orgRows, productRows] = await Promise.all([
		tx.inspectionType.findMany({ select: { id: true, defaultIntervalMonths: true } }),
		tx.orgInspectionInterval.findMany({ where: { organizationId: { in: organizationIds } } }),
		tx.orgProductInspectionInterval.findMany({
			where: { organizationId: { in: organizationIds } }
		})
	]);
	const byOrg = new Map(
		organizationIds.map((orgId) => [
			orgId,
			orgIntervals(
				types,
				orgRows.filter((r) => r.organizationId === orgId)
			)
		])
	);
	const byProduct = new Map(
		productRows.map((r) => [`${r.organizationId}:${r.productId}:${r.typeId}`, r.months])
	);
	return {
		/** The org's interval for this product and type, without a unit's own. Null: not tracked. */
		intervalFor(organizationId: string, productId: string, typeId: string): number | null {
			return (
				byProduct.get(`${organizationId}:${productId}:${typeId}`) ??
				byOrg.get(organizationId)?.get(typeId) ??
				null
			);
		}
	};
}

/**
 * What a new unit of a product starts with in this org: a schedule for each
 * type its product needs and an interval applies to (`intervalSources`), and
 * nothing otherwise. Never inspected, so it is due at once. Synchronous once
 * built, so it can sit inside a create whose tags are drawn in order.
 */
export async function initialInspection(
	tx: Pick<
		Tx,
		'inspectionType' | 'orgInspectionInterval' | 'orgProductInspectionInterval' | 'product'
	>,
	organizationId: string
) {
	const [sources, products] = await Promise.all([
		intervalSources(tx, [organizationId]),
		tx.product.findMany({
			where: ANY_INSPECTION_REQUIRED_WHERE,
			select: { id: true, ...REQUIREMENT_SELECT }
		})
	]);
	const requiredByProduct = new Map(products.map((p) => [p.id, requiredInspectionTypes(p)]));
	const now = new Date();
	return (productId: string) => {
		const schedules = [...(requiredByProduct.get(productId) ?? [])].flatMap((typeId) => {
			const months = sources.intervalFor(organizationId, productId, typeId);
			return months ? [{ typeId, intervalMonths: months, nextDue: now }] : [];
		});
		return {
			nextInspectionDue: schedules.length ? now : null,
			...(schedules.length ? { inspectionSchedules: { create: schedules } } : {})
		};
	};
}

export type InitialInspection = ReturnType<Awaited<ReturnType<typeof initialInspection>>>;

/** The history entry for a change to a unit's interval of one type. */
function intervalChange(
	assetId: string,
	userId: string,
	typeId: string,
	from: number | null,
	to: number | null
): Prisma.AssetTransactionCreateManyInput {
	return {
		assetId,
		userId,
		action: 'UPDATED',
		data: {
			type: 'UPDATED',
			changes: [
				{
					field: 'inspectionIntervalMonths',
					inspectionTypeId: typeId,
					from: from?.toString() ?? null,
					to: to?.toString() ?? null
				}
			]
		}
	};
}

/**
 * Brings the schedules of these units in line with what applies to them now,
 * for every type or only `typeIds`. A unit keeps a schedule exactly where its
 * product needs the type and an interval applies, or it has an interval of
 * its own; `intervalMonths` is its own, else its org's for the product, else
 * its org's for the type, else the type's default. The one place schedules are
 * created, moved or dropped after a unit exists. Every change is logged, and
 * due dates are derived again. Returns the units that changed.
 *
 * Pass `typeIds` after one type's switch: an override is kept anyway, but
 * reconciling a type nobody touched is work for nothing.
 */
export async function reconcileSchedules(
	tx: Tx,
	userId: string,
	where: Prisma.AssetWhereInput,
	typeIds?: string[]
) {
	const assets = await tx.asset.findMany({
		where: { ...where, ...ACTIVE_ASSET_WHERE },
		select: {
			id: true,
			productId: true,
			organizationId: true,
			product: { select: REQUIREMENT_SELECT },
			inspectionSchedules: {
				select: { typeId: true, intervalMonths: true, overrideMonths: true }
			}
		}
	});
	if (assets.length === 0) return [];
	const types =
		typeIds ?? (await tx.inspectionType.findMany({ select: { id: true } })).map((t) => t.id);
	const sources = await intervalSources(tx, [...new Set(assets.map((a) => a.organizationId))]);

	const changed = new Set<string>();
	const log: Prisma.AssetTransactionCreateManyInput[] = [];
	for (const asset of assets) {
		const needs = requiredInspectionTypes(asset.product);
		for (const typeId of types) {
			const current = asset.inspectionSchedules.find((s) => s.typeId === typeId);
			const own = current?.overrideMonths ?? null;
			const applies = needs.has(typeId)
				? sources.intervalFor(asset.organizationId, asset.productId, typeId)
				: null;
			const next = own ?? applies;
			const key = { assetId_typeId: { assetId: asset.id, typeId } };
			if (!next) {
				if (!current) continue;
				await tx.assetInspectionSchedule.delete({ where: key });
			} else if (!current) {
				// A placeholder date: refreshInspectionDue writes the real one below.
				await tx.assetInspectionSchedule.create({
					data: { assetId: asset.id, typeId, intervalMonths: next, nextDue: new Date(0) }
				});
			} else if (current.intervalMonths !== next) {
				await tx.assetInspectionSchedule.update({ where: key, data: { intervalMonths: next } });
			} else continue;
			log.push(intervalChange(asset.id, userId, typeId, current?.intervalMonths ?? null, next));
			changed.add(asset.id);
		}
	}
	if (log.length) await tx.assetTransaction.createMany({ data: log });
	await refreshInspectionDue(tx, [...changed]);
	return [...changed];
}

/**
 * A unit's own interval of one type for these units — the exception to what
 * its org gives it. Null drops it, so the unit follows its org again (and is
 * not tracked for a type its product does not need). Returns the units whose
 * interval in force changed.
 */
export async function setScheduleInterval(
	tx: Tx,
	userId: string,
	assetIds: string[],
	typeId: string,
	months: number | null
) {
	const existing = new Set(
		(
			await tx.assetInspectionSchedule.findMany({
				where: { assetId: { in: assetIds }, typeId },
				select: { assetId: true }
			})
		).map((s) => s.assetId)
	);
	await tx.assetInspectionSchedule.updateMany({
		where: { assetId: { in: [...existing] }, typeId },
		data: { overrideMonths: months }
	});
	// A unit not tracked for the type yet starts now, at its own interval.
	const created = months === null ? [] : assetIds.filter((id) => !existing.has(id));
	if (created.length) {
		await tx.assetInspectionSchedule.createMany({
			data: created.map((assetId) => ({
				assetId,
				typeId,
				intervalMonths: months!,
				overrideMonths: months,
				nextDue: new Date(0)
			}))
		});
		await tx.assetTransaction.createMany({
			data: created.map((id) => intervalChange(id, userId, typeId, null, months))
		});
		await refreshInspectionDue(tx, created);
	}
	const moved = await reconcileSchedules(tx, userId, { id: { in: assetIds } }, [typeId]);
	return [...new Set([...created, ...moved])];
}

/**
 * After a product's or a category's requirements changed: `reconcileSchedules`
 * for the units of these products. `typeIds` limits it to the types whose
 * answer changed; without it (a new category, the licence flag) every type is.
 */
export async function applyInspectionRequirement(
	tx: Tx,
	userId: string,
	productIds: string[],
	typeIds?: string[]
) {
	if (productIds.length === 0) return [];
	return reconcileSchedules(tx, userId, { productId: { in: productIds } }, typeIds);
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

/** Every product with a mains connector, and which — `mainsConnectorNames` for the whole catalog at once. */
export async function mainsConnectorsByProduct() {
	const connectors = await prisma.connector.findMany({
		where: { mains: true },
		select: {
			name: true,
			ports: { select: { productId: true } },
			productEndsA: { select: { id: true } },
			productEndsB: { select: { id: true } },
			wayEndsA: { select: { productId: true } },
			wayEndsB: { select: { productId: true } }
		},
		orderBy: { name: 'asc' }
	});
	const byProduct: Record<string, string[]> = {};
	for (const c of connectors) {
		const ids = new Set([
			...c.ports.map((p) => p.productId),
			...c.productEndsA.map((p) => p.id),
			...c.productEndsB.map((p) => p.id),
			...c.wayEndsA.map((w) => w.productId),
			...c.wayEndsB.map((w) => w.productId)
		]);
		for (const id of ids) (byProduct[id] ??= []).push(c.name);
	}
	return byProduct;
}

export type RecordInspectionInput = {
	assetIds: string[];
	/** Absent: electrical, the only kind an older client knows. */
	typeId?: string | null;
	/**
	 * Done by an outside firm and only entered here. Then `inspectorName` and
	 * `qualification` are the firm's, and are required where the type needs a
	 * qualification; otherwise the one recording it must hold one.
	 */
	external?: boolean;
	qualification?: string | null;
	source?: 'web' | 'scanner' | 'checkin' | 'bench';
	performedAt: Date;
	result: InspectionResult;
	inspectorName?: string | null;
	notes?: string | null;
};

/**
 * One inspection per unit, all of one type with the same date, result and
 * inspector — a single unit from its page, a selection from the Devices list,
 * or a scan. A failed inspection sets the unit to its type's `failStatus`
 * (BROKEN for electrical) and leaves that type due until a passed one is
 * recorded.
 */
export async function recordInspections(userId: string, input: RecordInspectionInput) {
	const assetIds = [...new Set(input.assetIds)];
	const type = await requireInspectionType(input.typeId ?? DEFAULT_INSPECTION_TYPE_ID);
	const assets = await prisma.asset.findMany({
		where: { id: { in: assetIds } },
		select: { id: true, status: true, organizationId: true }
	});
	if (assets.length !== assetIds.length) appError(404, 'assets_not_found');
	if (assets.some((a) => isRetiredStatus(a.status))) appError(409, 'asset_retired_no_inspection');
	const orgIds = [...new Set(assets.map((a) => a.organizationId))];
	for (const orgId of orgIds) {
		await requireOrgInventory(orgId);
	}

	// Who inspected, and on what qualification. An inspection of a type that
	// needs one is done by a member qualified for it in every org involved, or
	// by an outside firm whose details come with it.
	const external = !!input.external;
	let inspectorName = input.inspectorName?.trim() || null;
	let qualification = input.qualification?.trim() || null;
	if (external) {
		if (type.requiresQualification && (!inspectorName || !qualification)) {
			appError(400, 'inspection_external_details_required');
		}
	} else {
		const user = await prisma.user.findUniqueOrThrow({
			where: { id: userId },
			select: { name: true, email: true }
		});
		// One's own inspection is under one's own name, whatever was typed.
		inspectorName = user.name || user.email;
		if (type.requiresQualification) {
			const held = await validQualifications(userId, type.id, orgIds);
			if (orgIds.some((id) => !held.has(id))) {
				appError(403, 'inspection_qualification_required', [type.nameDe ?? type.name]);
			}
			qualification = held.get(orgIds[0]) ?? null;
		} else {
			qualification = null;
		}
	}
	const notes = input.notes?.trim() || null;
	const failed = input.result === 'FAILED';
	const performedAt = input.performedAt.toISOString().slice(0, 10);

	return prisma.$transaction(async (tx) => {
		const created: { id: string; assetId: string; markedBroken: boolean }[] = [];
		for (const asset of assets) {
			const markedBroken = failed && asset.status !== type.failStatus;
			const inspection = await tx.inspection.create({
				data: {
					assetId: asset.id,
					typeId: type.id,
					source: input.source ?? 'web',
					performedAt: input.performedAt,
					result: input.result,
					inspectorName,
					notes,
					external,
					qualification,
					performedById: userId
				}
			});
			const data: InspectedData = {
				type: 'INSPECTED',
				inspectionId: inspection.id,
				inspectionTypeId: type.id,
				performedAt,
				result: input.result,
				inspectorName,
				markedBroken,
				...(markedBroken ? { status: type.failStatus } : {})
			};
			await tx.assetTransaction.create({
				data: { assetId: asset.id, userId, action: 'INSPECTED', data }
			});
			if (markedBroken) {
				await tx.asset.update({ where: { id: asset.id }, data: { status: type.failStatus } });
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
			inspectionTypeId: inspection.typeId,
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

/** The statuses a failed inspection may set: in the pool but not fine, or out of it. */
export const INSPECTION_FAIL_STATUSES = [
	'BROKEN',
	'MAINTENANCE',
	'UNAVAILABLE',
	'DECOMMISSIONED'
] as const;

export type InspectionTypeInput = {
	name?: string;
	nameDe?: string | null;
	sortOrder?: number;
	failStatus?: string;
	requiresQualification?: boolean;
	hasMeasurements?: boolean;
	defaultIntervalMonths?: number | null;
};

async function checkTypeFields(input: InspectionTypeInput, exceptId?: string) {
	if (input.failStatus !== undefined) {
		if (!(INSPECTION_FAIL_STATUSES as readonly string[]).includes(input.failStatus)) {
			appError(400, 'inspection_fail_status_invalid');
		}
	}
	if (input.name !== undefined) {
		const name = input.name.trim();
		if (!name) appError(400, 'inspection_type_name_required');
		const clash = await prisma.inspectionType.findFirst({
			where: {
				name: { equals: name, mode: 'insensitive' },
				...(exceptId ? { id: { not: exceptId } } : {})
			},
			select: { id: true }
		});
		if (clash) appError(409, 'inspection_type_exists', [name]);
	}
}

/** A key for a new type, from its name: what the API names it by. Never changed afterwards. */
async function freeTypeKey(name: string) {
	const base =
		name
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'type';
	for (let n = 1; ; n++) {
		const key = n === 1 ? base : `${base}-${n}`;
		if (!(await prisma.inspectionType.findUnique({ where: { key } }))) return key;
	}
}

/** A new inspection type. System admin only, like categories. Nothing needs it until switched on. */
export async function createInspectionType(
	userId: string,
	input: InspectionTypeInput & { name: string }
) {
	if (!(await isSystemAdmin(userId))) appError(403, 'admin_required');
	await checkTypeFields(input);
	const last = await prisma.inspectionType.findFirst({ orderBy: { sortOrder: 'desc' } });
	return prisma.inspectionType.create({
		data: {
			key: await freeTypeKey(input.name),
			name: input.name.trim(),
			nameDe: input.nameDe?.trim() || null,
			sortOrder: input.sortOrder ?? (last ? last.sortOrder + 1 : 0),
			failStatus: input.failStatus ?? 'BROKEN',
			requiresQualification: input.requiresQualification ?? true,
			hasMeasurements: input.hasMeasurements ?? false,
			defaultIntervalMonths: input.defaultIntervalMonths ?? null
		}
	});
}

/**
 * Changes an inspection type. A new default interval reaches every unit of an
 * org that has no interval of its own for the type (`reconcileSchedules`).
 * Returns the units whose interval moved.
 */
export async function updateInspectionType(
	userId: string,
	typeId: string,
	input: InspectionTypeInput
) {
	if (!(await isSystemAdmin(userId))) appError(403, 'admin_required');
	const previous = await requireInspectionType(typeId);
	await checkTypeFields(input, typeId);
	const defaultChanged =
		input.defaultIntervalMonths !== undefined &&
		input.defaultIntervalMonths !== previous.defaultIntervalMonths;
	return prisma.$transaction(async (tx) => {
		const type = await tx.inspectionType.update({
			where: { id: typeId },
			data: {
				...(input.name !== undefined ? { name: input.name.trim() } : {}),
				...(input.nameDe !== undefined ? { nameDe: input.nameDe?.trim() || null } : {}),
				...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
				...(input.failStatus !== undefined ? { failStatus: input.failStatus } : {}),
				...(input.requiresQualification !== undefined
					? { requiresQualification: input.requiresQualification }
					: {}),
				...(input.hasMeasurements !== undefined ? { hasMeasurements: input.hasMeasurements } : {}),
				...(defaultChanged ? { defaultIntervalMonths: input.defaultIntervalMonths } : {})
			}
		});
		const unitsChanged = defaultChanged
			? await reconcileSchedules(
					tx,
					userId,
					{ organization: { inspectionIntervals: { none: { typeId } } } },
					[typeId]
				)
			: [];
		return { type, unitsChanged };
	});
}

// ── Visual check on return ─────────────────────────────────────────────────
// Taking a unit back is where someone has it in their hands. Whoever books it
// back and reports nothing has looked at it and found it fine, and for a unit
// whose product needs the visual check that is written down as one, passed.
// A defect is reported on its own (`reportDefect`) and is a failed visual
// check, whatever the product needs. Anyone who may take a unit back may do
// both, so this path skips the ADMIN+ and qualification rules of
// `recordInspections` — which is also why the visual type is never one an
// admin should mark as needing a qualification.

const VISUAL_TYPE_ID = INSPECTION_TYPE_IDS.visual;
const NOT_FINE = new Set(['BROKEN', 'MAINTENANCE']);

function todayUtc() {
	const now = new Date();
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function writeVisualCheck(
	tx: Tx,
	userId: string,
	assets: { id: string; status: string }[],
	result: InspectionResult,
	notes: string | null
) {
	if (assets.length === 0) return [];
	const [type, user] = await Promise.all([
		tx.inspectionType.findUnique({ where: { id: VISUAL_TYPE_ID } }),
		tx.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } })
	]);
	if (!type) return [];
	const performedAt = todayUtc();
	const marked: string[] = [];
	for (const asset of assets) {
		const markedBroken = result === 'FAILED' && asset.status !== type.failStatus;
		const inspection = await tx.inspection.create({
			data: {
				assetId: asset.id,
				typeId: type.id,
				source: 'checkin',
				performedAt,
				result,
				notes,
				inspectorName: user.name || user.email,
				performedById: userId
			}
		});
		const data: InspectedData = {
			type: 'INSPECTED',
			inspectionId: inspection.id,
			inspectionTypeId: type.id,
			performedAt: performedAt.toISOString().slice(0, 10),
			result,
			inspectorName: user.name || user.email,
			markedBroken,
			...(markedBroken ? { status: type.failStatus } : {})
		};
		await tx.assetTransaction.create({
			data: { assetId: asset.id, userId, action: 'INSPECTED', data }
		});
		if (markedBroken) {
			await tx.asset.update({ where: { id: asset.id }, data: { status: type.failStatus } });
			marked.push(asset.id);
		}
	}
	await refreshInspectionDue(
		tx,
		assets.map((a) => a.id)
	);
	return marked;
}

/**
 * The passed visual check of units just booked back from a production: only
 * those whose product needs the visual check, and not one already reported
 * broken or in maintenance — nobody found that one fine.
 */
export async function recordReturnChecks(tx: Tx, userId: string, assetIds: string[]) {
	if (assetIds.length === 0) return;
	const assets = await tx.asset.findMany({
		where: { id: { in: assetIds }, product: inspectionRequiredWhere(VISUAL_TYPE_ID) },
		select: { id: true, status: true }
	});
	await writeVisualCheck(
		tx,
		userId,
		assets.filter((a) => !NOT_FINE.has(a.status) && !isRetiredStatus(a.status)),
		'PASSED',
		null
	);
}

/**
 * A defect found on a unit, usually while taking it back: a failed visual
 * check with what is wrong, which sets the unit to the visual type's fail
 * status (in maintenance). MEMBER+ of the unit's org, like taking it back.
 */
export async function reportDefect(userId: string, assetId: string, notes: string) {
	const asset = await prisma.asset.findUnique({
		where: { id: assetId },
		select: { id: true, status: true, organizationId: true }
	});
	if (!asset) appError(404, 'assets_not_found');
	if (isRetiredStatus(asset.status)) appError(409, 'asset_retired_no_inspection');
	const [orgIds, admin] = await Promise.all([writableOrgIds(userId), isSystemAdmin(userId)]);
	if (!admin && !orgIds.includes(asset.organizationId)) appError(403, 'unauthorized');
	const note = notes.trim();
	if (!note) appError(400, 'defect_note_required');
	const marked = await prisma.$transaction((tx) =>
		writeVisualCheck(tx, userId, [asset], 'FAILED', note)
	);
	return { assetId, statusChanged: marked.length > 0 };
}

export type OverdueInspection = {
	typeId: string;
	name: string;
	nameDe: string | null;
	count: number;
};

/**
 * Of these units, how many are overdue per inspection type — what handing
 * them out warns about. It never refuses: a failed unit is already held back
 * by its status, and an overdue one may still be on its way to the tester.
 */
export async function overdueInspections(assetIds: string[]): Promise<OverdueInspection[]> {
	if (assetIds.length === 0) return [];
	const rows = await prisma.assetInspectionSchedule.groupBy({
		by: ['typeId'],
		where: { assetId: { in: assetIds }, nextDue: { lt: new Date() } },
		_count: { _all: true }
	});
	if (rows.length === 0) return [];
	const types = await prisma.inspectionType.findMany({
		where: { id: { in: rows.map((r) => r.typeId) } },
		orderBy: { sortOrder: 'asc' }
	});
	return types.map((t) => ({
		typeId: t.id,
		name: t.name,
		nameDe: t.nameDe,
		count: rows.find((r) => r.typeId === t.id)!._count._all
	}));
}
