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
import { updateCategory, updateProduct } from '#lib/server/services/products.js';
import { logCatalogChange } from '#lib/server/services/catalog-log.js';
import { ACTIVE_ASSET_WHERE } from '#lib/asset-status.js';
import { appError } from '#lib/errors.js';
import { INSPECTION_RESULTS } from '#lib/inspection-due.js';
import { ROLE_FOR, roleAtLeast } from '#lib/roles.js';
import {
	applyInspectionRequirement,
	INSPECTION_REQUIRED_WHERE,
	deleteInspection as deleteInspectionRecord,
	mainsConnectorNames,
	mainsConnectorsByProduct,
	parseInspectionDate,
	recordInspections,
	refreshInspectionDue
} from '#lib/server/services/inspections.js';
import {
	getAsset,
	getAssetHistory,
	getAssets,
	getCategories,
	getProductCatalog
} from '#lib/remote/assets.remote.js';
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

/**
 * The caller's orgs that have units needing inspection but no default interval.
 * New units there get no interval, so they are never due and never listed —
 * the inspections page says so rather than staying quietly empty. Memberships
 * only, even for a system admin: it is a nudge to whoever runs the org.
 */
export const getOrgsWithoutInspectionInterval = query(async () => {
	const user = await requireAuth();
	const memberships = await prisma.orgMembership.findMany({
		where: {
			userId: user.id,
			organization: {
				defaultInspectionIntervalMonths: null,
				assets: { some: { ...ACTIVE_ASSET_WHERE, product: INSPECTION_REQUIRED_WHERE } }
			}
		},
		select: {
			role: true,
			organization: { select: { id: true, name: true, shortName: true } }
		},
		orderBy: { organization: { name: 'asc' } }
	});
	return memberships.map((m) => ({
		...m.organization,
		// The interval is an org setting, which `updateOrg` leaves to its OWNER.
		canEdit: roleAtLeast(m.role, ROLE_FOR.organization)
	}));
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
	/** Null follows the category. */
	requiresInspection: v.nullable(v.boolean())
});

/**
 * Whether a product's units need DGUV inspections, overriding its category.
 * It is a fact about the product, so it answers to the same rule as its name
 * (`productControl`), and it moves the interval of every unit of it.
 */
export const setProductInspectionRequirement = command(productRequirementSchema, async (input) => {
	const user = await requireAuth();
	const { unitsChanged, changed } = await updateProduct(user.id, input);
	if (changed) await refreshRequirementViews(unitsChanged);
	return { changed: unitsChanged.length };
});

const categoryRequirementSchema = v.object({
	categoryId: v.string(),
	requiresInspection: v.boolean()
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
		const { unitsChanged, changed } = await updateCategory(user.id, input);
		if (changed) await refreshRequirementViews(unitsChanged);
		return { changed: unitsChanged.length };
	}
);

const productsRequirementSchema = v.object({
	productIds: v.pipe(v.array(v.string()), v.minLength(1)),
	/** Null follows the category. */
	requiresInspection: v.nullable(v.boolean())
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

		const products = await prisma.product.findMany({
			where: { id: { in: input.productIds } },
			select: { id: true, name: true, createdById: true, requiresInspection: true }
		});
		const allowed: typeof products = [];
		const refused: string[] = [];
		for (const product of products) {
			const control = await productControl({ id: user.id, systemAdmin, managed }, product);
			if (control.allowed) allowed.push(product);
			else refused.push(product.name);
		}
		const changing = allowed.filter((p) => p.requiresInspection !== input.requiresInspection);

		const changedUnits = changing.length
			? await prisma.$transaction(async (tx) => {
					await tx.product.updateMany({
						where: { id: { in: changing.map((p) => p.id) } },
						data: { requiresInspection: input.requiresInspection }
					});
					return applyInspectionRequirement(
						tx,
						user.id,
						changing.map((p) => p.id)
					);
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
							field: 'requiresInspection',
							from: product.requiresInspection?.toString() ?? null,
							to: input.requiresInspection?.toString() ?? null
						}
					]
				}
			});
		}
		if (changing.length > 0) await refreshRequirementViews(changedUnits);
		return { products: changing.length, units: changedUnits.length, refused };
	}
);
