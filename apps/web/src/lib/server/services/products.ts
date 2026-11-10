import { prisma } from '#lib/server/auth.js';
import { appError } from '#lib/errors.js';
import { isSystemAdmin, managedOrgIds, writableOrgIds } from '#lib/server/services/access.js';
import { productControl } from '#lib/server/services/product-control.js';
import { assertProductNameFree } from '#lib/server/services/product-name.js';
import { fieldChanges, logCatalogChange } from '#lib/server/services/catalog-log.js';
import { ensureConnectors, sameConnectorName } from '#lib/server/services/connectors.js';
import { waySnapshot, writeWays } from '#lib/server/services/cable-ways.js';
import { CABLE_ENDS, withCableNames, withEndNames } from '#lib/server/services/cable-ends.js';
import { applyInspectionRequirement } from '#lib/server/services/inspections.js';
import { normalizeCable, normalizeWays, sameWays, type CableWayAttrs } from '#lib/cable.js';
import { ACTIVE_ASSET_WHERE } from '#lib/asset-status.js';
import {
	normalizePorts,
	portSnapshot,
	samePorts,
	writePorts,
	type PortInput
} from '#lib/server/services/product-ports.js';

// Changing a product or a category, shared by the web's remote functions and
// `/api/v1`. The caller validates the input's shape and decides what to
// refresh; the rules about who may change what, and the catalog log, are here
// so both surfaces apply them the same way.

export type CableAttrsInput = {
	cableType?: string | null;
	connectorA?: string | null;
	connectorB?: string | null;
	lengthCm?: number | null;
	ways?: Partial<CableWayAttrs>[];
};

export type ProductUpdateInput = {
	productId: string;
	name?: string;
	/** `undefined` leaves the maker alone; `null` says the product has none. */
	manufacturerId?: string | null;
	categoryId?: string;
	imagePath?: string;
	/**
	 * `undefined` leaves the cable columns alone; `null` says this is not a cable
	 * any more and clears all four, the loom's ways included. Anything else
	 * replaces them wholesale — a cable's attributes describe one physical thing
	 * and are edited together.
	 */
	cable?: CableAttrsInput | null;
	/** Whether units of this product are licences carrying credentials. */
	isLicense?: boolean;
	/** What the team calls it, and the longer notes. `''` clears either. */
	caption?: string;
	details?: string;
	/**
	 * Whether its units need DGUV inspections, overriding the category. `null`
	 * follows the category again; `undefined` leaves it alone.
	 */
	requiresInspection?: boolean | null;
};

export type ProductUpdateResult = Awaited<ReturnType<typeof updateProduct>>;

/**
 * Edits a product. Identity (name, maker, category, cable, licence, caption,
 * details) and whether it needs inspecting answer to `productControl`; a first
 * picture is open to any MEMBER+. A change that moves whether its units need
 * inspecting moves their intervals too (`applyInspectionRequirement`).
 */
