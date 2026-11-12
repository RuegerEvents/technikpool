import { query, command } from '$app/server';
import { prisma } from '#lib/server/auth.js';
import * as v from 'valibot';
import {
	isSystemAdmin,
	managedOrgIds,
	requireAuth,
	requireOrgInventory,
	userOrgIds
} from '#lib/server/services/access.js';
import { productControl } from '#lib/server/services/product-control.js';
import { inspectionField, updateCategory, updateProduct } from '#lib/server/services/products.js';
import { logCatalogChange } from '#lib/server/services/catalog-log.js';
import { ACTIVE_ASSET_WHERE } from '#lib/asset-status.js';
import { appError } from '#lib/errors.js';
import {
	DEFAULT_INSPECTION_TYPE_ID,
	INSPECTION_RESULTS,
	inspectionOverride,
	orgIntervals
} from '#lib/inspection-due.js';
import { ROLE_FOR, roleAtLeast } from '#lib/roles.js';
import {
	applyInspectionRequirement,
	inspectionRequiredWhere,
	deleteInspection as deleteInspectionRecord,
	listInspectionTypes,
	mainsConnectorNames,
	mainsConnectorsByProduct,
	orgIntervalsFor,
	parseInspectionDate,
	reconcileSchedules,
	createInspectionType as createInspectionTypeRecord,
	updateInspectionType as updateInspectionTypeRecord,
	INSPECTION_FAIL_STATUSES,
	reportDefect as reportDefectRecord,
	recordInspections,
	requireInspectionType,
	setScheduleInterval
} from '#lib/server/services/inspections.js';
import {
	getAsset,
	getAssetHistory,
	getAssets,
	getCategories,
	getProductCatalog
} from '#lib/remote/assets.remote.js';
import { getDashboardStats } from '#lib/remote/productions.remote.js';
import {
	myQualifications,
	orgQualifications,
	setMemberQualification as setMemberQualificationRecord
} from '#lib/server/services/qualifications.js';

// How far ahead the list reaches. The page narrows it to 30, 90 or 180 days
// on the client, so changing the window is not a round trip and every
// `getOverdueAssets().refresh()` keeps covering what is on screen.
const UPCOMING_WINDOW_DAYS = 365;

/** Every inspection type, in order — for pickers, filters and per-type settings. */
export const getInspectionTypes = query(async () => {
	await requireAuth();
	return listInspectionTypes();
});

/**
 * What is due within a year, one row per unit and inspection type — a chain
 * hoist due for both its electrical and its lifting inspection is two rows.
 */
export const getOverdueAssets = query(async () => {
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);
	const orgIds = systemAdmin ? undefined : await userOrgIds(user.id);

	const now = new Date();
	const upcomingCutoff = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 86_400_000);

	const schedules = await prisma.assetInspectionSchedule.findMany({
		where: {
			nextDue: { lte: upcomingCutoff },
			asset: {
				...(orgIds ? { organizationId: { in: orgIds } } : {}),
				...ACTIVE_ASSET_WHERE
			}
		},
		include: {
			type: { select: { id: true, name: true, nameDe: true, sortOrder: true } },
			asset: {
				include: {
					product: {
						include: {
							manufacturer: true,
							category: { select: { id: true, name: true, nameDe: true, sortOrder: true } }
						}
					},
					organization: {
						select: { id: true, name: true, shortName: true, color: true, avatarLabel: true }
					},
					location: { select: { id: true, name: true } },
					// The latest per type, to tell "never inspected" and "failed" from "due again".
					inspections: {
						select: { typeId: true, performedAt: true, result: true },
						orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }]
					}
				}
			}
		},
		orderBy: [{ nextDue: 'asc' }, { type: { sortOrder: 'asc' } }]
	});

	const rows = schedules.map(({ asset, type, nextDue, intervalMonths }) => {
		const { inspections, ...rest } = asset;
		return {
			...rest,
			key: `${asset.id}:${type.id}`,
			type,
			nextDue,
			intervalMonths,
			lastInspection: inspections.find((i) => i.typeId === type.id) ?? null
		};
	});
	return {
		overdue: rows.filter((r) => r.nextDue < now),
		upcoming: rows.filter((r) => r.nextDue >= now)
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

/**
 * The caller's orgs and inspection types where units need the type but the org
 * has no interval for it. New units there get no schedule, so they are never
 * due and never listed — the inspections page says so rather than staying
 * quietly empty. Memberships only, even for a system admin: it is a nudge to
 * whoever runs the org.
 */
export const getOrgsWithoutInspectionInterval = query(async () => {
	const user = await requireAuth();
	const [memberships, types] = await Promise.all([
		prisma.orgMembership.findMany({
			where: { userId: user.id },
			select: {
				role: true,
				organization: { select: { id: true, name: true, shortName: true } }
			},
			orderBy: { organization: { name: 'asc' } }
		}),
		listInspectionTypes()
	]);
	const gaps = [];
	for (const m of memberships) {
		const intervals = await orgIntervalsFor(prisma, m.organization.id);
		for (const type of types) {
			if (intervals.get(type.id)) continue;
			const needed = await prisma.asset.count({
				where: {
					organizationId: m.organization.id,
					...ACTIVE_ASSET_WHERE,
					product: inspectionRequiredWhere(type.id)
				}
			});
			if (needed === 0) continue;
			gaps.push({
				...m.organization,
				type: { id: type.id, name: type.name, nameDe: type.nameDe },
				// The interval is an org setting, which `updateOrg` leaves to its OWNER.
				canEdit: roleAtLeast(m.role, ROLE_FOR.organization)
			});
		}
	}
	return gaps;
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
		include: {
			type: { select: { id: true, name: true, nameDe: true } },
			performedBy: { select: { name: true, email: true } }
		},
		orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }]
	});
});

