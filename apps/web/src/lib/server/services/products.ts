import { prisma } from '#lib/server/auth.js';
import type { Prisma } from '#lib/prisma/client.js';
import type { FieldChange } from '#lib/types/asset-transaction.js';
import { productLabel } from '#lib/product-label.js';
import { redrawPreviewsOf } from '#lib/server/services/bundle-image.js';
import { appError } from '#lib/errors.js';
import { isSystemAdmin, managedOrgIds, writableOrgIds } from '#lib/server/services/access.js';
import { productControl } from '#lib/server/services/product-control.js';
import { assertProductNameFree } from '#lib/server/services/product-name.js';
import { fieldChanges, logCatalogChange } from '#lib/server/services/catalog-log.js';
import { ensureConnectors, sameConnectorName } from '#lib/server/services/connectors.js';
import { waySnapshot, writeWays, type WayInput } from '#lib/server/services/cable-ways.js';
import { CABLE_ENDS, withCableNames, withEndNames } from '#lib/server/services/cable-ends.js';
import { applyInspectionRequirement } from '#lib/server/services/inspections.js';
import { DEFAULT_INSPECTION_TYPE_ID } from '#lib/inspection-due.js';
import {
	isCable,
	normalizeCable,
	normalizeWays,
	sameWays,
	type CableInput,
	type CableWayAttrs
} from '#lib/cable.js';
import { ACTIVE_ASSET_WHERE } from '#lib/asset-status.js';
import {
	normalizePorts,
	portSnapshot,
	samePorts,
	writePorts,
	type PortInput,
	type PortSnapshot
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

export type ProductCreateInput = {
	name: string;
	/** `null` files it without one — a product nobody makes in particular. */
	manufacturerId: string | null;
	categoryId: string;
	caption?: string | null;
	imagePath?: string | null;
	/** Ignored on a cable: a cable is a physical thing, a product can't be both. */
	isLicense?: boolean;
	/** Already normalized (`normalizeCable`); null for anything that isn't a cable. */
	cable?: CableInput | null;
	/** A loom's ways, normalized (`normalizeWays`). */
	ways?: CableWayAttrs[];
};

/**
 * A new catalogue row, by the rules every way of making one shares: the
 * category has to exist, the name has to be free for its maker
 * (`assertProductNameFree`), the ends become connector rows, and the product
 * answers to whoever made it (`createdById`) until somebody holds units of it.
 *
 * Who may make one is the caller's to check — the web and `/api/v1` both ask
 * for ADMIN of the org the units are for. So is any price, which is per-org.
 * Nothing is logged: the catalog log records changes to a product, and its
 * category's inspection defaults apply to a product with no overrides of its own.
 */
export async function createProduct(userId: string, input: ProductCreateInput) {
	const name = input.name.trim();
	if (!name) appError(400, 'product_required');
	const category = await prisma.category.findUnique({
		where: { id: input.categoryId },
		select: { id: true }
	});
	if (!category) appError(404, 'record_not_found');

	const cable = input.cable ?? null;
	const ways = input.ways ?? [];
	// A loom's ends are ends like any other: they belong in the connector
	// catalogue, where a picture and a department can be hung on them.
	const connectors = await ensureConnectors([
		cable?.connectorA,
		cable?.connectorB,
		...ways.flatMap((w) => [w.connectorA, w.connectorB])
	]);
	await assertProductNameFree(name, input.manufacturerId);
	const product = await prisma.product.create({
		data: {
			name,
			manufacturerId: input.manufacturerId,
			categoryId: category.id,
			caption: input.caption?.trim() || null,
			imagePath: input.imagePath?.trim() || null,
			...(cable ? connectors.ends(cable) : {}),
			isLicense: !cable && !!input.isLicense,
			createdById: userId,
			ways:
				ways.length > 0
					? { create: ways.map((w, sortOrder) => ({ ...connectors.ends(w), sortOrder })) }
					: undefined
		},
		include: { manufacturer: true, category: true, ...CABLE_ENDS }
	});
	return { product, connectorsCreated: connectors.created };
}

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
	/**
	 * Its units are never swapped for one another in a kit or on a unit — see
	 * services/unit-swap.ts.
	 */
	notInterchangeable?: boolean;
	/** Its units are pack cases — see "Pack cases" in CLAUDE.md. */
	isContainer?: boolean;
	/** What the team calls it, and the longer notes. `''` clears either. */
	caption?: string;
	details?: string;
	/**
	 * Per inspection type id, whether its units need that type, overriding the
	 * category. `null` follows the category again; a type left out is left alone.
	 */
	inspections?: Record<string, boolean | null>;
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
				notInterchangeable: true,
				isContainer: true,
				caption: true,
				details: true,
				inspectionTypes: { select: { typeId: true, required: true } }
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
	// Whether its units may be swapped is a fact about the product every org
	// that holds units of it lives with, so it is identity as well.
	const interchangeChanged =
		input.notInterchangeable !== undefined &&
		input.notInterchangeable !== previousProduct.notInterchangeable;
	// Whether its units hold what is packed into them changes every
	// production's lists, so it is identity too.
	const containerChanged =
		input.isContainer !== undefined && input.isContainer !== previousProduct.isContainer;
	const waysChanged = nextWays !== undefined && !sameWays(previousWays, nextWays);
	const cableChanged =
		waysChanged ||
		(nextCable !== undefined &&
			(nextCable.cableType !== previousProduct.cableType ||
				!sameConnectorName(nextCable.connectorA, previousProduct.connectorA) ||
				!sameConnectorName(nextCable.connectorB, previousProduct.connectorB) ||
				nextCable.lengthCm !== previousProduct.lengthCm));
	const inspectionChanges = await overrideChanges(
		previousProduct.inspectionTypes,
		input.inspections
	);
	const inspectionChanged = inspectionChanges.length > 0;

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
		interchangeChanged ||
		containerChanged ||
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
			...(input.notInterchangeable !== undefined
				? { notInterchangeable: input.notInterchangeable }
				: {}),
			...(input.isContainer !== undefined ? { isContainer: input.isContainer } : {}),
			...(nextCaption !== undefined ? { caption: nextCaption } : {}),
			...(nextDetails !== undefined ? { details: nextDetails } : {})
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
		...(input.notInterchangeable !== undefined
			? { notInterchangeable: input.notInterchangeable }
			: {}),
		...(input.isContainer !== undefined ? { isContainer: input.isContainer } : {}),
		...(nextCaption !== undefined ? { caption: nextCaption } : {}),
		...(nextDetails !== undefined ? { details: nextDetails } : {})
	});
	// The loom is logged as the whole list on both sides, like a device's panel:
	// a way has no id a revert could match, so what it can put back is the list.
	if (waysChanged && nextWays) {
		changes.push({ field: 'ways', from: previousWays, to: nextWays });
	}
	// One entry per type, as text the way the requirement has always been
	// logged — null is "follows the category".
	if (inspectionChanged) {
		await writeOverrides(prisma, input.productId, inspectionChanges);
		changes.push(...inspectionChanges.map(inspectionFieldChange));
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
	const everyType = product.categoryId !== previousProduct.categoryId || licenseChanged;
	const unitsChanged =
		everyType || inspectionChanged
			? await applyInspectionRequirement(
					prisma,
					userId,
					[product.id],
					everyType ? undefined : inspectionChanges.map((c) => c.typeId)
				)
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

/** The catalog log's field for one inspection type's requirement. */
export function inspectionField(typeId: string) {
	return `inspection:${typeId}`;
}

/**
 * The inspection type a logged field is about, or null. `requiresInspection`
 * is how entries from before inspection types name the electrical one.
 */
export function inspectionFieldType(field: string): string | null {
	if (field === 'requiresInspection') return DEFAULT_INSPECTION_TYPE_ID;
	return field.startsWith('inspection:') ? field.slice('inspection:'.length) : null;
}

type OverrideChange = { typeId: string; from: boolean | null; to: boolean | null };

/** Which of a product's per-type answers `next` changes, refusing unknown types. */
async function overrideChanges(
	current: { typeId: string; required: boolean }[],
	next: Record<string, boolean | null> | undefined
): Promise<OverrideChange[]> {
	if (!next) return [];
	const own = new Map(current.map((t) => [t.typeId, t.required]));
	const changes = Object.entries(next)
		.map(([typeId, to]) => ({ typeId, from: own.get(typeId) ?? null, to }))
		.filter((c) => c.from !== c.to);
	if (changes.length) {
		const known = await prisma.inspectionType.count({
			where: { id: { in: changes.map((c) => c.typeId) } }
		});
		if (known !== changes.length) appError(404, 'inspection_type_not_found');
	}
	return changes;
}

async function writeOverrides(
	tx: Pick<Prisma.TransactionClient, 'productInspectionType'>,
	productId: string,
	changes: { typeId: string; to: boolean | null }[]
) {
	for (const { typeId, to } of changes) {
		const where = { productId_typeId: { productId, typeId } };
		if (to === null) await tx.productInspectionType.deleteMany({ where: { productId, typeId } });
		else {
			await tx.productInspectionType.upsert({
				where,
				create: { productId, typeId, required: to },
				update: { required: to }
			});
		}
	}
}

function inspectionFieldChange(change: OverrideChange) {
	return {
		field: inspectionField(change.typeId),
		from: change.from?.toString() ?? null,
		to: change.to?.toString() ?? null
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
	/**
	 * Per inspection type id, whether units in it need that type unless their
	 * product says otherwise. A type left out is left alone.
	 */
	inspections?: Record<string, boolean>;
};

/**
 * Categories are global, not per-org — one org renaming "Light" would rename it
 * on every other org's assets — so editing them is a system-admin action.
 * `name` stays the English source name; `nameDe` is what the German UI and a
 * German billing document show. Changing which inspections it needs moves
 * the intervals of every unit whose product follows the category.
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
			inspectionTypes: { select: { typeId: true } }
		}
	});
	const had = new Set(previous.inspectionTypes.map((t) => t.typeId));
	const typeChanges = Object.entries(input.inspections ?? {}).filter(
		([typeId, on]) => had.has(typeId) !== on
	);
	if (typeChanges.length) {
		const known = await prisma.inspectionType.count({
			where: { id: { in: typeChanges.map(([id]) => id) } }
		});
		if (known !== typeChanges.length) appError(404, 'inspection_type_not_found');
	}
	const inspectionChanged = typeChanges.length > 0;

	const { category, unitsChanged } = await prisma.$transaction(async (tx) => {
		const category = await tx.category.update({ where: { id: input.categoryId }, data });
		if (!inspectionChanged) return { category, unitsChanged: [] as string[] };
		for (const [typeId, on] of typeChanges) {
			if (on) await tx.categoryInspectionType.create({ data: { categoryId: category.id, typeId } });
			else {
				await tx.categoryInspectionType.delete({
					where: { categoryId_typeId: { categoryId: category.id, typeId } }
				});
			}
		}
		// Those with an answer of their own for the type stay as they are;
		// applyInspectionRequirement finds that out per unit anyway.
		const following = await tx.product.findMany({
			where: { categoryId: category.id },
			select: { id: true }
		});
		const unitsChanged = await applyInspectionRequirement(
			tx,
			userId,
			following.map((p) => p.id),
			typeChanges.map(([typeId]) => typeId)
		);
		return { category, unitsChanged };
	});

	const changes = fieldChanges(previous, data);
	for (const [typeId, on] of typeChanges) {
		changes.push({ field: inspectionField(typeId), from: String(!on), to: String(on) });
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
	category: { include: { inspectionTypes: { select: { typeId: true } } } },
	inspectionTypes: { select: { typeId: true, required: true } },
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
			where: { ...scope, inspectionSchedules: { some: {} } },
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

// ── Deleting, merging, reverting ─────────────────────────────────────────────

/** Delete a catalogue row only when no unit, including a retired one, refers to it. */
export async function deleteProduct(userId: string, productId: string) {
	const systemAdmin = await isSystemAdmin(userId);
	const managed = systemAdmin ? [] : await managedOrgIds(userId);
	if (!systemAdmin && managed.length === 0) {
		appError(403, 'product_delete_forbidden');
	}

	const product = await prisma.product.findUniqueOrThrow({
		where: { id: productId },
		include: { manufacturer: true, _count: { select: { assets: true } } }
	});
	if (product._count.assets > 0) {
		appError(409, 'product_has_units');
	}
	// Without units there is no owning org, so this is the creator's call or a
	// system admin's — see `productControl`.
	const control = await productControl({ id: userId, systemAdmin, managed }, product);
	if (!control.allowed) appError(403, 'product_unowned_not_creator', [product.name]);

	await prisma.product.delete({ where: { id: productId } });
	await logCatalogChange({
		userId,
		action: 'PRODUCT_DELETED',
		productId: product.id,
		manufacturerId: product.manufacturerId,
		data: { name: product.name, manufacturerName: product.manufacturer?.name ?? null }
	});
	return { id: product.id, manufacturerId: product.manufacturerId };
}

// Nothing stops two rows describing the same device: the create-a-product path
// is a free text field by design, because the pool has to be able to register a
// thing nobody has catalogued yet. So "Robin 600" and "Robe Robin 600" both
// exist, each holding half the units, and every count, every catalogue page and
// every offer line built from them is wrong in a way that adds up.
//
// A merge is unusually cheap here because `Asset.productId` is the only foreign
// key pointing at a product. OfferItem and InvoiceItem carry a productId too,
// but as a *snapshot* with no relation (see the schema): an issued document
// says what it said, and the id there is only ever used to collapse identical
// lines on that one document. They are deliberately left alone — rewriting them
// would be editing a sent invoice to make a catalogue tidier.

export type ProductMergeInput = {
	/** Survives. Its name, manufacturer and category are the ones that remain. */
	targetProductId: string;
	/** The duplicate: its units move to the target, then the row is deleted. */
	sourceProductId: string;
};

export async function mergeProducts(
	userId: string,
	{ targetProductId, sourceProductId }: ProductMergeInput
) {
	if (targetProductId === sourceProductId) appError(409, 'product_merge_self');

	const include = {
		manufacturer: true,
		ways: { select: { id: true } },
		connectorARef: { select: { name: true } },
		connectorBRef: { select: { name: true } }
	} as const;
	const [target, source] = await Promise.all([
		prisma.product.findUniqueOrThrow({ where: { id: targetProductId }, include }),
		prisma.product.findUniqueOrThrow({ where: { id: sourceProductId }, include })
	]);

	// Retired and decommissioned units come too. They are not in
	// ACTIVE_ASSET_WHERE and no page lists them next to the rest, but they are
	// rows with a foreign key: leaving them behind would make the delete fail
	// on exactly the old, half-abandoned product a merge is aimed at.
	const moving = await prisma.asset.findMany({
		where: { productId: sourceProductId },
		select: {
			id: true,
			organizationId: true,
			bundleId: true,
			parent: { select: { productId: true } }
		}
	});

	const systemAdmin = await isSystemAdmin(userId);
	if (!systemAdmin) {
		const managed = await managedOrgIds(userId);
		if (managed.length === 0) {
			appError(403, 'product_merge_forbidden');
		}
		// A merge moves *units*, and those belong to someone. The check is on the
		// source alone because it is the only side that loses records: the
		// target's units are not touched, and what it is called does not change.
		// A duplicate nobody holds units of is its creator's to clean up.
		const control = await productControl({ id: userId, systemAdmin, managed }, source);
		if (!control.allowed) {
			if (control.reason === 'foreign_units') {
				appError(403, 'product_merge_units_other_orgs', [source.name, control.orgNames]);
			}
			appError(403, 'product_unowned_not_creator', [source.name]);
		}
	}

	// The two identities the merge picks between. Name, manufacturer and
	// category are the target's, always — that is what choosing a target
	// means. An image is not identity, it is work someone did, so an empty
	// one on the target takes the source's rather than throwing it away over
	// which card the merge happened to be started from. Per-org prices are
	// each org's own work for the same reason: a source row moves to the
	// target unless that org already priced the target itself.
	//
	// What a cable is (type, ends, length, a loom's ways) goes the same way as
	// the panel below: a target that is no cable takes the source's whole, one
	// that is keeps its own, and two are never mixed. Otherwise merging a
	// cable into a plain entry silently turned every unit into a non-cable
	// and deleted the loom's ways with the source row. A license is a license
	// whichever side said so — its units' credentials only show on one.
	const inheritsCable = !isCable(withEndNames(target)) && isCable(withEndNames(source));
	const inherited = {
		...(!target.imagePath && source.imagePath ? { imagePath: source.imagePath } : {}),
		...(inheritsCable
			? {
					cableType: source.cableType,
					connectorAId: source.connectorAId,
					connectorBId: source.connectorBId,
					lengthCm: source.lengthCm
				}
			: {}),
		...(source.isLicense && !target.isLicense ? { isLicense: true } : {}),
		// Likewise "not interchangeable": whoever said so had a reason.
		...(source.notInterchangeable && !target.notInterchangeable
			? { notInterchangeable: true }
			: {}),
		// And a pack container stays one: its units may hold a production's kit.
		...(source.isContainer && !target.isContainer ? { isContainer: true } : {})
	};

	await prisma.$transaction(async (tx) => {
		await tx.asset.updateMany({
			where: { productId: sourceProductId },
			data: { productId: targetProductId }
		});
		// What a unit *is* changed, which is the kind of thing the history exists
		// to explain: a tag that has sat on a shelf for two years now reporting a
		// different product is otherwise indistinguishable from someone having
		// mislabelled it.
		await tx.assetTransaction.createMany({
			data: moving.map((asset) => ({
				assetId: asset.id,
				userId,
				action: 'UPDATED',
				data: {
					type: 'UPDATED',
					changes: [{ field: 'product', from: productLabel(source), to: productLabel(target) }]
				}
			}))
		});
		if (Object.keys(inherited).length > 0) {
			await tx.product.update({ where: { id: targetProductId }, data: inherited });
		}
		if (inheritsCable) {
			await tx.cableWay.updateMany({
				where: { productId: sourceProductId },
				data: { productId: targetProductId }
			});
		}
		// A device's panel is the same kind of work as its picture: the target
		// takes the source's where it has none of its own, and keeps its own
		// otherwise — two panels are never mixed into one.
		const targetPorts = await tx.productPort.count({ where: { productId: targetProductId } });
		if (targetPorts === 0) {
			await tx.productPort.updateMany({
				where: { productId: sourceProductId },
				data: { productId: targetProductId }
			});
		}
		const pricedOrgs = await tx.orgProductPrice.findMany({
			where: { productId: targetProductId },
			select: { organizationId: true }
		});
		await tx.orgProductPrice.updateMany({
			where: {
				productId: sourceProductId,
				organizationId: { notIn: pricedOrgs.map((p) => p.organizationId) }
			},
			data: { productId: targetProductId }
		});
		await tx.orgProductPrice.deleteMany({ where: { productId: sourceProductId } });
		await tx.product.delete({ where: { id: sourceProductId } });
		// The merged units are the target's now, and follow its DGUV requirement.
		await applyInspectionRequirement(tx, userId, [targetProductId]);
	});

	await logCatalogChange({
		userId,
		action: 'PRODUCT_MERGED',
		productId: targetProductId,
		manufacturerId: target.manufacturerId,
		data: {
			source: { id: source.id, name: productLabel(source) },
			target: { id: target.id, name: productLabel(target) },
			movedAssets: moving.length
		}
	});

	// The moved units are a different product in every picture they are in,
	// and the target may just have inherited the source's photo.
	redrawPreviewsOf(targetProductId);

	return {
		target,
		source,
		moving,
		inheritedImage: 'imagePath' in inherited,
		inheritedCable: inheritsCable,
		inheritedLicense: 'isLicense' in inherited
	};
}

/** The product columns a `PRODUCT_UPDATED` entry can carry, and so the ones a revert may write. */
const REVERTIBLE_PRODUCT_FIELDS = [
	'name',
	'manufacturerId',
	'categoryId',
	'imagePath',
	'cableType',
	'connectorA',
	'connectorB',
	'lengthCm',
	'isLicense',
	'notInterchangeable',
	'isContainer',
	'caption',
	'details'
] as const;
type RevertibleProductField = (typeof REVERTIBLE_PRODUCT_FIELDS)[number];

/** An inspection requirement as logged, as text: 'true', 'false', or null to follow the category. */
function loggedOverride(value: unknown): boolean | null {
	return value === 'true' || value === true
		? true
		: value === 'false' || value === false
			? false
			: null;
}

/**
 * Put a product back the way one log entry found it. System admin only.
 *
 * Field by field, and only where the product still holds the value that entry
 * wrote: a field somebody has edited again since is theirs now, and rolling it
 * back would undo a change this entry knows nothing about. The revert is itself
 * logged as an update (`revertOf` names the entry), so it can be undone the
 * same way and the log never has to be rewritten.
 */
export async function revertCatalogChange(userId: string, entryId: string) {
	if (!(await isSystemAdmin(userId))) appError(403, 'admin_required');
	const entry = await prisma.catalogTransaction.findUniqueOrThrow({ where: { id: entryId } });
	const logged = (entry.data as { changes?: FieldChange[] } | null)?.changes ?? [];
	if (entry.action !== 'PRODUCT_UPDATED' || !entry.productId || logged.length === 0) {
		appError(409, 'catalog_revert_unavailable');
	}

	const found = await prisma.product.findUnique({
		where: { id: entry.productId },
		include: {
			connectorARef: { select: { name: true } },
			connectorBRef: { select: { name: true } },
			inspectionTypes: { select: { typeId: true, required: true } }
		}
	});
	if (!found) appError(409, 'catalog_revert_unavailable');
	const product = withEndNames(found);

	const data: Partial<Record<RevertibleProductField, string | number | boolean | null>> = {};
	for (const change of logged) {
		const field = REVERTIBLE_PRODUCT_FIELDS.find((f) => f === change.field);
		if (!field) continue;
		const stillHolds =
			field === 'connectorA' || field === 'connectorB'
				? // An entry older than the connector ids may spell the end differently
					// from the row the migration settled on.
					sameConnectorName(product[field], (change.to ?? null) as string | null)
				: String(product[field] ?? null) === String(change.to ?? null);
		if (!stillHolds) continue;
		data[field] = (change.from ?? null) as string | number | boolean | null;
	}

	// The per-type requirements, on the same terms: only where the product
	// still gives the answer this entry wrote. A type deleted since is skipped.
	const own = new Map(product.inspectionTypes.map((t) => [t.typeId, t.required]));
	const types = new Set(
		(await prisma.inspectionType.findMany({ select: { id: true } })).map((t) => t.id)
	);
	const inspectionRevert: OverrideChange[] = [];
	for (const change of logged) {
		const typeId = inspectionFieldType(change.field);
		if (!typeId || !types.has(typeId)) continue;
		const current = own.get(typeId) ?? null;
		if (current !== loggedOverride(change.to)) continue;
		const to = loggedOverride(change.from);
		if (to !== current) inspectionRevert.push({ typeId, from: current, to });
	}

	// A loom's ways are logged as the whole list on both sides, like the panel
	// below, and reverted on the same terms: only while the product still has
	// exactly the list this entry wrote.
	const waysChange = logged.find((change) => change.field === 'ways');
	const waysBefore = waysChange ? await waySnapshot(product.id) : [];
	let waysRevert: WayInput[] | null = null;
	if (waysChange) {
		const wrote = (waysChange.to ?? []) as unknown as WayInput[];
		if (sameWays(waysBefore, wrote)) waysRevert = (waysChange.from ?? []) as unknown as WayInput[];
	}

	// A device's panel is logged as the whole list on both sides, so it is
	// reverted the same way: only while the product still has exactly the list
	// this entry wrote. `FieldChange` types from/to as strings; for this field
	// they are the snapshots `setProductPorts` logged.
	const portsChange = logged.find((change) => change.field === 'ports');
	const portsBefore = portsChange ? await portSnapshot(product.id) : [];
	let portsRevert: PortSnapshot[] | null = null;
	if (portsChange) {
		const wrote = (portsChange.to ?? []) as unknown as PortSnapshot[];
		if (samePorts(portsBefore, wrote)) {
			const from = (portsChange.from ?? []) as unknown as PortSnapshot[];
			// A connector nobody uses any more can have been deleted since.
			const alive = new Set(
				(
					await prisma.connector.findMany({
						where: { id: { in: from.map((p) => p.connectorId) } },
						select: { id: true }
					})
				).map((c) => c.id)
			);
			portsRevert = from.filter((p) => alive.has(p.connectorId));
		}
	}
	if (
		Object.keys(data).length === 0 &&
		!portsRevert &&
		!waysRevert &&
		inspectionRevert.length === 0
	) {
		appError(409, 'catalog_revert_stale');
	}

	// The rows an old value points at can be gone — merges delete them.
	if (typeof data.manufacturerId === 'string') {
		const exists = await prisma.manufacturer.findUnique({ where: { id: data.manufacturerId } });
		if (!exists) delete data.manufacturerId;
	}
	if (typeof data.categoryId === 'string') {
		const exists = await prisma.category.findUnique({ where: { id: data.categoryId } });
		if (!exists) delete data.categoryId;
	}
	if (
		Object.keys(data).length === 0 &&
		!portsRevert &&
		!waysRevert &&
		inspectionRevert.length === 0
	) {
		appError(409, 'catalog_revert_stale');
	}
	// A revert is a rename like any other, and the old name may have been
	// taken since.
	if ('name' in data || 'manufacturerId' in data) {
		await assertProductNameFree(
			'name' in data ? (data.name as string) : product.name,
			'manufacturerId' in data ? (data.manufacturerId as string | null) : product.manufacturerId,
			{ exceptId: product.id }
		);
	}

	// The logged ends are names, so they are resolved like a form's — and a
	// connector deleted since the entry was written simply comes back.
	const endsReverted = 'connectorA' in data || 'connectorB' in data;
	const connectors = endsReverted
		? await ensureConnectors([data.connectorA as string | null, data.connectorB as string | null])
		: null;
	// What is written: the ids in place of the names. `data` itself keeps the
	// names, because it is also what the revert logs.
	const write: Record<string, unknown> = Object.fromEntries(
		Object.entries(data).filter(([field]) => field !== 'connectorA' && field !== 'connectorB')
	);
	if (connectors) {
		const ends = connectors.ends({
			connectorA: (data.connectorA ?? null) as string | null,
			connectorB: (data.connectorB ?? null) as string | null
		});
		if ('connectorA' in data) {
			data.connectorA = connectors.name(data.connectorA as string | null);
			write.connectorAId = ends.connectorAId;
		}
		if ('connectorB' in data) {
			data.connectorB = connectors.name(data.connectorB as string | null);
			write.connectorBId = ends.connectorBId;
		}
	}

	// Whether its units need inspecting can move with the category, the licence
	// flag or the flag itself, and their intervals move with it.
	const requirementTouched =
		'categoryId' in data || 'isLicense' in data || inspectionRevert.length > 0;
	const { updated, unitsChanged } = await prisma.$transaction(async (tx) => {
		const updated =
			Object.keys(write).length > 0
				? await tx.product.update({
						where: { id: product.id },
						data: write as Prisma.ProductUncheckedUpdateInput
					})
				: product;
		await writeOverrides(tx, product.id, inspectionRevert);
		const everyType = 'categoryId' in data || 'isLicense' in data;
		const unitsChanged = requirementTouched
			? await applyInspectionRequirement(
					tx,
					userId,
					[product.id],
					everyType ? undefined : inspectionRevert.map((c) => c.typeId)
				)
			: [];
		return { updated, unitsChanged };
	});
	const changes = fieldChanges(product, data);
	changes.push(...inspectionRevert.map(inspectionFieldChange));
	let createdForWays: string[] = [];
	if (waysRevert) {
		createdForWays = await writeWays(product.id, waysRevert);
		changes.push({ field: 'ways', from: waysBefore, to: await waySnapshot(product.id) });
	}
	if (portsRevert) {
		await writePorts(product.id, portsRevert);
		changes.push({ field: 'ports', from: portsBefore, to: await portSnapshot(product.id) });
	}
	await logCatalogChange({
		userId,
		action: 'PRODUCT_UPDATED',
		productId: updated.id,
		manufacturerId: updated.manufacturerId,
		data: { changes, revertOf: entry.id }
	});

	if ('imagePath' in data) redrawPreviewsOf(updated.id);
	return {
		productId: updated.id,
		unitsChanged,
		cableChanged:
			!!waysRevert ||
			(['cableType', 'connectorA', 'connectorB', 'lengthCm'] as const).some(
				(field) => field in data
			),
		connectorsCreated: (connectors?.created.length ?? 0) + createdForWays.length > 0,
		portsReverted: !!portsRevert
	};
}