export async function updateProduct(userId: string, input: ProductUpdateInput) {
	const systemAdmin = await isSystemAdmin(userId);
	const managed = systemAdmin ? [] : await managedOrgIds(userId);

	const previousProduct = withEndNames(
		await prisma.product.findUniqueOrThrow({
			where: { id: input.productId },
			select: {
				createdById: true,
				name: true,
				manufacturerId: true,
				categoryId: true,
				imagePath: true,
				cableType: true,
				connectorARef: { select: { name: true } },
				connectorBRef: { select: { name: true } },
				lengthCm: true,
				isLicense: true,
				caption: true,
				details: true,
				requiresInspection: true
			}
		})
	);

	// What a cable *is* — its type, its ends or its ways, its length — is identity
	// in exactly the way a name is: it decides which product a unit belongs to,
	// and every packing list groups by it. Normalised on both sides so a blank
	// field arriving as '' doesn't read as a change from null.
	const nextCable =
		input.cable === undefined
			? undefined
			: input.cable === null
				? { cableType: null, connectorA: null, connectorB: null, lengthCm: null }
				: normalizeCable(input.cable);
	// The ways travel with the cable: clearing it clears them, and a lead that
	// never had any keeps an empty list rather than a null nobody can compare.
	const nextWays = input.cable === undefined ? undefined : normalizeWays(input.cable?.ways);
	const previousWays = await waySnapshot(input.productId);
	// Being a licence is identity as well: it decides whether every unit of the
	// product carries credentials. Never both a cable and a licence.
	const nextIsLicense =
		input.isLicense === undefined ? undefined : input.isLicense && !nextCable?.cableType;
	const licenseChanged = nextIsLicense !== undefined && nextIsLicense !== previousProduct.isLicense;
	const waysChanged = nextWays !== undefined && !sameWays(previousWays, nextWays);
	const cableChanged =
		waysChanged ||
		(nextCable !== undefined &&
			(nextCable.cableType !== previousProduct.cableType ||
				!sameConnectorName(nextCable.connectorA, previousProduct.connectorA) ||
				!sameConnectorName(nextCable.connectorB, previousProduct.connectorB) ||
				nextCable.lengthCm !== previousProduct.lengthCm));
	const inspectionChanged =
		input.requiresInspection !== undefined &&
		input.requiresInspection !== previousProduct.requiresInspection;

	// Identity (name, manufacturer, category) follows the same rule as
	// `mergeProducts` — see `productControl`: whoever's gear it is controls what
	// it is called. Recategorizing is identity *and* money: the category decides
	// which rental rate other orgs' offers apply.
	// Caption and details are shared text every org reads, so they answer to
	// the same rule as the name rather than being open to anyone. So does
	// whether it needs inspecting: a fact about the product, and it moves the
	// interval of every unit of it.
	const nextCaption = input.caption === undefined ? undefined : input.caption.trim() || null;
	const nextDetails = input.details === undefined ? undefined : input.details.trim() || null;
	const changesIdentity =
		(nextCaption !== undefined && nextCaption !== previousProduct.caption) ||
		(nextDetails !== undefined && nextDetails !== previousProduct.details) ||
		(input.name !== undefined && input.name.trim() !== previousProduct.name) ||
		(input.manufacturerId !== undefined &&
			input.manufacturerId !== previousProduct.manufacturerId) ||
		(input.categoryId !== undefined && input.categoryId !== previousProduct.categoryId) ||
		cableChanged ||
		licenseChanged ||
		inspectionChanged;

	// A first picture is a contribution and open to anyone who works in an org
	// at all. Replacing or removing one somebody else took is not: that was the
	// way to deface the whole catalog with nothing but an account.
	const nextImagePath = input.imagePath === undefined ? undefined : input.imagePath.trim() || null;
	const imageChanged = nextImagePath !== undefined && nextImagePath !== previousProduct.imagePath;
	const replacesImage = imageChanged && !!previousProduct.imagePath;

	if (changesIdentity || replacesImage) {
		if (!systemAdmin && managed.length === 0) {
			// The message matters here: the product wizard is reachable by any member,
			// and "Internal Error" would look like a broken save rather than a missing
			// right.
			appError(403, 'product_edit_forbidden');
		}
		const control = await productControl(
			{ id: userId, systemAdmin, managed },
			{ id: input.productId, createdById: previousProduct.createdById }
		);
		if (!control.allowed) {
			if (control.reason === 'foreign_units') {
				appError(403, 'product_units_other_orgs', [control.orgNames]);
			}
			appError(403, 'product_unowned_not_creator', [previousProduct.name]);
		}
	} else if (imageChanged && !systemAdmin && (await writableOrgIds(userId)).length === 0) {
		appError(403, 'product_edit_forbidden');
	}

	if (input.name || input.manufacturerId !== undefined) {
		await assertProductNameFree(
			input.name || previousProduct.name,
			input.manufacturerId !== undefined ? input.manufacturerId : previousProduct.manufacturerId,
			{ exceptId: input.productId }
		);
	}

	// Only now, past the rights check: resolving a name nobody has used before
	// creates its connector row. Stored and logged in the catalogue's spelling.
	const connectors =
		nextCable === undefined
			? null
			: await ensureConnectors([nextCable.connectorA, nextCable.connectorB]);
	const storedCable = nextCable && connectors ? connectors.ends(nextCable) : undefined;

	// Before the row, so the product that comes back already carries them.
	const createdForWays = waysChanged && nextWays ? await writeWays(input.productId, nextWays) : [];

	const product = await prisma.product.update({
		where: { id: input.productId },
		data: {
			...(input.name ? { name: input.name.trim() } : {}),
			...(input.manufacturerId !== undefined ? { manufacturerId: input.manufacturerId } : {}),
			...(input.categoryId ? { categoryId: input.categoryId } : {}),
			imagePath: nextImagePath,
			...(storedCable ?? {}),
			...(nextIsLicense !== undefined ? { isLicense: nextIsLicense } : {}),
			...(nextCaption !== undefined ? { caption: nextCaption } : {}),
			...(nextDetails !== undefined ? { details: nextDetails } : {}),
			...(inspectionChanged ? { requiresInspection: input.requiresInspection } : {})
		},
		include: { manufacturer: true, category: true, ...CABLE_ENDS }
	});

	const changes = fieldChanges(previousProduct, {
		...(input.name ? { name: input.name.trim() } : {}),
		...(input.manufacturerId !== undefined ? { manufacturerId: input.manufacturerId } : {}),
		...(input.categoryId ? { categoryId: input.categoryId } : {}),
		...(nextImagePath !== undefined ? { imagePath: nextImagePath } : {}),
		// Names, not ids: the log is read by people, and a revert resolves the
		// name again in case the row it once pointed at is gone.
		...(nextCable && connectors
			? {
					cableType: nextCable.cableType,
					connectorA: connectors.name(nextCable.connectorA),
					connectorB: connectors.name(nextCable.connectorB),
					lengthCm: nextCable.lengthCm
				}
			: {}),
		...(nextIsLicense !== undefined ? { isLicense: nextIsLicense } : {}),
		...(nextCaption !== undefined ? { caption: nextCaption } : {}),
		...(nextDetails !== undefined ? { details: nextDetails } : {})
	});
	// The loom is logged as the whole list on both sides, like a device's panel:
	// a way has no id a revert could match, so what it can put back is the list.
	if (waysChanged && nextWays) {
		changes.push({ field: 'ways', from: previousWays, to: nextWays });
	}
	// As text, the way the requirement has always been logged — null is
	// "follows the category".
	if (inspectionChanged) {
		changes.push({
			field: 'requiresInspection',
			from: previousProduct.requiresInspection?.toString() ?? null,
			to: input.requiresInspection?.toString() ?? null
		});
	}
	if (changes.length > 0) {
		await logCatalogChange({
			userId,
			action: 'PRODUCT_UPDATED',
			productId: product.id,
			manufacturerId: product.manufacturerId,
			data: { changes }
		});
	}

	// A new category, becoming a licence, or the product's own answer can change
	// whether its units need DGUV inspections — see `requiresInspection`.
	const unitsChanged =
		product.categoryId !== previousProduct.categoryId || licenseChanged || inspectionChanged
			? await applyInspectionRequirement(prisma, userId, [product.id])
			: [];

	return {
		product: withCableNames(product),
		changed: changes.length > 0,
		imageChanged,
		cableChanged,
		connectorsCreated: (connectors?.created.length ?? 0) + createdForWays.length > 0,
		/** Units whose inspection interval moved. */
		unitsChanged
	};
}