/** A product's mains connectors, for the "this needs inspecting" hint. Catalog data, open to all. */
export const getMainsConnectors = query(v.string(), async (productId: string) => {
	await requireAuth();
	return mainsConnectorNames(productId);
});

/** Product id → its mains connectors, for the DGUV quick mode on /products. */
export const getMainsConnectorsByProduct = query(async () => {
	await requireAuth();
	return mainsConnectorsByProduct();
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
	typeId: v.optional(v.string()),
	external: v.optional(v.boolean()),
	qualification: v.optional(v.string()),
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
		typeId: input.typeId,
		source: 'web',
		external: input.external,
		qualification: input.qualification,
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
	/** Absent: electrical. */
	typeId: v.optional(v.string()),
	intervalMonths: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(120)))
});

/** The interval of one type for a selection of units; their due dates follow from it. */
export const setInspectionInterval = command(setIntervalSchema, async (input) => {
	const user = await requireAuth();
	const type = await requireInspectionType(input.typeId ?? DEFAULT_INSPECTION_TYPE_ID);
	const assets = await prisma.asset.findMany({
		where: { id: { in: input.assetIds }, ...ACTIVE_ASSET_WHERE },
		select: { id: true, organizationId: true }
	});
	if (assets.length === 0) appError(404, 'assets_not_found');
	for (const orgId of new Set(assets.map((a) => a.organizationId))) {
		await requireOrgInventory(orgId);
	}

	const ids = await prisma.$transaction((tx) =>
		setScheduleInterval(
			tx,
			user.id,
			assets.map((a) => a.id),
			type.id,
			input.intervalMonths
		)
	);
	if (ids.length > 0) await refreshInspectionViews(ids, []);
	return { updated: ids.length, unchanged: assets.length - ids.length };
});

/**
 * A product's intervals in each org the caller runs the inventory of and that
 * holds units of it: per type the org's own for this product, if any, and the
 * org's default it would otherwise follow. Shown and edited on the product's
 * page — an org without units of it has nothing there to follow either.
 */
export const getProductInspectionIntervals = query(v.string(), async (productId: string) => {
	const user = await requireAuth();
	const orgIds = await managedOrgIds(user.id);
	if (orgIds.length === 0) return [];
	const [orgs, own, types] = await Promise.all([
		prisma.organization.findMany({
			where: {
				id: { in: orgIds },
				assets: { some: { productId, ...ACTIVE_ASSET_WHERE } }
			},
			select: {
				id: true,
				name: true,
				shortName: true,
				inspectionIntervals: { select: { typeId: true, months: true } }
			},
			orderBy: { name: 'asc' }
		}),
		prisma.orgProductInspectionInterval.findMany({
			where: { productId, organizationId: { in: orgIds } }
		}),
		listInspectionTypes()
	]);
	return orgs.map(({ inspectionIntervals, ...org }) => {
		const defaults = orgIntervals(types, inspectionIntervals);
		return {
			org,
			types: types.map((t) => ({
				typeId: t.id,
				own: own.find((r) => r.organizationId === org.id && r.typeId === t.id)?.months ?? null,
				orgDefault: defaults.get(t.id) ?? null
			}))
		};
	});
});

const productIntervalSchema = v.object({
	organizationId: v.string(),
	productId: v.string(),
	typeId: v.string(),
	/** Null: follow the org's interval for the type again. */
	months: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(120)))
});

/**
 * An org's interval for one product and type. Its units that have no interval
 * of their own move to it at once (`reconcileSchedules`). ADMIN+ of the org,
 * like a unit's interval.
 */
export const setProductInspectionInterval = command(productIntervalSchema, async (input) => {
	const user = await requireAuth();
	await requireOrgInventory(input.organizationId);
	const type = await requireInspectionType(input.typeId);
	const key = {
		organizationId: input.organizationId,
		productId: input.productId,
		typeId: type.id
	};
	const changed = await prisma.$transaction(async (tx) => {
		if (input.months === null) {
			await tx.orgProductInspectionInterval.deleteMany({ where: key });
		} else {
			await tx.orgProductInspectionInterval.upsert({
				where: { organizationId_productId_typeId: key },
				create: { ...key, months: input.months },
				update: { months: input.months }
			});
		}
		return reconcileSchedules(
			tx,
			user.id,
			{ organizationId: input.organizationId, productId: input.productId },
			[type.id]
		);
	});
	await Promise.all([
		getProductInspectionIntervals(input.productId).refresh(),
		changed.length ? refreshInspectionViews(changed, []) : Promise.resolve()
	]);
	return { changed: changed.length };
});

/** After a change to who needs inspecting: the catalog, and every unit list. */
async function refreshRequirementViews(changedAssetIds: string[]) {
	const user = await requireAuth();
	const orgIds = await userOrgIds(user.id);
	await Promise.all([
		getProductCatalog().refresh(),
		...orgIds.map((id) => getProductCatalog(id).refresh()),
		getCategories().refresh(),
		...changedAssetIds.flatMap((id) => [getAsset(id).refresh(), getAssetHistory(id).refresh()]),
		getAssets().refresh(),
		getOverdueAssets().refresh(),
		getOverdueInspectionCount().refresh(),
		getDashboardStats().refresh()
	]);
}

const productRequirementSchema = v.object({
	productId: v.string(),
	typeId: v.string(),
	/** Null follows the category. */
	required: v.nullable(v.boolean())
});

/**
 * Whether a product's units need DGUV inspections, overriding its category.
 * It is a fact about the product, so it answers to the same rule as its name
 * (`productControl`), and it moves the interval of every unit of it.
 */
export const setProductInspectionRequirement = command(productRequirementSchema, async (input) => {
	const user = await requireAuth();
	const { unitsChanged, changed } = await updateProduct(user.id, {
		productId: input.productId,
		inspections: { [input.typeId]: input.required }
	});
	if (changed) await refreshRequirementViews(unitsChanged);
	return { changed: unitsChanged.length };
});

const categoryRequirementSchema = v.object({
	categoryId: v.string(),
	typeId: v.string(),
	required: v.boolean()
});

/**
 * Whether units in a category need DGUV inspections, unless their product says
 * otherwise. Categories are global, so this is a system admin's call, and it
 * moves the interval of every unit whose product follows the category.
 */
export const setCategoryInspectionRequirement = command(
	categoryRequirementSchema,
	async (input) => {
		const user = await requireAuth();
		const { unitsChanged, changed } = await updateCategory(user.id, {
			categoryId: input.categoryId,
			inspections: { [input.typeId]: input.required }
		});
		if (changed) await refreshRequirementViews(unitsChanged);
		return { changed: unitsChanged.length };
	}
);

const productsRequirementSchema = v.object({
	productIds: v.pipe(v.array(v.string()), v.minLength(1)),
	/** Absent: electrical. */
	typeId: v.optional(v.string()),
	/** Null follows the category. */
	required: v.nullable(v.boolean())
});

/**
 * `setProductInspectionRequirement` for a selection — the DGUV quick mode on
 * /products. Each product answers to `productControl` on its own: those this
 * user may not change are left as they are and named in the result, rather
 * than one foreign product refusing the whole batch.
 */