export type CategoryUpdateInput = {
	categoryId: string;
	name?: string;
	nameDe?: string | null;
	color?: string;
	sortOrder?: number;
	/** Which contacts feed, on a cable in this department. See $lib/cable. */
	cableInputGender?: 'male' | 'female' | null;
	/** Whether units in it need DGUV inspections, unless their product says otherwise. */
	requiresInspection?: boolean;
};

/**
 * Categories are global, not per-org — one org renaming "Light" would rename it
 * on every other org's assets — so editing them is a system-admin action.
 * `name` stays the English source name; `nameDe` is what the German UI and a
 * German billing document show. Changing `requiresInspection` moves the
 * interval of every unit whose product follows the category.
 */
export async function updateCategory(userId: string, input: CategoryUpdateInput) {
	if (!(await isSystemAdmin(userId))) appError(403, 'admin_required');

	const data: {
		name?: string;
		nameDe?: string | null;
		color?: string;
		sortOrder?: number;
		cableInputGender?: string | null;
	} = {};
	if (input.name !== undefined) {
		const name = input.name.trim();
		if (!name) appError(400, 'category_name_required');
		const clash = await prisma.category.findFirst({
			where: { name, id: { not: input.categoryId } },
			select: { id: true }
		});
		if (clash) appError(409, 'category_exists', [name]);
		data.name = name;
	}
	if (input.nameDe !== undefined) data.nameDe = input.nameDe?.trim() || null;
	if (input.color !== undefined) data.color = input.color;
	if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
	if (input.cableInputGender !== undefined) data.cableInputGender = input.cableInputGender ?? null;

	const previous = await prisma.category.findUniqueOrThrow({
		where: { id: input.categoryId },
		select: {
			name: true,
			nameDe: true,
			color: true,
			sortOrder: true,
			cableInputGender: true,
			requiresInspection: true
		}
	});
	const inspectionChanged =
		input.requiresInspection !== undefined &&
		input.requiresInspection !== previous.requiresInspection;

	const { category, unitsChanged } = await prisma.$transaction(async (tx) => {
		const category = await tx.category.update({
			where: { id: input.categoryId },
			data: {
				...data,
				...(inspectionChanged ? { requiresInspection: input.requiresInspection } : {})
			}
		});
		if (!inspectionChanged) return { category, unitsChanged: [] as string[] };
		const following = await tx.product.findMany({
			where: { categoryId: category.id, requiresInspection: null },
			select: { id: true }
		});
		const unitsChanged = await applyInspectionRequirement(
			tx,
			userId,
			following.map((p) => p.id)
		);
		return { category, unitsChanged };
	});

	const { requiresInspection: wasRequired, ...previousFields } = previous;
	const changes = fieldChanges(previousFields, data);
	if (inspectionChanged) {
		changes.push({
			field: 'requiresInspection',
			from: String(wasRequired),
			to: String(input.requiresInspection)
		});
	}
	if (changes.length > 0) {
		await logCatalogChange({
			userId,
			action: 'CATEGORY_UPDATED',
			categoryId: category.id,
			data: { changes }
		});
	}
	return { category, changed: changes.length > 0, unitsChanged };
}

/**
 * The connectors built into a device, replaced as one list.
 *
 * Follows the picture rule rather than the identity rule, because a panel is
 * the same kind of thing: a description someone looked up, not what decides
 * which product a unit is. So the first panel is open to anyone who works in
 * an org at all, and changing one somebody already entered answers to
 * `productControl` like a replaced picture does.
 */
export async function setProductPorts(
	userId: string,
	productId: string,
	ports: readonly PortInput[]
) {
	const systemAdmin = await isSystemAdmin(userId);
	const product = await prisma.product.findUniqueOrThrow({
		where: { id: productId },
		select: { id: true, name: true, createdById: true, manufacturerId: true }
	});
	const before = await portSnapshot(product.id);
	const next = normalizePorts(ports);
	if (samePorts(before, next)) return { changed: false };

	if (!systemAdmin) {
		if (before.length === 0) {
			if ((await writableOrgIds(userId)).length === 0) appError(403, 'product_edit_forbidden');
		} else {
			const managed = await managedOrgIds(userId);
			if (managed.length === 0) appError(403, 'product_edit_forbidden');
			const control = await productControl({ id: userId, systemAdmin, managed }, product);
			if (!control.allowed) {
				if (control.reason === 'foreign_units') {
					appError(403, 'product_units_other_orgs', [control.orgNames]);
				}
				appError(403, 'product_unowned_not_creator', [product.name]);
			}
		}
	}

	await writePorts(product.id, next);
	await logCatalogChange({
		userId,
		action: 'PRODUCT_UPDATED',
		productId: product.id,
		manufacturerId: product.manufacturerId,
		data: { changes: [{ field: 'ports', from: before, to: await portSnapshot(product.id) }] }
	});
	return { changed: true };
}

/** What `/api/v1`'s catalog endpoints load of a product. */
export const CATALOG_PRODUCT_INCLUDE = {
	manufacturer: true,
	category: true,
	...CABLE_ENDS,
	ports: { include: { connector: { select: { name: true } } }, orderBy: { sortOrder: 'asc' } }
} as const;

/**
 * Per product: its active units in the given orgs (every org when `orgIds` is
 * null), those that carry an inspection interval, and those due by `now`.
 */
export async function catalogUnitCounts(
	productIds: string[],
	orgIds: string[] | null,
	now = new Date()
) {
	const scope = {
		productId: { in: productIds },
		...ACTIVE_ASSET_WHERE,
		...(orgIds ? { organizationId: { in: orgIds } } : {})
	};
	const [active, tracked, overdue] = await Promise.all([
		prisma.asset.groupBy({ by: ['productId'], where: scope, _count: { _all: true } }),
		prisma.asset.groupBy({
			by: ['productId'],
			where: { ...scope, inspectionIntervalMonths: { not: null } },
			_count: { _all: true }
		}),
		prisma.asset.groupBy({
			by: ['productId'],
			where: { ...scope, nextInspectionDue: { lte: now } },
			_count: { _all: true }
		})
	]);
	const byProduct = (rows: { productId: string; _count: { _all: number } }[]) =>
		new Map(rows.map((r) => [r.productId, r._count._all]));
	const a = byProduct(active);
	const t = byProduct(tracked);
	const o = byProduct(overdue);
	return (productId: string) => ({
		active: a.get(productId) ?? 0,
		tracked: t.get(productId) ?? 0,
		overdue: o.get(productId) ?? 0
	});
}