export const setProductsInspectionRequirement = command(
	productsRequirementSchema,
	async (input) => {
		const user = await requireAuth();
		const systemAdmin = await isSystemAdmin(user.id);
		const managed = systemAdmin ? [] : await managedOrgIds(user.id);
		if (!systemAdmin && managed.length === 0) appError(403, 'product_edit_forbidden');
		const type = await requireInspectionType(input.typeId ?? DEFAULT_INSPECTION_TYPE_ID);

		const found = await prisma.product.findMany({
			where: { id: { in: input.productIds } },
			select: {
				id: true,
				name: true,
				createdById: true,
				isLicense: true,
				inspectionTypes: { select: { typeId: true, required: true } },
				category: { select: { inspectionTypes: { select: { typeId: true } } } }
			}
		});
		const products = found.map((p) => ({ ...p, own: inspectionOverride(p, type.id) }));
		const allowed: typeof products = [];
		const refused: string[] = [];
		for (const product of products) {
			const control = await productControl({ id: user.id, systemAdmin, managed }, product);
			if (control.allowed) allowed.push(product);
			else refused.push(product.name);
		}
		const changing = allowed.filter((p) => p.own !== input.required);
		const changingIds = changing.map((p) => p.id);

		const changedUnits = changing.length
			? await prisma.$transaction(async (tx) => {
					await tx.productInspectionType.deleteMany({
						where: { productId: { in: changingIds }, typeId: type.id }
					});
					if (input.required !== null) {
						await tx.productInspectionType.createMany({
							data: changingIds.map((productId) => ({
								productId,
								typeId: type.id,
								required: input.required!
							}))
						});
					}
					return applyInspectionRequirement(tx, user.id, changingIds, [type.id]);
				})
			: [];
		for (const product of changing) {
			await logCatalogChange({
				userId: user.id,
				action: 'PRODUCT_UPDATED',
				productId: product.id,
				data: {
					changes: [
						{
							field: inspectionField(type.id),
							from: product.own?.toString() ?? null,
							to: input.required?.toString() ?? null
						}
					]
				}
			});
		}
		if (changing.length > 0) await refreshRequirementViews(changedUnits);
		return { products: changing.length, units: changedUnits.length, refused };
	}
);

// ── Inspection types (system admin) ────────────────────────────────────────

const typeFieldsSchema = {
	nameDe: v.optional(v.nullable(v.string())),
	sortOrder: v.optional(v.pipe(v.number(), v.integer())),
	failStatus: v.optional(v.picklist(INSPECTION_FAIL_STATUSES)),
	requiresQualification: v.optional(v.boolean()),
	hasMeasurements: v.optional(v.boolean()),
	defaultIntervalMonths: v.optional(
		v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(120)))
	)
};

export const createInspectionType = command(
	v.object({ name: v.string(), ...typeFieldsSchema }),
	async (input) => {
		const user = await requireAuth();
		const type = await createInspectionTypeRecord(user.id, input);
		await getInspectionTypes().refresh();
		return { id: type.id };
	}
);

export const updateInspectionType = command(
	v.object({ typeId: v.string(), name: v.optional(v.string()), ...typeFieldsSchema }),
	async ({ typeId, ...input }) => {
		const user = await requireAuth();
		const { unitsChanged } = await updateInspectionTypeRecord(user.id, typeId, input);
		await getInspectionTypes().refresh();
		if (unitsChanged.length) await refreshInspectionViews(unitsChanged, []);
		return { unitsChanged: unitsChanged.length };
	}
);

// ── Qualifications ─────────────────────────────────────────────────────────

/** The caller's valid qualifications, per org and type — what the inspection dialog offers. */
export const getMyQualifications = query(async () => {
	const user = await requireAuth();
	return myQualifications(user.id);
});

/** Every member's qualifications in an org, for its member list. */
export const getOrgQualifications = query(v.string(), async (organizationId: string) => {
	const user = await requireAuth();
	return orgQualifications(user.id, organizationId);
});

export const setMemberQualification = command(
	v.object({
		membershipId: v.string(),
		typeId: v.string(),
		title: v.nullable(v.string()),
		validUntil: v.nullable(v.string())
	}),
	async (input) => {
		await requireAuth();
		const { organizationId } = await setMemberQualificationRecord(input);
		await Promise.all([
			getOrgQualifications(organizationId).refresh(),
			getMyQualifications().refresh()
		]);
	}
);

/**
 * A defect found on a unit, usually while taking it back: a failed visual
 * check with what is wrong, which puts the unit in maintenance. MEMBER+.
 */
export const reportDefect = command(
	v.object({ assetId: v.string(), notes: v.pipe(v.string(), v.maxLength(2000)) }),
	async (input) => {
		const user = await requireAuth();
		const result = await reportDefectRecord(user.id, input.assetId, input.notes);
		await refreshInspectionViews([input.assetId], result.statusChanged ? [input.assetId] : []);
		return result;
	}
);
