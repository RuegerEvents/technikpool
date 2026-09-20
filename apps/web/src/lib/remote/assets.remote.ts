import { query, command } from '$app/server';
import { prisma } from '$lib/server/auth';
import type { Prisma } from '$lib/prisma/client';
import * as v from 'valibot';
import type { FieldChange } from '$lib/types/asset-transaction';
import {
	isSystemAdmin,
	managedOrgIds,
	productionVisibility,
	readableOrgIds,
	readsOrgRecords,
	requireAuth,
	requireOrgInventory,
	requireOrgWrite,
	requireSystemAdmin,
	scopedOrgIds,
	userOrgIds,
	visibleProductionIds,
	visibleProductionName,
	writableOrgIds
} from '$lib/server/services/access';
import { productControl } from '$lib/server/services/product-control';
import { assetsWithSerial } from '$lib/server/services/asset-lookup';
import { fieldChanges, logCatalogChange } from '$lib/server/services/catalog-log';
import {
	ACTIVE_ASSET_WHERE,
	ASSET_STATUSES,
	BOOKABLE_ASSET_WHERE,
	isBookableStatus,
	isRetiredStatus,
	RETIRED_ASSET_WHERE
} from '$lib/asset-status';
import { syncAccessories } from '$lib/server/services/accessories';
import { ensureAssetImage, ensureBundleImage } from '$lib/server/services/bundle-image';
import {
	assertAdditionsFitType,
	assertNewInstanceMatchesType,
	bundleTypeSpec
} from '$lib/server/services/bundle-spec';
import { getProduction } from '$lib/remote/productions.remote';
import {
	CABLE_TYPE_DEFAULTS,
	CABLE_TYPE_SUGGESTIONS,
	isCable,
	normalizeCable,
	normalizeWays,
	sameWays,
	waysKey,
	type CableInput,
	type CableWayAttrs
} from '$lib/cable';
import { ensureConnectors } from '$lib/server/services/connectors';
import { waySnapshot, writeWays, type WayInput } from '$lib/server/services/cable-ways';
import {
	normalizePorts,
	portSnapshot,
	samePorts,
	writePorts,
	type PortSnapshot
} from '$lib/server/services/product-ports';
import { getConnectors, getConnectorUsage } from '$lib/remote/connectors.remote';
import { getKnownAddresses } from '$lib/remote/addresses.remote';
import { appError } from '$lib/errors';

async function ensureBundleImageWithoutBreakingRead(
	bundle: Parameters<typeof ensureBundleImage>[0]
) {
	try {
		return await ensureBundleImage(bundle);
	} catch (cause) {
		// Inventory must remain usable during an object-store outage. A later read
		// retries because the fingerprint was not persisted.
		console.error(`Could not refresh generated image for bundle "${bundle.id}":`, cause);
		return bundle.imagePath;
	}
}

async function ensureAssetImageWithoutBreakingRead(asset: Parameters<typeof ensureAssetImage>[0]) {
	try {
		return await ensureAssetImage(asset);
	} catch (cause) {
		// A generated preview is an enhancement; storage trouble must not make
		// inventory pages unavailable.
		console.error(`Could not refresh generated image for asset "${asset.id}":`, cause);
		return asset.generatedImagePath;
	}
}

// What a listing or a detail page needs to know about an asset's place in the
// accessory tree: who it hangs off, and what hangs off it. The parent is a thin
// label (the row links to it); the accessories are full rows, because they are
// rendered as sub-lines wherever their parent appears.
const PARENT_SELECT = {
	select: {
		id: true,
		assetTag: true,
		product: { select: { name: true, manufacturer: { select: { name: true } } } }
	}
} as const;

// Every list of units, everywhere, comes out in this order. Product name alone
// is not an order: a rack of twelve identical units ties on it, and Postgres
// breaks a tie in whatever order it happened to read the rows — which changes
// as soon as one of them is updated. The tag and then the id settle it, so a
// list looks the same on the second visit as on the first.
const ASSET_ORDER_BY: Prisma.AssetOrderByWithRelationInput[] = [
	{ product: { name: 'asc' } },
	// Untagged units sort after tagged ones rather than being scattered through
	// them; Postgres would put NULLs last here anyway, but only by default.
	{ assetTag: { sort: 'asc', nulls: 'last' } },
	{ id: 'asc' }
];

// Which products a bundle type is built around. Loaded wherever a preview may
// be drawn, because the answer is part of the picture — see bundle-image.ts.
const FEATURED_PRODUCTS_SELECT = { select: { id: true } } as const;

const ACCESSORIES_INCLUDE = {
	where: ACTIVE_ASSET_WHERE,
	include: {
		product: {
			include: { manufacturer: true, category: true, ways: { orderBy: { sortOrder: 'asc' } } }
		}
	},
	orderBy: ASSET_ORDER_BY
} as const;

/**
 * Of these orgs, the ones whose prices the user may see: not the ones they are
 * only a DEVICE_VIEWER of. A system admin sees every org's.
 */
async function priceVisibleOrgIds(userId: string, orgIds: string[]) {
	if (await isSystemAdmin(userId)) return orgIds;
	const readable = new Set(await readableOrgIds(userId));
	return orgIds.filter((id) => readable.has(id));
}

/** A bundle's price with the ones the user may not see taken out — see `priceVisibleOrgIds`. */
function maskBundlePrice<T extends { netPurchasePrice: unknown }>(
	bundle: T,
	organizationId: string,
	visible: string[]
): T {
	return visible.includes(organizationId) ? bundle : { ...bundle, netPurchasePrice: null };
}

export const getAssets = query(v.optional(v.string()), async (organizationId?: string) => {
	const user = await requireAuth();
	const queryOrgIds = await scopedOrgIds(user.id, organizationId);

	const assets = await prisma.asset.findMany({
		where: { organizationId: { in: queryOrgIds }, ...ACTIVE_ASSET_WHERE },
		include: {
			product: {
				include: { manufacturer: true, category: true, ways: { orderBy: { sortOrder: 'asc' } } }
			},
			location: true,
			organization: true,
			bundle: { select: { id: true, template: { select: { name: true } } } },
			parent: PARENT_SELECT,
			accessories: ACCESSORIES_INCLUDE
		},
		orderBy: ASSET_ORDER_BY
	});
	await Promise.all(assets.map((asset) => ensureAssetImageWithoutBreakingRead(asset)));
	return assets;
});

/**
 * Sold and decommissioned units, which `getAssets` deliberately leaves out.
 * Kept as its own query rather than a flag on `getAssets` so the two caches
 * stay separate — a refresh after a status change invalidates both.
 */
export const getRetiredAssets = query(v.optional(v.string()), async (organizationId?: string) => {
	const user = await requireAuth();
	const queryOrgIds = await scopedOrgIds(user.id, organizationId);

	return await prisma.asset.findMany({
		where: { organizationId: { in: queryOrgIds }, ...RETIRED_ASSET_WHERE },
		include: {
			product: {
				include: { manufacturer: true, category: true, ways: { orderBy: { sortOrder: 'asc' } } }
			},
			location: true,
			organization: true,
			bundle: { select: { id: true, template: { select: { name: true } } } },
			// Retiring detaches in both directions, so these are always empty here —
			// they are included so the two listings stay one shape for the page that
			// renders both.
			parent: PARENT_SELECT,
			accessories: ACCESSORIES_INCLUDE
		},
		orderBy: ASSET_ORDER_BY
	});
});

export const getAsset = query(v.string(), async (assetId: string) => {
	const user = await requireAuth();
	const orgIds = await userOrgIds(user.id);
	const systemAdmin = await isSystemAdmin(user.id);

	const asset = await prisma.asset.findUniqueOrThrow({
		where: { id: assetId },
		include: {
			product: {
				include: {
					manufacturer: true,
					category: true,
					ways: { orderBy: { sortOrder: 'asc' } },
					ports: { include: { connector: true }, orderBy: { sortOrder: 'asc' } }
				}
			},
			location: true,
			organization: true,
			bundle: { select: { id: true, template: { select: { name: true } } } },
			parent: PARENT_SELECT,
			accessories: ACCESSORIES_INCLUDE
		}
	});

	if (!systemAdmin && !orgIds.includes(asset.organizationId)) {
		appError(403, 'unauthorized');
	}

	await ensureAssetImageWithoutBreakingRead(asset);
	return asset;
});

export const getInventorySummary = query(
	v.optional(v.string()),
	async (organizationId?: string) => {
		const user = await requireAuth();
		const queryOrgIds = await scopedOrgIds(user.id, organizationId);

		const products = await prisma.product.findMany({
			include: {
				manufacturer: true,
				assets: {
					where: { organizationId: { in: queryOrgIds }, ...ACTIVE_ASSET_WHERE },
					select: { id: true, status: true }
				}
			},
			orderBy: { name: 'asc' }
		});

		return products
			.filter((p) => p.assets.length > 0)
			.map((p) => ({
				id: p.id,
				name: p.name,
				manufacturer: p.manufacturer,
				total: p.assets.length,
				available: p.assets.filter((a) => a.status === 'AVAILABLE').length,
				unavailable: p.assets.filter((a) => a.status === 'UNAVAILABLE').length,
				maintenance: p.assets.filter((a) => a.status === 'MAINTENANCE').length,
				broken: p.assets.filter((a) => a.status === 'BROKEN').length
			}));
	}
);

export const getManufacturers = query(async () => {
	await requireAuth();
	return await prisma.manufacturer.findMany({
		include: { _count: { select: { products: true } } },
		orderBy: { name: 'asc' }
	});
});

const updateManufacturerSchema = v.object({
	manufacturerId: v.string(),
	name: v.string(),
	generic: v.boolean()
});

// Manufacturers are global rows shared by every org, and editing or merging
// one rewrites labels on other orgs' inventory and future documents — so,
// like categories, they are system-admin territory. Creating one stays open
// (the asset wizard has to register gear nobody has catalogued yet).
export const updateManufacturer = command(updateManufacturerSchema, async (input) => {
	const user = await requireSystemAdmin();
	const name = input.name.trim();
	if (!name) appError(400, 'manufacturer_name_required');
	const clash = await prisma.manufacturer.findFirst({
		where: { name: { equals: name, mode: 'insensitive' }, id: { not: input.manufacturerId } },
		select: { id: true }
	});
	if (clash) appError(409, 'manufacturer_exists');
	const previous = await prisma.manufacturer.findUniqueOrThrow({
		where: { id: input.manufacturerId },
		select: { name: true, generic: true }
	});
	const manufacturer = await prisma.manufacturer.update({
		where: { id: input.manufacturerId },
		data: { name, generic: input.generic }
	});
	const changes = fieldChanges(previous, { name, generic: input.generic });
	if (changes.length > 0) {
		await logCatalogChange({
			userId: user.id,
			action: 'MANUFACTURER_UPDATED',
			manufacturerId: manufacturer.id,
			data: { changes }
		});
	}
	await Promise.all([
		getManufacturers().refresh(),
		getProducts().refresh(),
		getProductCatalog().refresh()
	]);
	return manufacturer;
});

const mergeManufacturersSchema = v.object({
	targetManufacturerId: v.string(),
	sourceManufacturerId: v.string()
});

export const mergeManufacturers = command(
	mergeManufacturersSchema,
	async ({ targetManufacturerId, sourceManufacturerId }) => {
		const user = await requireSystemAdmin();
		if (targetManufacturerId === sourceManufacturerId) {
			appError(409, 'manufacturer_merge_self');
		}
		const [target, source] = await Promise.all([
			prisma.manufacturer.findUniqueOrThrow({ where: { id: targetManufacturerId } }),
			prisma.manufacturer.findUniqueOrThrow({ where: { id: sourceManufacturerId } })
		]);
		const movedProducts = await prisma.product.count({ where: { manufacturerId: source.id } });
		await prisma.$transaction(async (tx) => {
			await tx.product.updateMany({
				where: { manufacturerId: source.id },
				data: { manufacturerId: target.id }
			});
			if (!target.logoPath && source.logoPath) {
				await tx.manufacturer.update({
					where: { id: target.id },
					data: { logoPath: source.logoPath }
				});
			}
			await tx.manufacturer.delete({ where: { id: source.id } });
		});
		await logCatalogChange({
			userId: user.id,
			action: 'MANUFACTURER_MERGED',
			manufacturerId: target.id,
			data: {
				source: { id: source.id, name: source.name },
				target: { id: target.id, name: target.name },
				movedProducts
			}
		});
		await Promise.all([
			getManufacturers().refresh(),
			getProducts().refresh(),
			getProducts(target.id).refresh(),
			getProducts(source.id).refresh(),
			getProductCatalog().refresh(),
			getAssets().refresh(),
			getInventorySummary().refresh()
		]);
		return { movedProducts };
	}
);

export const getCategories = query(async () => {
	await requireAuth();
	return await prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
});

const updateCategorySchema = v.object({
	categoryId: v.string(),
	name: v.optional(v.string()),
	nameDe: v.optional(v.nullable(v.string())),
	color: v.optional(v.string()),
	sortOrder: v.optional(v.number()),
	/** Which contacts feed, on a cable in this department. See $lib/cable. */
	cableInputGender: v.optional(v.nullable(v.picklist(['male', 'female'])))
});

/**
 * Categories are global, not per-org — one org renaming "Light" would rename it
 * on every other org's assets — so editing them is a system-admin action.
 * `name` stays the English source name; `nameDe` is what the German UI and a
 * German billing document show.
 */
export const updateCategory = command(updateCategorySchema, async (input) => {
	const user = await requireAuth();
	if (!(await isSystemAdmin(user.id))) appError(403, 'admin_required');

	const data: {
		name?: string;
		nameDe?: string | null;
		color?: string;
		sortOrder?: number;
		cableInputGender?: string | null;
	} = {};
	if ('name' in input) {
		const name = input.name?.trim();
		if (!name) appError(400, 'category_name_required');
		const clash = await prisma.category.findFirst({
			where: { name, id: { not: input.categoryId } },
			select: { id: true }
		});
		if (clash) appError(409, 'category_exists', [name]);
		data.name = name;
	}
	if ('nameDe' in input) data.nameDe = input.nameDe?.trim() || null;
	if ('color' in input) data.color = input.color;
	if ('sortOrder' in input) data.sortOrder = input.sortOrder;
	if ('cableInputGender' in input) data.cableInputGender = input.cableInputGender ?? null;

	const previous = await prisma.category.findUniqueOrThrow({
		where: { id: input.categoryId },
		select: {
			name: true,
			nameDe: true,
			color: true,
			sortOrder: true,
			cableInputGender: true
		}
	});
	const updated = await prisma.category.update({ where: { id: input.categoryId }, data });
	const changes = fieldChanges(previous, data);
	if (changes.length > 0) {
		await logCatalogChange({
			userId: user.id,
			action: 'CATEGORY_UPDATED',
			categoryId: updated.id,
			data: { changes }
		});
	}
	await getCategories().refresh();
	return updated;
});

export const getLocations = query(v.optional(v.string()), async (organizationId?: string) => {
	const user = await requireAuth();
	const queryOrgIds = await scopedOrgIds(user.id, organizationId);

	return await prisma.location.findMany({
		where: { organizationId: { in: queryOrgIds } },
		include: { address: true, organization: { select: { name: true, shortName: true } } },
		orderBy: { name: 'asc' }
	});
});

const addressInputSchema = v.object({
	line1: v.string(),
	line2: v.optional(v.string()),
	postalCode: v.string(),
	city: v.string()
});

const createLocationSchema = v.object({
	organizationId: v.string(),
	name: v.string(),
	address: addressInputSchema
});

export const createLocation = command(createLocationSchema, async (input) => {
	await requireOrgInventory(input.organizationId);

	const location = await prisma.$transaction(async (tx) => {
		const address = await tx.address.create({
			data: {
				line1: input.address.line1.trim(),
				line2: input.address.line2?.trim() || null,
				postalCode: input.address.postalCode.trim(),
				city: input.address.city.trim()
			}
		});

		return await tx.location.create({
			data: {
				organizationId: input.organizationId,
				name: input.name.trim(),
				addressId: address.id
			},
			include: { address: true }
		});
	});

	await getLocations(input.organizationId).refresh();
	await getLocations().refresh();
	await getKnownAddresses().refresh();
	return location;
});

const updateLocationSchema = v.object({
	locationId: v.string(),
	name: v.optional(v.string()),
	address: v.optional(addressInputSchema)
});

export const updateLocation = command(updateLocationSchema, async (input) => {
	const location = await prisma.location.findUniqueOrThrow({
		where: { id: input.locationId },
		select: { id: true, organizationId: true, addressId: true }
	});

	await requireOrgInventory(location.organizationId);

	const updated = await prisma.$transaction(async (tx) => {
		if (input.address) {
			await tx.address.update({
				where: { id: location.addressId },
				data: {
					line1: input.address.line1.trim(),
					line2: input.address.line2?.trim() || null,
					postalCode: input.address.postalCode.trim(),
					city: input.address.city.trim()
				}
			});
		}

		return await tx.location.update({
			where: { id: input.locationId },
			data: input.name ? { name: input.name.trim() } : {},
			include: { address: true }
		});
	});

	await getLocations(location.organizationId).refresh();
	await getLocations().refresh();
	await getKnownAddresses().refresh();
	return updated;
});

export const getProducts = query(v.optional(v.string()), async (manufacturerId?: string) => {
	await requireAuth();
	return await prisma.product.findMany({
		where: manufacturerId ? { manufacturerId } : undefined,
		orderBy: { name: 'asc' },
		include: { manufacturer: true, category: true, ways: { orderBy: { sortOrder: 'asc' } } }
	});
});

/**
 * The vocabulary the cable forms offer: what this pool already calls its
 * cables, merged with a starter list so day one isn't a blank field.
 * Deliberately not a lookup table — `Product.cableType` is free text, and the
 * next cable is always one nobody anticipated. What the catalogue holds wins on
 * spelling, because that is the spelling the rest of the inventory is filed
 * under.
 *
 * `byType` is the prefill: picking "Schuko" fills the connectors and the
 * category from the newest Schuko product, which is a better guess than any
 * list we could maintain — it is what this pool actually owns.
 */
export const getCableVocabulary = query(async () => {
	await requireAuth();
	const rows = await prisma.product.findMany({
		where: {
			OR: [
				{ cableType: { not: null } },
				{ connectorA: { not: null } },
				{ connectorB: { not: null } },
				{ lengthCm: { not: null } }
			]
		},
		select: { cableType: true, connectorA: true, connectorB: true, categoryId: true },
		orderBy: { createdAt: 'desc' }
	});

	// Case-insensitive dedup, first spelling seen wins. Catalogue values go in
	// first, so a pool that writes "schuko" keeps writing it.
	const merge = (fromCatalog: string[], starters: readonly string[]) => {
		const seen = new Map<string, string>();
		for (const value of [...fromCatalog, ...starters]) {
			const name = value.trim();
			if (!name) continue;
			const key = name.toLowerCase();
			if (!seen.has(key)) seen.set(key, name);
		}
		return [...seen.values()];
	};

	const byType: Record<
		string,
		{ connectorA: string | null; connectorB: string | null; categoryId: string | null }
	> = {};
	for (const row of rows) {
		const type = row.cableType?.trim();
		// Newest first, so the first row of a type is the precedent.
		if (!type || byType[type]) continue;
		byType[type] = {
			connectorA: row.connectorA,
			connectorB: row.connectorB,
			categoryId: row.categoryId
		};
	}
	for (const [type, ends] of Object.entries(CABLE_TYPE_DEFAULTS)) {
		if (!byType[type]) byType[type] = { ...ends, categoryId: null };
	}

	return {
		// Whether the pool holds any cables decides whether the device list shows
		// cable filters — a pool of lamps shouldn't grow a row of controls that
		// can only ever match nothing.
		hasCables: rows.length > 0,
		types: merge(
			rows.flatMap((r) => (r.cableType ? [r.cableType] : [])),
			CABLE_TYPE_SUGGESTIONS
		),
		// Connectors are not here: they are rows of their own now, with pictures,
		// and `getConnectors` serves them. Types have no such table — there is
		// nothing to hang on a cable type but its name.
		byType
	};
});

/**
 * The complete product catalogue. Counts remain scoped to the selected
 * organization(s), but products with no matching units must stay visible: this
 * is also the place where abandoned catalogue rows are cleaned up.
 */
export const getProductCatalog = query(v.optional(v.string()), async (organizationId?: string) => {
	const user = await requireAuth();
	const queryOrgIds = await scopedOrgIds(user.id, organizationId);
	const priceOrgIds = await priceVisibleOrgIds(user.id, queryOrgIds);

	const assetScope = { organizationId: { in: queryOrgIds }, ...ACTIVE_ASSET_WHERE };

	const products = await prisma.product.findMany({
		include: {
			manufacturer: true,
			category: true,
			// One row per org that owns units — `owningOrgIds` is what lets the
			// wizard grey out identity fields the server would refuse to change.
			assets: { select: { organizationId: true }, distinct: ['organizationId'] },
			// Prices are per-org and only the user's own orgs' are anyone's business —
			// and of those, only the ones they read more than the equipment of.
			orgPrices: {
				where: { organizationId: { in: priceOrgIds } },
				select: { organizationId: true, netPurchasePrice: true }
			},
			_count: { select: { assets: { where: assetScope } } },
			// A loom's ways, and the device's panel. Carried here because the
			// product editor is built on this row, on /products and on a product's
			// own page alike.
			ways: { orderBy: { sortOrder: 'asc' } },
			ports: { include: { connector: true }, orderBy: { sortOrder: 'asc' } }
		},
		orderBy: [{ manufacturer: { name: 'asc' } }, { name: 'asc' }]
	});

	// Units that hang off a parent. A product whose every unit does is only ever
	// an accessory — nobody rents it on its own, so the "missing price" filter
	// leaves it out unless asked. Its own query: `_count` can't count one
	// relation twice with two different filters.
	const accessoryCounts = await prisma.asset.groupBy({
		by: ['productId'],
		where: { ...assetScope, parentAssetId: { not: null } },
		_count: { _all: true }
	});
	const accessoryCountOf = new Map(accessoryCounts.map((r) => [r.productId, r._count._all]));

	return products.map(({ _count, assets, orgPrices, ...product }) => ({
		...product,
		assetCount: _count.assets,
		accessoryCount: accessoryCountOf.get(product.id) ?? 0,
		hasAssets: assets.length > 0,
		owningOrgIds: assets.map((a) => a.organizationId),
		prices: orgPrices
	}));
});

/** One way of a loom as a form sends it. */
const cableWaySchema = v.object({
	count: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(99)),
	cableType: v.optional(v.nullable(v.string())),
	connectorA: v.optional(v.nullable(v.string())),
	connectorB: v.optional(v.nullable(v.string()))
});

const cableAttrsSchema = v.object({
	/** The wire, not the ends: CAT7, 2,5 mm². Optional — most cables have nothing
	 * to say here that the connectors do not already say. */
	cableType: v.optional(v.nullable(v.string())),
	connectorA: v.optional(v.nullable(v.string())),
	connectorB: v.optional(v.nullable(v.string())),
	lengthCm: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1)))),
	/**
	 * A loom's ways, where the cable carries more than one pair of ends. Empty on
	 * an ordinary lead, whose single pair is `connectorA`/`connectorB` above — a
	 * cable is one or the other, never both.
	 */
	ways: v.optional(v.array(cableWaySchema))
});

/**
 * "The same cable" as a Prisma filter. The three text columns are free text, so
 * they are compared without case — "schuko m" typed by hand is the "Schuko M"
 * the picker wrote, and the forms' duplicate warning (`cableTwinKey`) already
 * reads them that way. A null stays a plain `null`, which Prisma reads as IS
 * NULL: a blank end only ever matches a blank end.
 */
function sameCableWhere(cable: CableInput): Prisma.ProductWhereInput {
	const text = (value: string | null) =>
		value === null ? null : { equals: value, mode: 'insensitive' as const };
	return {
		cableType: text(cable.cableType),
		connectorA: text(cable.connectorA),
		connectorB: text(cable.connectorB),
		lengthCm: cable.lengthCm
	};
}

/**
 * The catalogue row this cable already is, if it is one. An ordinary lead is a
 * filter; a loom is not, because "the same multiset of ways" is not something a
 * `where` can ask — `every`/`some` cannot count. So its ways are compared here,
 * over the few candidates that already match the columns.
 *
 * Which branch runs matters in both directions: an ordinary lead must not match
 * a loom that happens to share its length, so it asks for a product with no
 * ways at all.
 */
async function findSameCable(
	manufacturerId: string,
	cable: CableInput,
	ways: readonly CableWayAttrs[]
): Promise<{ id: string } | null> {
	if (ways.length === 0) {
		return await prisma.product.findFirst({
			where: { manufacturerId, ...sameCableWhere(cable), ways: { none: {} } },
			select: { id: true }
		});
	}
	const candidates = await prisma.product.findMany({
		where: { manufacturerId, ...sameCableWhere(cable), ways: { some: {} } },
		select: { id: true, ways: { orderBy: { sortOrder: 'asc' } } }
	});
	const key = waysKey(ways);
	return candidates.find((p) => waysKey(p.ways) === key) ?? null;
}

/** The manufacturer/product half of a create form, which two commands now ask for. */
const productRefSchema = {
	productId: v.optional(v.string()),
	newProductName: v.optional(v.string()),
	newProductImagePath: v.optional(v.string()),
	newProductNetPurchasePrice: v.optional(v.nullable(v.pipe(v.number(), v.minValue(0)))),
	newProductCable: v.optional(v.nullable(cableAttrsSchema)),
	newProductIsLicense: v.optional(v.boolean()),
	categoryId: v.optional(v.string()),
	manufacturerId: v.optional(v.string()),
	newManufacturerName: v.optional(v.string()),
	newManufacturerLogoPath: v.optional(v.string())
};

type ProductRef = {
	[K in keyof typeof productRefSchema]?: v.InferOutput<(typeof productRefSchema)[K]>;
};

/**
 * Turns "this product" or "a product nobody has named yet" into a product id,
 * creating the manufacturer and the product on the way if that is what was
 * asked for. Both create-shaped commands take the same eight fields, and the
 * order they are resolved in matters — a new product needs its manufacturer to
 * exist first.
 */
async function resolveProductRef(
	data: ProductRef,
	organizationId: string,
	userId: string
): Promise<string> {
	let manufacturerId = data.manufacturerId;
	if (data.newManufacturerName && !manufacturerId) {
		const m = await prisma.manufacturer.create({
			data: {
				name: data.newManufacturerName,
				logoPath: data.newManufacturerLogoPath?.trim() || null
			}
		});
		manufacturerId = m.id;
		await getManufacturers().refresh();
		await getProducts().refresh();
	}

	// A cable can arrive with no manufacturer at all — "New accessory" describes
	// one by its ends — and is then filed where `createCableBatch` files it.
	const cable = data.newProductCable ? normalizeCable(data.newProductCable) : null;
	const ways = normalizeWays(data.newProductCable?.ways);
	const newCable = cable && isCable({ ...cable, ways }) ? cable : null;
	if (!manufacturerId && !data.productId && data.newProductName && newCable) {
		manufacturerId = await resolveGenericManufacturer();
	}

	let productId = data.productId;
	if (data.newProductName && !productId && manufacturerId && newCable) {
		// The same lead described twice is one product, as in `createCableBatch`:
		// a second "Schuko 10 m" is a row the device list can never merge back.
		// Nulls stay null, so a blank end only matches a blank end.
		const existing = await findSameCable(manufacturerId, newCable, ways);
		if (existing) {
			productId = existing.id;
			// A price typed for the "new" product still counts, but only where this
			// org hasn't priced the existing one — it must not overwrite a tariff.
			if (data.newProductNetPurchasePrice != null) {
				const priced = await prisma.orgProductPrice.findFirst({
					where: { organizationId, productId: existing.id },
					select: { productId: true }
				});
				if (!priced) {
					await prisma.orgProductPrice.create({
						data: {
							organizationId,
							productId: existing.id,
							netPurchasePrice: data.newProductNetPurchasePrice
						}
					});
				}
			}
		}
	}

	if (data.newProductName && !productId && manufacturerId) {
		if (!data.categoryId) appError(400, 'category_required');
		await prisma.category.findUniqueOrThrow({ where: { id: data.categoryId } });
		const p = await prisma.product.create({
			data: {
				name: data.newProductName,
				manufacturerId,
				categoryId: data.categoryId,
				imagePath: data.newProductImagePath?.trim() || null,
				...(cable ?? {}),
				// A cable is a physical thing; a product can't be both.
				isLicense: !cable && !!data.newProductIsLicense,
				createdById: userId,
				ways:
					ways.length > 0
						? { create: ways.map((w, sortOrder) => ({ ...w, sortOrder })) }
						: undefined
			}
		});
		// The price given alongside a brand-new product is the creating org's own
		// — prices are per-org, so it binds nobody else.
		if (data.newProductNetPurchasePrice != null) {
			await prisma.orgProductPrice.create({
				data: {
					organizationId,
					productId: p.id,
					netPurchasePrice: data.newProductNetPurchasePrice
				}
			});
		}
		productId = p.id;
		await getProducts(manufacturerId).refresh();
		if (data.newProductCable) {
			const added = await ensureConnectors([
				data.newProductCable.connectorA,
				data.newProductCable.connectorB,
				// A loom's ends are ends like any other: they belong in the connector
				// catalogue, where a picture and a department can be hung on them.
				...ways.flatMap((w) => [w.connectorA, w.connectorB])
			]);
			if (added.length > 0) await getConnectors().refresh();
			await getCableVocabulary().refresh();
		}
	}

	if (!productId) appError(400, 'product_required');
	return productId;
}

/** The subset of a Prisma client these helpers need — the real one or a `$transaction` handle. */
type AssetTx = Pick<typeof prisma, 'asset' | 'organization' | 'assetTransaction' | 'product'>;

/**
 * Hands out an org's next free asset tags, in order, for the length of one
 * transaction. Everything created in a batch draws from the same counter — the
 * units that were asked for and the accessories copied onto them alike — so a
 * batch can't hand the same number to two of them.
 */
async function tagAllocator(tx: AssetTx, prefix: string): Promise<() => string> {
	const last = await tx.asset.findFirst({
		where: { assetTag: { startsWith: prefix } },
		orderBy: { assetTag: 'desc' },
		select: { assetTag: true }
	});
	let next = 1;
	if (last?.assetTag) {
		const parsed = parseInt(last.assetTag.slice(prefix.length), 10);
		if (!isNaN(parsed)) next = parsed + 1;
	}
	return () => `${prefix}${String(next++).padStart(5, '0')}`;
}

/** One unit as a caller asks for it — a tag it brought, one to allocate, or none. */
type UnitSpec = {
	productId: string;
	serialNumber?: string | null;
	assetTag?: string | null;
	noAssetTag?: boolean;
};

type CreateUnitsArgs = {
	userId: string;
	organizationId: string;
	/** Already resolved and checked against the org by the caller. */
	locationId: string;
	units: UnitSpec[];
	parent?: (AccessoryParent & { productId: string }) | null;
	bundleId?: string | null;
	accessoryProfile?: ProductAccessoryProfile | null;
	/**
	 * Bolt loose units the pool already holds onto the new ones before
	 * registering any. Off by default, and deliberately the opposite default to
	 * the fan-out on the asset detail page: a unit being registered now is
	 * usually a delivery, and a delivery arrives with its own cables. Bringing an
	 * existing fleet into line is the other way round — see `addProductAccessories`.
	 */
	reuseAccessoryStock?: boolean;
};

/**
 * Creates units, in one transaction, with everything that has to happen at the
 * same moment: the org's inspection interval snapshotted onto each one, tags
 * drawn in row order from a single allocator, the CREATED (and, for an
 * accessory, ACCESSORY_ATTACHED) transactions, and the accessory fan-out.
 *
 * Extracted because the cable batch is the third caller. Two copies of tag
 * allocation is how one batch hands the same number to two units.
 */
async function createUnitsInTx(tx: AssetTx, args: CreateUnitsArgs) {
	const { assetIdPrefix: prefix, defaultInspectionIntervalMonths } =
		await tx.organization.findUniqueOrThrow({
			where: { id: args.organizationId },
			select: { assetIdPrefix: true, defaultInspectionIntervalMonths: true }
		});

	const createdAt = new Date();
	const nextInspectionDue = defaultInspectionIntervalMonths
		? new Date(
				createdAt.getFullYear(),
				createdAt.getMonth() + defaultInspectionIntervalMonths,
				createdAt.getDate()
			)
		: null;

	const nextTag = await tagAllocator(tx, prefix);
	const parent = args.parent ?? null;

	// A licence has no wiring to test, so it never gets a DGUV interval.
	const licenseProductIds = new Set(
		(
			await tx.product.findMany({
				where: { id: { in: args.units.map((u) => u.productId) }, isLicense: true },
				select: { id: true }
			})
		).map((p) => p.id)
	);

	const created = await Promise.all(
		// `nextTag()` is called synchronously inside the map, before anything is
		// awaited, so the tags land in row order rather than completion order.
		args.units.map((unit) => {
			let resolvedTag: string | null;
			if (unit.noAssetTag) {
				resolvedTag = null;
			} else if (unit.assetTag?.trim()) {
				const tag = unit.assetTag.trim();
				if (!tag.startsWith(prefix)) appError(400, 'asset_tag_prefix_mismatch', [tag, prefix]);
				resolvedTag = tag;
			} else {
				resolvedTag = nextTag();
			}

			return tx.asset.create({
				data: {
					organizationId: args.organizationId,
					productId: unit.productId,
					locationId: args.locationId,
					serialNumber: unit.serialNumber || null,
					assetTag: resolvedTag,
					status: 'AVAILABLE',
					parentAssetId: parent?.id ?? null,
					bundleId: parent?.bundleId ?? args.bundleId ?? null,
					// Snapshot, not a live reference — see Organization.defaultInspectionIntervalMonths.
					inspectionIntervalMonths: licenseProductIds.has(unit.productId)
						? null
						: defaultInspectionIntervalMonths,
					nextInspectionDue: licenseProductIds.has(unit.productId) ? null : nextInspectionDue,
					transactions: {
						create: [
							{ userId: args.userId, action: 'CREATED', data: { type: 'CREATED' } },
							// Two entries rather than one: the unit was created, and it was
							// attached. Detaching it later leaves the first one true.
							...(parent
								? [
										{
											userId: args.userId,
											action: 'ACCESSORY_ATTACHED',
											data: {
												type: 'ACCESSORY_ATTACHED',
												parentAssetId: parent.id,
												parentLabel: assetLabel(parent)
											}
										}
									]
								: [])
						]
					}
				},
				include: {
					product: {
						include: { manufacturer: true, category: true, ways: { orderBy: { sortOrder: 'asc' } } }
					},
					location: true
				}
			});
		})
	);

	// In the same transaction as the units themselves: a fixture that reaches
	// the pool without the brackets every other one of its kind has is worse
	// than one that was never created — nothing about it looks wrong later.
	const reusedAccessoryIds: string[] = [];
	if (args.accessoryProfile) {
		const pool = args.reuseAccessoryStock
			? await stockPool(tx, {
					organizationId: args.organizationId,
					productIds: args.accessoryProfile.accessories.map((acc) => acc.productId),
					bundleId: parent?.bundleId ?? args.bundleId ?? null,
					locationId: args.locationId,
					bare: true
				})
			: new Map<string, StockUnit[]>();

		for (const unit of created) {
			for (const acc of args.accessoryProfile.accessories) {
				for (let n = 0; n < acc.perUnit; n++) {
					const parentRecord = {
						id: unit.id,
						locationId: unit.locationId,
						bundleId: unit.bundleId,
						assetTag: unit.assetTag,
						product: unit.product
					};
					const taken = pool.get(acc.productId)?.shift();
					if (taken && (await attachStockUnit(tx, args.userId, taken.id, parentRecord))) {
						reusedAccessoryIds.push(taken.id);
						continue;
					}
					await createAccessoryRecord(tx, {
						userId: args.userId,
						organizationId: args.organizationId,
						productId: acc.productId,
						assetTag: acc.tagged ? nextTag() : null,
						inspectionIntervalMonths: defaultInspectionIntervalMonths,
						nextInspectionDue,
						parent: parentRecord
					});
				}
			}
		}
	}

	// The units themselves, and separately whatever was taken off the shelf to
	// dress them — the caller decides what to invalidate, the same way
	// `performScan` reports what it touched.
	return { created, reusedAccessoryIds };
}

/** What a listing shows once an org has gained units of some products. */
async function refreshAfterUnitsCreated(organizationId: string, productIds: string[]) {
	await getAssets(organizationId).refresh();
	await getAssets().refresh();
	await getInventorySummary(organizationId).refresh();
	await getInventorySummary().refresh();
	// The product just gained a unit, so what its fleet carries may have moved.
	await Promise.all(
		[...new Set(productIds)].map((productId) =>
			getProductAccessoryProfile({ productId, organizationId }).refresh()
		)
	);
}

const createAssetsSchema = v.object({
	organizationId: v.string(),
	locationId: v.string(),
	// Set when the units being created land somewhere immediately — attached to
	// a parent ("New accessory" on the asset detail page) or inside a kit ("New
	// device" on the bundle page). They are created already there rather than
	// created and then moved, so a failure can't leave a loose unit behind that
	// nobody asked for. Mutually exclusive: an accessory's kit is its parent's.
	parentAssetId: v.optional(v.string()),
	bundleId: v.optional(v.string()),
	...productRefSchema,
	/**
	 * Give each new unit the accessories the org's other units of this product
	 * already carry — see `productAccessoryProfile`. Asked for at the point of
	 * creation because that is the only moment anyone knows the answer: a
	 * fixture registered without its brackets is not obviously missing them.
	 */
	copyProductAccessories: v.optional(v.boolean()),
	/**
	 * Take those accessories out of the pool's loose stock where it has any,
	 * instead of registering a new one per unit. Only meaningful alongside
	 * `copyProductAccessories`, and off by default — see `reuseAccessoryStock`.
	 */
	reuseExistingAccessories: v.optional(v.boolean()),
	items: v.array(
		v.object({
			serialNumber: v.optional(v.string()),
			assetTag: v.optional(v.string()),
			noAssetTag: v.optional(v.boolean())
		})
	)
});

export const createAssets = command(createAssetsSchema, async (data) => {
	const user = await requireAuth();
	await requireOrgInventory(data.organizationId, 'asset_create_forbidden');

	const productId = await resolveProductRef(data, data.organizationId, user.id);

	// An accessory is wherever its parent is and in whatever kit its parent is
	// in, so the parent decides both — the caller's locationId is ignored. The
	// parent-side guards are the ones from `attachAccessory`; the child-side ones
	// can't fail for a unit that is being created here and now.
	if (data.parentAssetId && data.bundleId) {
		appError(400, 'accessory_bundle_conflict');
	}

	const parent = data.parentAssetId
		? await prisma.asset.findUniqueOrThrow({
				where: { id: data.parentAssetId },
				select: {
					id: true,
					status: true,
					organizationId: true,
					locationId: true,
					bundleId: true,
					parentAssetId: true,
					assetTag: true,
					productId: true,
					product: { select: { name: true, manufacturer: { select: { name: true } } } }
				}
			})
		: null;
	if (parent) {
		if (parent.organizationId !== data.organizationId) {
			appError(409, 'accessory_org_mismatch');
		}
		if (isRetiredStatus(parent.status)) {
			appError(409, 'asset_retired_no_accessories');
		}
		if (parent.parentAssetId) {
			appError(409, 'accessory_nested');
		}
	}

	// A kit's own location wins over the caller's for the same reason a parent's
	// does — `addAssetToBundle` applies it to anything joining an existing
	// bundle. A bundle with no location of its own leaves the choice open.
	const bundle = data.bundleId
		? await prisma.assetBundle.findUniqueOrThrow({
				where: { id: data.bundleId },
				select: {
					id: true,
					locationId: true,
					templateId: true,
					template: { select: { organizationId: true } }
				}
			})
		: null;
	if (bundle && bundle.template.organizationId !== data.organizationId) {
		appError(409, 'bundle_org_mismatch');
	}
	// Registering a unit straight into a kit is how a kit is completed, so it
	// answers to what the type holds like any other way in. No override here:
	// this modal exists to fill a gap, and a new product belongs to the type
	// before it belongs to a case of it.
	if (bundle) {
		await assertAdditionsFitType({
			templateId: bundle.templateId,
			bundleId: bundle.id,
			productIds: data.items.map(() => productId)
		});
	}

	const locationId = parent?.locationId ?? bundle?.locationId ?? data.locationId;
	const location = await prisma.location.findUniqueOrThrow({ where: { id: locationId } });
	if (location.organizationId !== data.organizationId) appError(400, 'location_invalid');

	// What the org's other units of this product already carry. Read before the
	// transaction opens, so it describes the fleet as it was — the units being
	// created here are not in it. An accessory gets none of its own: one level
	// deep, and a power cable has no brackets.
	const accessoryProfile =
		data.copyProductAccessories && !data.parentAssetId
			? await productAccessoryProfile(productId, data.organizationId)
			: null;

	const { created: assets, reusedAccessoryIds } = await prisma.$transaction((tx) =>
		createUnitsInTx(tx, {
			userId: user.id,
			organizationId: data.organizationId,
			locationId: location.id,
			units: data.items.map((item) => ({ ...item, productId })),
			parent,
			bundleId: bundle?.id ?? null,
			accessoryProfile,
			reuseAccessoryStock: data.reuseExistingAccessories
		})
	);

	await refreshAfterUnitsCreated(data.organizationId, [productId]);
	if (accessoryProfile) {
		await Promise.all([
			...assets.map((a) => getAsset(a.id).refresh()),
			// A unit taken off the shelf has its own page, and it has just changed
			// parent, kit and possibly shelf on it.
			...reusedAccessoryIds.flatMap((id) => [getAsset(id).refresh(), getAssetHistory(id).refresh()])
		]);
	}
	// If these were accessories, the parent's product now carries one more of them.
	if (parent) {
		await getAsset(parent.id).refresh();
		await getAssetHistory(parent.id).refresh();
		await getProductAccessoryProfile({
			productId: parent.productId,
			organizationId: data.organizationId
		}).refresh();
	}
	const touchedBundleId = parent?.bundleId ?? bundle?.id ?? null;
	if (touchedBundleId) {
		if (bundle) await getBundleTypeSpec(bundle.templateId).refresh();
		await getBundle(touchedBundleId).refresh();
		await getBundles(data.organizationId).refresh();
		await getBundleTemplates(data.organizationId).refresh();
		await getBundleTemplates().refresh();
	}

	return assets;
});

// ── Cables, by the box ───────────────────────────────────────────────────────
// Cables are the most numerous and least individual thing in the pool: nobody
// registers one, they register ten. `createAssets` asks for a manufacturer, a
// product, a serial number and a tag per unit, which is four questions too many
// for "10× Schuko 10 m" — so this command takes rows of
// (type, ends, length, quantity) and does the product lookup itself.

const cableBatchRowSchema = v.object({
	...cableAttrsSchema.entries,
	/** null means the generic manufacturer — a Schuko lead has no brand worth filing. */
	manufacturerId: v.nullable(v.string()),
	categoryId: v.string(),
	name: v.pipe(v.string(), v.trim(), v.minLength(1)),
	quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200))
});

const createCableBatchSchema = v.object({
	organizationId: v.string(),
	locationId: v.string(),
	assignAssetTags: v.boolean(),
	rows: v.pipe(v.array(cableBatchRowSchema), v.minLength(1))
});

/**
 * The org's stand-in manufacturer, created on demand. Cables are filed under it
 * because "Generisch" is the honest answer for a Schuko lead, and because
 * `productBillingLabel` prints the product name alone for a generic maker.
 */
async function resolveGenericManufacturer(): Promise<string> {
	const existing = await prisma.manufacturer.findFirst({
		where: { generic: true },
		orderBy: { name: 'asc' }
	});
	if (existing) return existing.id;
	const created = await prisma.manufacturer.create({ data: { name: 'Generisch', generic: true } });
	await getManufacturers().refresh();
	await getProducts().refresh();
	return created.id;
}

export const createCableBatch = command(createCableBatchSchema, async (data) => {
	const user = await requireAuth();
	await requireOrgInventory(data.organizationId, 'asset_create_forbidden');

	const location = await prisma.location.findUniqueOrThrow({ where: { id: data.locationId } });
	if (location.organizationId !== data.organizationId) appError(400, 'location_invalid');

	let genericManufacturerId: string | null = null;
	if (data.rows.some((row) => row.manufacturerId === null)) {
		genericManufacturerId = await resolveGenericManufacturer();
	}

	const seenCategories = new Set<string>();
	for (const row of data.rows) {
		if (seenCategories.has(row.categoryId)) continue;
		await prisma.category.findUniqueOrThrow({ where: { id: row.categoryId } });
		seenCategories.add(row.categoryId);
	}

	// Products are resolved before the transaction opens, the way
	// `resolveProductRef` does it — a catalogue row is not this org's to roll
	// back, and two rows describing the same cable have to end up sharing one.
	const productByKey = new Map<string, { productId: string; created: boolean }>();
	const resolved: { productId: string; name: string; productCreated: boolean; quantity: number }[] =
		[];

	for (const row of data.rows) {
		const cable = normalizeCable(row);
		const manufacturerId = row.manufacturerId ?? genericManufacturerId;
		if (!manufacturerId) appError(400, 'manufacturer_required');

		// The batch grid is for ordinary leads: one pair of ends per row. A loom is
		// made up in the product form, where its ways have somewhere to go.
		if (!isCable({ ...cable, ways: [] })) {
			appError(400, 'cable_row_incomplete', [row.name]);
		}

		const key = [
			manufacturerId,
			cable.cableType?.toLowerCase() ?? '',
			cable.connectorA?.toLowerCase() ?? '',
			cable.connectorB?.toLowerCase() ?? '',
			cable.lengthCm ?? ''
		].join('|');

		let entry = productByKey.get(key);
		if (!entry) {
			// Nulls are passed as `null`, never left undefined: to Prisma
			// `undefined` means "don't filter on this", so a blank connector would
			// match any cable and a second product would be created every time.
			const existing = await findSameCable(manufacturerId, cable, []);
			if (existing) {
				entry = { productId: existing.id, created: false };
			} else {
				const product = await prisma.product.create({
					data: {
						name: row.name.trim(),
						manufacturerId,
						categoryId: row.categoryId,
						...cable,
						createdById: user.id
					},
					select: { id: true }
				});
				entry = { productId: product.id, created: true };
			}
			productByKey.set(key, entry);
		}

		resolved.push({
			productId: entry.productId,
			name: row.name.trim(),
			productCreated: entry.created,
			quantity: row.quantity
		});
	}

	const units = resolved.flatMap((row) =>
		Array.from({ length: row.quantity }, () => ({
			productId: row.productId,
			// Cables are untagged by default: a sticker on a 1.5 m Schuko lead
			// costs more to maintain than the unit is worth. The form remembers
			// the choice for pools that do tag them.
			noAssetTag: !data.assignAssetTags
		}))
	);

	const { created } = await prisma.$transaction((tx) =>
		createUnitsInTx(tx, {
			userId: user.id,
			organizationId: data.organizationId,
			locationId: location.id,
			units
		})
	);

	const addedConnectors = await ensureConnectors(
		data.rows.flatMap((row) => [row.connectorA, row.connectorB])
	);

	const manufacturerIds = new Set(
		data.rows.map((row) => row.manufacturerId ?? genericManufacturerId!)
	);
	await refreshAfterUnitsCreated(
		data.organizationId,
		resolved.map((r) => r.productId)
	);
	await Promise.all([
		getProducts().refresh(),
		...[...manufacturerIds].map((id) => getProducts(id).refresh()),
		getProductCatalog().refresh(),
		getProductCatalog(data.organizationId).refresh(),
		getCableVocabulary().refresh(),
		...(addedConnectors.length > 0 ? [getConnectors().refresh()] : [])
	]);

	return { created: created.length, rows: resolved };
});

// Enough of a production to name it to someone who may not be allowed to —
// see `visibleProductionName`.
const PRODUCTION_NAME_SELECT = {
	id: true,
	name: true,
	organizationId: true,
	organization: { select: { name: true, shortName: true } }
} as const;

export const getAssetHistory = query(v.string(), async (assetId: string) => {
	const user = await requireAuth();
	const orgIds = await userOrgIds(user.id);
	const systemAdmin = await isSystemAdmin(user.id);

	const asset = await prisma.asset.findUniqueOrThrow({
		where: { id: assetId },
		select: { organizationId: true }
	});
	if (!systemAdmin && !orgIds.includes(asset.organizationId)) {
		appError(403, 'unauthorized');
	}

	const canSee = await productionVisibility(user.id);
	const history = await prisma.assetTransaction.findMany({
		where: { assetId },
		include: {
			user: { select: { name: true, email: true } },
			production: { select: PRODUCTION_NAME_SELECT }
		},
		orderBy: { createdAt: 'desc' }
	});

	// A unit lent to another org's production did go there, so the entry stays —
	// named after the org, and flagged so the page doesn't link to a production
	// that would only refuse to open. The name lives in the entry's JSON as well
	// as on the relation, and both have to go.
	return history.map(({ production, ...tx }) => {
		if (!production || canSee(production)) {
			return { ...tx, productionRestricted: false };
		}
		const name = visibleProductionName(production, canSee);
		const data =
			tx.data && typeof tx.data === 'object' && !Array.isArray(tx.data)
				? {
						...tx.data,
						...('productionName' in tx.data ? { productionName: name } : {}),
						...('fromProductionName' in tx.data ? { fromProductionName: name } : {})
					}
				: tx.data;
		return { ...tx, data, productionRestricted: true };
	});
});

const updateAssetSchema = v.object({
	assetId: v.string(),
	serialNumber: v.optional(v.string()),
	assetTag: v.optional(v.string()),
	status: v.optional(v.picklist(ASSET_STATUSES)),
	locationId: v.optional(v.string()),
	purchaseDate: v.optional(v.nullable(v.string())),
	inspectionIntervalMonths: v.optional(v.nullable(v.number()))
});

export const updateAsset = command(updateAssetSchema, async (input) => {
	const user = await requireAuth();

	const asset = await prisma.asset.findUniqueOrThrow({
		where: { id: input.assetId },
		include: {
			location: true,
			product: true,
			bundle: { include: { template: true } },
			accessories: { select: { id: true } }
		}
	});

	await requireOrgInventory(asset.organizationId);

	// A sold or decommissioned unit is a historical record. Its status stays
	// editable so a mis-click can be undone; everything else is frozen.
	const nextStatus = input.status;
	const editedFields = Object.keys(input).filter((k) => k !== 'assetId' && k !== 'status');
	if (isRetiredStatus(asset.status) && editedFields.length > 0) {
		appError(409, 'asset_retired_status_only');
	}

	const retiring = !!nextStatus && isRetiredStatus(nextStatus) && !isRetiredStatus(asset.status);
	if (retiring) {
		const openItem = await prisma.productionItem.findFirst({
			where: { assetId: asset.id, status: { in: ['PENDING', 'APPROVED', 'CHECKED_OUT'] } },
			include: { production: { select: PRODUCTION_NAME_SELECT } }
		});
		if (openItem) {
			const canSee = await productionVisibility(user.id);
			appError(409, 'asset_still_booked', [visibleProductionName(openItem.production, canSee)]);
		}
	}

	let nextLocation: { id: string; name: string } | undefined = undefined;
	if ('locationId' in input) {
		if (input.locationId) {
			const loc = await prisma.location.findUniqueOrThrow({ where: { id: input.locationId } });
			if (loc.organizationId !== asset.organizationId) appError(400, 'location_invalid');
			nextLocation = loc;
		} else {
			appError(400, 'location_required');
		}
	}

	const updateData: {
		serialNumber?: string | null;
		assetTag?: string | null;
		status?: string;
		locationId?: string;
		bundleId?: string | null;
		parentAssetId?: string | null;
		purchaseDate?: Date | null;
		inspectionIntervalMonths?: number | null;
		nextInspectionDue?: Date | null;
	} = {};

	const changes: FieldChange[] = [];
	if ('purchaseDate' in input) {
		updateData.purchaseDate = input.purchaseDate ? new Date(input.purchaseDate) : null;
	}
	if ('inspectionIntervalMonths' in input) {
		const interval = input.inspectionIntervalMonths ?? null;
		updateData.inspectionIntervalMonths = interval;
		if (interval) {
			const lastInspection = await prisma.inspection.findFirst({
				where: { assetId: asset.id },
				orderBy: { performedAt: 'desc' }
			});
			const base = lastInspection?.performedAt ?? asset.createdAt;
			updateData.nextInspectionDue = new Date(
				base.getFullYear(),
				base.getMonth() + interval,
				base.getDate()
			);
		} else {
			updateData.nextInspectionDue = null;
		}
	}
	if ('serialNumber' in input) {
		const serialNumber = input.serialNumber?.trim() || null;
		updateData.serialNumber = serialNumber;
		if (serialNumber !== asset.serialNumber)
			changes.push({ field: 'serialNumber', from: asset.serialNumber, to: serialNumber });
	}
	if ('assetTag' in input) {
		const assetTag = input.assetTag?.trim() || null;
		updateData.assetTag = assetTag;
		if (assetTag !== asset.assetTag)
			changes.push({ field: 'assetTag', from: asset.assetTag, to: assetTag });
	}
	if (nextStatus) {
		updateData.status = nextStatus;
		if (nextStatus !== asset.status)
			changes.push({ field: 'status', from: asset.status, to: nextStatus });
	}
	// A unit that has left the pool has left its kit with it. Un-retiring won't
	// put it back — it has to be added to a bundle again like any other asset.
	if (retiring && asset.bundleId) {
		updateData.bundleId = null;
		changes.push({ field: 'bundle', from: asset.bundle?.template.name ?? null, to: null });
	}
	// The same for what it was attached to, in both directions: a retired cable
	// stops being this converter's cable, and a retired converter stops holding
	// live cables that are still in service.
	const detachingAccessories = retiring ? asset.accessories.map((a) => a.id) : [];
	if (retiring && asset.parentAssetId) {
		updateData.parentAssetId = null;
		changes.push({ field: 'accessoryOf', from: asset.parentAssetId, to: null });
	}
	if (nextLocation !== undefined) {
		updateData.locationId = nextLocation.id;
		if (nextLocation.id !== asset.locationId)
			changes.push({
				field: 'location',
				from: asset.location?.name ?? null,
				to: nextLocation.name,
				fromRef: asset.locationId ? { type: 'location', id: asset.locationId } : null,
				toRef: { type: 'location', id: nextLocation.id }
			});
	}

	const updated = await prisma.$transaction(async (tx) => {
		const result = await tx.asset.update({
			where: { id: input.assetId },
			data: updateData,
			include: {
				product: { include: { manufacturer: true } },
				location: true,
				organization: true,
				bundle: { select: { id: true, template: { select: { name: true } } } }
			}
		});
		if (detachingAccessories.length > 0) {
			await tx.asset.updateMany({
				where: { id: { in: detachingAccessories } },
				data: { parentAssetId: null }
			});
		} else if (updateData.locationId) {
			// Whatever is attached to this unit is physically wherever it is.
			await syncAccessories(tx, asset.id, { locationId: updateData.locationId });
		}
		return result;
	});

	if (changes.length > 0) {
		await prisma.assetTransaction.create({
			data: {
				assetId: asset.id,
				userId: user.id,
				action: 'UPDATED',
				data: { type: 'UPDATED', changes }
			}
		});
	}

	await getAsset(input.assetId).refresh();
	await getAssetHistory(input.assetId).refresh();
	if (asset.parentAssetId) await getAsset(asset.parentAssetId).refresh();
	for (const id of asset.accessories.map((a) => a.id)) await getAsset(id).refresh();
	await getAssets(asset.organizationId).refresh();
	await getAssets().refresh();
	await getRetiredAssets(asset.organizationId).refresh();
	await getRetiredAssets().refresh();
	await getInventorySummary(asset.organizationId).refresh();
	await getInventorySummary().refresh();
	await getLocations(asset.organizationId).refresh();
	if (retiring && asset.bundleId) {
		await getBundles(asset.organizationId).refresh();
		await getBundle(asset.bundleId).refresh();
		await getBundleTemplates(asset.organizationId).refresh();
		await getBundleTemplates().refresh();
	}

	return updated;
});

const bulkUpdateAssetStatusSchema = v.object({
	assetIds: v.array(v.string()),
	status: v.picklist(ASSET_STATUSES)
});

/**
 * Set one status across a hand-picked selection — the Devices list's bulk
 * action, and the only way to un-retire a batch.
 *
 * It applies the same guards `updateAsset` applies to a single unit, but as an
 * all-or-nothing batch: a booked asset aborts the whole call rather than
 * leaving half a selection retired, because the fix (unbook it, try again) is
 * easier to act on than working out which rows went through. Assets already at
 * the target status are simply not written, so a selection that spans statuses
 * doesn't fill the history with no-op entries.
 */
export const bulkUpdateAssetStatus = command(bulkUpdateAssetStatusSchema, async (input) => {
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);

	const assets = await prisma.asset.findMany({
		where: { id: { in: input.assetIds } },
		select: {
			id: true,
			status: true,
			organizationId: true,
			bundleId: true,
			parentAssetId: true,
			bundle: { select: { template: { select: { name: true } } } }
		}
	});
	if (assets.length === 0) appError(404, 'assets_not_found');

	const organizationIds = [...new Set(assets.map((a) => a.organizationId))];

	if (!systemAdmin) {
		const memberships = await prisma.orgMembership.findMany({
			where: {
				userId: user.id,
				organizationId: { in: organizationIds },
				role: { in: ['ADMIN', 'OWNER'] }
			},
			select: { organizationId: true }
		});
		const allowed = new Set(memberships.map((m) => m.organizationId));
		if (organizationIds.some((id) => !allowed.has(id))) appError(403, 'unauthorized');
	}

	const changing = assets.filter((a) => a.status !== input.status);
	const retiring = isRetiredStatus(input.status)
		? changing.filter((a) => !isRetiredStatus(a.status))
		: [];

	if (retiring.length > 0) {
		const openItems = await prisma.productionItem.findMany({
			where: {
				assetId: { in: retiring.map((a) => a.id) },
				status: { in: ['PENDING', 'APPROVED', 'CHECKED_OUT'] }
			},
			include: { production: { select: PRODUCTION_NAME_SELECT } }
		});
		if (openItems.length > 0) {
			const canSee = await productionVisibility(user.id);
			const blocked = new Set(openItems.map((i) => i.assetId)).size;
			const names = [...new Set(openItems.map((i) => visibleProductionName(i.production, canSee)))];
			const shown = names
				.slice(0, 3)
				.map((n) => `"${n}"`)
				.join(', ');
			const list = names.length > 3 ? `${shown}, …` : shown;
			if (blocked === 1) appError(409, 'assets_still_booked_one', [list]);
			appError(409, 'assets_still_booked_many', [blocked, list]);
		}
	}

	// A unit that has left the pool has left its kit with it. Un-retiring won't
	// put it back — it has to be added to a bundle again like any other asset.
	const unbundling = retiring.filter((a) => a.bundleId);
	// The same for accessories, in both directions — see `updateAsset`.
	const detaching = retiring.filter((a) => a.parentAssetId);
	const orphaning = retiring.map((a) => a.id);

	if (changing.length > 0) {
		await prisma.$transaction(async (tx) => {
			await tx.asset.updateMany({
				where: { id: { in: changing.map((a) => a.id) } },
				data: { status: input.status }
			});
			if (unbundling.length > 0) {
				await tx.asset.updateMany({
					where: { id: { in: unbundling.map((a) => a.id) } },
					data: { bundleId: null }
				});
			}
			if (detaching.length > 0) {
				await tx.asset.updateMany({
					where: { id: { in: detaching.map((a) => a.id) } },
					data: { parentAssetId: null }
				});
			}
			if (orphaning.length > 0) {
				await tx.asset.updateMany({
					where: { parentAssetId: { in: orphaning } },
					data: { parentAssetId: null }
				});
			}
			const unbundledIds = new Set(unbundling.map((a) => a.id));
			const detachedIds = new Set(detaching.map((a) => a.id));
			await tx.assetTransaction.createMany({
				data: changing.map((asset) => {
					const changes: FieldChange[] = [
						{ field: 'status', from: asset.status, to: input.status }
					];
					if (unbundledIds.has(asset.id)) {
						changes.push({
							field: 'bundle',
							from: asset.bundle?.template.name ?? null,
							to: null
						});
					}
					if (detachedIds.has(asset.id)) {
						changes.push({
							field: 'accessoryOf',
							from: asset.parentAssetId,
							to: null
						});
					}
					return {
						assetId: asset.id,
						userId: user.id,
						action: 'UPDATED',
						data: { type: 'UPDATED', changes }
					};
				})
			});
		});
	}

	const bundleIds = [...new Set(unbundling.map((a) => a.bundleId as string))];

	await Promise.all([
		...changing.flatMap((a) => [getAsset(a.id).refresh(), getAssetHistory(a.id).refresh()]),
		...organizationIds.flatMap((id) => [
			getAssets(id).refresh(),
			getRetiredAssets(id).refresh(),
			getInventorySummary(id).refresh()
		]),
		getAssets().refresh(),
		getRetiredAssets().refresh(),
		getInventorySummary().refresh(),
		...bundleIds.flatMap((id) => [getBundle(id).refresh()]),
		...(bundleIds.length > 0
			? [
					...organizationIds.flatMap((id) => [
						getBundles(id).refresh(),
						getBundleTemplates(id).refresh()
					]),
					getBundleTemplates().refresh()
				]
			: [])
	]);

	return {
		updated: changing.length,
		unchanged: assets.length - changing.length,
		status: input.status
	};
});

// Deleting an asset is only ever right for one that was never actually used: a
// mis-scan, or a row created to try something out. Used means it left the
// house — it went out on a job, it was inspected, or it is named on an offer or
// an invoice — and each of those is a record outside this asset that exists
// precisely so it can't be quietly rewritten. The honest way out of a real unit
// is retiring it — see RETIRED_ASSET_STATUSES.
//
// Every check below is the reason this isn't left to the database. Prisma
// cascades ProductionItem, AssetTransaction and Inspection, so the delete would
// succeed and take the history with it. OfferItem and InvoiceItem are worse:
// they reference an asset by id with no foreign key at all, so nothing but this
// would stop a delete from orphaning a line on an issued invoice.

// Like every other failure here, the guards below go through `appError`: a plain
// Error from a remote function never reaches the browser — SvelteKit replaces it
// with "Internal Error" — and here the message *is* the feature, naming which kind
// of history is in the way and pointing at decommissioning instead.

/**
 * Actions an asset accumulates without ever leaving the shelf. Being edited,
 * moved between locations, or bolted onto a unit and taken off again are all
 * internal bookkeeping: the only record of them is this asset's own history,
 * which goes when the asset does, so none of them leaves anything pointing at a
 * row that isn't there. A bracket that spent a week on a fixture and came off
 * again is still a bracket nobody ever used.
 *
 * Deliberately a positive list rather than a list of the actions that block:
 * a future action nobody has thought about here should stop a delete, not wave
 * it through.
 */
const UNUSED_ASSET_ACTIONS = [
	'CREATED',
	'UPDATED',
	'LOCATION_ASSIGNED',
	'ACCESSORY_ATTACHED',
	'ACCESSORY_DETACHED',
	// Storing a licence key is setting the unit up, not using it. Revealing one
	// is use, and deliberately not in this list: deleting the unit would take
	// the record of who saw the key with it.
	'CREDENTIALS_SET',
	'CREDENTIALS_REMOVED'
];

export const deleteAsset = command(v.string(), async (assetId: string) => {
	const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });

	const user = await requireOrgInventory(asset.organizationId);

	const booked = await prisma.productionItem.findFirst({
		where: { assetId },
		include: { production: { select: PRODUCTION_NAME_SELECT } }
	});
	if (booked) {
		const canSee = await productionVisibility(user.id);
		appError(409, 'asset_delete_booked', [visibleProductionName(booked.production, canSee)]);
	}

	const moved = await prisma.assetTransaction.findFirst({
		where: { assetId, action: { notIn: UNUSED_ASSET_ACTIONS } }
	});
	if (moved) {
		appError(409, 'asset_delete_history');
	}

	const inspected = await prisma.inspection.findFirst({ where: { assetId } });
	if (inspected) {
		appError(409, 'asset_delete_inspected');
	}

	// The FK is ON DELETE SET NULL, so this would succeed and quietly leave the
	// cables loose. Detaching is a deliberate act, and the person deleting a
	// parent should be the one to decide where its accessories go.
	const attached = await prisma.asset.findFirst({ where: { parentAssetId: assetId } });
	if (attached) {
		appError(409, 'asset_delete_has_accessories');
	}

	const [offerLine, invoiceLine] = await Promise.all([
		prisma.offerItem.findFirst({ where: { assetId } }),
		prisma.invoiceItem.findFirst({ where: { assetId } })
	]);
	if (offerLine || invoiceLine) {
		appError(409, 'asset_delete_billed');
	}

	const { organizationId, bundleId, parentAssetId } = asset;
	await prisma.asset.delete({ where: { id: assetId } });

	if (parentAssetId) await getAsset(parentAssetId).refresh();
	await getAssets(organizationId).refresh();
	await getAssets().refresh();
	await getRetiredAssets(organizationId).refresh();
	await getRetiredAssets().refresh();
	await getInventorySummary(organizationId).refresh();
	await getInventorySummary().refresh();
	await getLocations(organizationId).refresh();
	if (bundleId) {
		await getBundle(bundleId).refresh();
		await getBundles(organizationId).refresh();
		await getBundleTemplates(organizationId).refresh();
		await getBundleTemplates().refresh();
	}
});

const updateProductSchema = v.object({
	productId: v.string(),
	name: v.optional(v.string()),
	manufacturerId: v.optional(v.string()),
	categoryId: v.optional(v.string()),
	imagePath: v.optional(v.string()),
	/**
	 * `undefined` leaves the cable columns alone; `null` says this is not a cable
	 * any more and clears all four, the loom's ways included. Anything else
	 * replaces them wholesale — a cable's attributes describe one physical thing
	 * and are edited together.
	 */
	cable: v.optional(v.nullable(cableAttrsSchema)),
	/** Whether units of this product are licences carrying credentials. */
	isLicense: v.optional(v.boolean())
});

export const updateProduct = command(updateProductSchema, async (input) => {
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);
	const managed = systemAdmin ? [] : await managedOrgIds(user.id);

	const previousProduct = await prisma.product.findUniqueOrThrow({
		where: { id: input.productId },
		select: {
			createdById: true,
			name: true,
			manufacturerId: true,
			categoryId: true,
			imagePath: true,
			cableType: true,
			connectorA: true,
			connectorB: true,
			lengthCm: true,
			isLicense: true
		}
	});

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
				nextCable.connectorA !== previousProduct.connectorA ||
				nextCable.connectorB !== previousProduct.connectorB ||
				nextCable.lengthCm !== previousProduct.lengthCm));

	// Identity (name, manufacturer, category) follows the same rule as
	// `mergeProducts` — see `productControl`: whoever's gear it is controls what
	// it is called. Recategorizing is identity *and* money: the category decides
	// which rental rate other orgs' offers apply.
	const changesIdentity =
		(input.name !== undefined && input.name.trim() !== previousProduct.name) ||
		(input.manufacturerId !== undefined &&
			input.manufacturerId !== previousProduct.manufacturerId) ||
		(input.categoryId !== undefined && input.categoryId !== previousProduct.categoryId) ||
		cableChanged ||
		licenseChanged;

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
			{ id: user.id, systemAdmin, managed },
			{ id: input.productId, createdById: previousProduct.createdById }
		);
		if (!control.allowed) {
			if (control.reason === 'foreign_units') {
				appError(403, 'product_units_other_orgs', [control.orgNames]);
			}
			appError(403, 'product_unowned_not_creator', [previousProduct.name]);
		}
	} else if (imageChanged && !systemAdmin && (await writableOrgIds(user.id)).length === 0) {
		appError(403, 'product_edit_forbidden');
	}

	// Before the row, so the product that comes back already carries them.
	if (waysChanged && nextWays) await writeWays(input.productId, nextWays);

	const product = await prisma.product.update({
		where: { id: input.productId },
		data: {
			...(input.name ? { name: input.name.trim() } : {}),
			...(input.manufacturerId ? { manufacturerId: input.manufacturerId } : {}),
			...(input.categoryId ? { categoryId: input.categoryId } : {}),
			imagePath: nextImagePath,
			...(nextCable ?? {}),
			...(nextIsLicense !== undefined ? { isLicense: nextIsLicense } : {})
		},
		include: { manufacturer: true, category: true, ways: { orderBy: { sortOrder: 'asc' } } }
	});

	const changes = fieldChanges(previousProduct, {
		...(input.name ? { name: input.name.trim() } : {}),
		...(input.manufacturerId ? { manufacturerId: input.manufacturerId } : {}),
		...(input.categoryId ? { categoryId: input.categoryId } : {}),
		...(nextImagePath !== undefined ? { imagePath: nextImagePath } : {}),
		...(nextCable ?? {}),
		...(nextIsLicense !== undefined ? { isLicense: nextIsLicense } : {})
	});
	// The loom is logged as the whole list on both sides, like a device's panel:
	// a way has no id a revert could match, so what it can put back is the list.
	if (waysChanged && nextWays) {
		changes.push({ field: 'ways', from: previousWays, to: nextWays });
	}
	if (changes.length > 0) {
		await logCatalogChange({
			userId: user.id,
			action: 'PRODUCT_UPDATED',
			productId: product.id,
			manufacturerId: product.manufacturerId,
			data: { changes }
		});
	}

	await refreshProductViews(product, previousProduct.manufacturerId, {
		cable: cableChanged
			? [
					nextCable?.connectorA,
					nextCable?.connectorB,
					...(nextWays ?? []).flatMap((w) => [w.connectorA, w.connectorB])
				]
			: null
	});

	return product;
});

const setProductPortsSchema = v.object({
	productId: v.string(),
	ports: v.pipe(
		v.array(
			v.object({
				connectorId: v.pipe(v.string(), v.minLength(1)),
				count: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(999)),
				label: v.nullable(v.pipe(v.string(), v.maxLength(80)))
			})
		),
		v.maxLength(100)
	)
});

/**
 * The connectors built into a device, replaced as one list.
 *
 * Follows the picture rule rather than the identity rule, because a panel is
 * the same kind of thing: a description someone looked up, not what decides
 * which product a unit is. So the first panel is open to anyone who works in
 * an org at all, and changing one somebody already entered answers to
 * `productControl` like a replaced picture does.
 */
export const setProductPorts = command(setProductPortsSchema, async (input) => {
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);

	const product = await prisma.product.findUniqueOrThrow({
		where: { id: input.productId },
		select: { id: true, name: true, createdById: true, manufacturerId: true }
	});
	const before = await portSnapshot(product.id);
	const next = normalizePorts(input.ports);
	if (samePorts(before, next)) return;

	if (!systemAdmin) {
		if (before.length === 0) {
			if ((await writableOrgIds(user.id)).length === 0) appError(403, 'product_edit_forbidden');
		} else {
			const managed = await managedOrgIds(user.id);
			if (managed.length === 0) appError(403, 'product_edit_forbidden');
			const control = await productControl({ id: user.id, systemAdmin, managed }, product);
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
		userId: user.id,
		action: 'PRODUCT_UPDATED',
		productId: product.id,
		manufacturerId: product.manufacturerId,
		data: { changes: [{ field: 'ports', from: before, to: await portSnapshot(product.id) }] }
	});

	await refreshProductViews(product, product.manufacturerId, { cable: null });
	await getConnectorUsage().refresh();
});

/**
 * Everything that shows a product's name, picture or cable attributes. Shared
 * by `updateProduct` and `revertCatalogChange`, which move the same fields in
 * opposite directions.
 */
async function refreshProductViews(
	product: { id: string; manufacturerId: string },
	previousManufacturerId: string,
	changed: { cable: (string | null | undefined)[] | null }
) {
	await getProducts(product.manufacturerId).refresh();
	if (previousManufacturerId !== product.manufacturerId) {
		await getProducts(previousManufacturerId).refresh();
	}
	await getProducts().refresh();
	if (changed.cable) {
		const added = await ensureConnectors(changed.cable);
		if (added.length > 0) await getConnectors().refresh();
		await getCableVocabulary().refresh();
	}

	const affectedAssets = await prisma.asset.findMany({
		where: { productId: product.id },
		select: { id: true, organizationId: true }
	});
	const affectedOrgIds = [...new Set(affectedAssets.map((a) => a.organizationId))];
	await Promise.all([
		...affectedAssets.map((a) => getAsset(a.id).refresh()),
		// The catalogue is cached per org filter, and the unfiltered entry is the
		// one the wizard opens on.
		getProductCatalog().refresh(),
		...affectedOrgIds.map((id) => getProductCatalog(id).refresh()),
		...affectedOrgIds.map((id) => getAssets(id).refresh()),
		getAssets().refresh(),
		...affectedOrgIds.map((id) => getInventorySummary(id).refresh()),
		getInventorySummary().refresh()
	]);
}

/** Delete a catalogue row only when no unit, including a retired one, refers to it. */
export const deleteProduct = command(v.string(), async (productId: string) => {
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);
	const managed = systemAdmin ? [] : await managedOrgIds(user.id);
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
	const control = await productControl({ id: user.id, systemAdmin, managed }, product);
	if (!control.allowed) appError(403, 'product_unowned_not_creator', [product.name]);

	await prisma.product.delete({ where: { id: productId } });
	await logCatalogChange({
		userId: user.id,
		action: 'PRODUCT_DELETED',
		productId: product.id,
		manufacturerId: product.manufacturerId,
		data: { name: product.name, manufacturerName: product.manufacturer.name }
	});
	const orgIds = await userOrgIds(user.id);
	await Promise.all([
		getProducts().refresh(),
		getProducts(product.manufacturerId).refresh(),
		getProductCatalog().refresh(),
		getCableVocabulary().refresh(),
		...orgIds.map((id) => getProductCatalog(id).refresh())
	]);

	return { id: product.id };
});

// ── Merging duplicate products ───────────────────────────────────────────────
// Nothing stops two rows describing the same device: there is no unique
// constraint on (manufacturer, name), and the create-a-product path is a free
// text field by design, because the pool has to be able to register a thing
// nobody has catalogued yet. So "Robin 600" and "Robe Robin 600" both exist,
// each holding half the units, and every count, every catalogue page and every
// offer line built from them is wrong in a way that adds up.
//
// A merge is unusually cheap here because `Asset.productId` is the only foreign
// key pointing at a product. OfferItem and InvoiceItem carry a productId too,
// but as a *snapshot* with no relation (see the schema): an issued document
// says what it said, and the id there is only ever used to collapse identical
// lines on that one document. They are deliberately left alone — rewriting them
// would be editing a sent invoice to make a catalogue tidier.

const mergeProductsSchema = v.object({
	/** Survives. Its name, manufacturer and category are the ones that remain. */
	targetProductId: v.string(),
	/** The duplicate: its units move to the target, then the row is deleted. */
	sourceProductId: v.string()
});

export const mergeProducts = command(
	mergeProductsSchema,
	async ({ targetProductId, sourceProductId }) => {
		const user = await requireAuth();
		if (targetProductId === sourceProductId) appError(409, 'product_merge_self');

		const [target, source] = await Promise.all([
			prisma.product.findUniqueOrThrow({
				where: { id: targetProductId },
				include: { manufacturer: true }
			}),
			prisma.product.findUniqueOrThrow({
				where: { id: sourceProductId },
				include: { manufacturer: true }
			})
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

		const systemAdmin = await isSystemAdmin(user.id);
		if (!systemAdmin) {
			const managed = await managedOrgIds(user.id);
			if (managed.length === 0) {
				appError(403, 'product_merge_forbidden');
			}
			// A merge moves *units*, and those belong to someone. The check is on the
			// source alone because it is the only side that loses records: the
			// target's units are not touched, and what it is called does not change.
			// A duplicate nobody holds units of is its creator's to clean up.
			const control = await productControl({ id: user.id, systemAdmin, managed }, source);
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
		const inherited = {
			...(!target.imagePath && source.imagePath ? { imagePath: source.imagePath } : {})
		};

		const label = (p: { name: string; manufacturer: { name: string } }) =>
			`${p.manufacturer.name} ${p.name}`;

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
					userId: user.id,
					action: 'UPDATED',
					data: {
						type: 'UPDATED',
						changes: [{ field: 'product', from: label(source), to: label(target) }]
					}
				}))
			});
			if (Object.keys(inherited).length > 0) {
				await tx.product.update({ where: { id: targetProductId }, data: inherited });
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
		});

		await logCatalogChange({
			userId: user.id,
			action: 'PRODUCT_MERGED',
			productId: targetProductId,
			manufacturerId: target.manufacturerId,
			data: {
				source: { id: source.id, name: label(source) },
				target: { id: target.id, name: label(target) },
				movedAssets: moving.length
			}
		});

		const orgIds = [...new Set(moving.map((a) => a.organizationId))];
		// Both products' accessory profiles are derived from what units carry, so
		// they move whichever side the units were on. The parents' too: a unit
		// whose accessory just became a different product is a unit whose fleet no
		// longer carries what it carried.
		const profiles = new Map<string, { productId: string; organizationId: string }>();
		for (const organizationId of orgIds) {
			for (const productId of [targetProductId, sourceProductId]) {
				profiles.set(`${productId}:${organizationId}`, { productId, organizationId });
			}
		}
		for (const asset of moving) {
			if (!asset.parent) continue;
			const key = `${asset.parent.productId}:${asset.organizationId}`;
			profiles.set(key, {
				productId: asset.parent.productId,
				organizationId: asset.organizationId
			});
		}

		await Promise.all([
			getProducts().refresh(),
			getProducts(target.manufacturerId).refresh(),
			getProducts(source.manufacturerId).refresh(),
			getProductCatalog().refresh(),
			getCableVocabulary().refresh(),
			getAssets().refresh(),
			getRetiredAssets().refresh(),
			getInventorySummary().refresh(),
			...orgIds.flatMap((id) => [
				getProductCatalog(id).refresh(),
				getAssets(id).refresh(),
				getRetiredAssets(id).refresh(),
				getInventorySummary(id).refresh()
			]),
			...moving.flatMap((a) => [getAsset(a.id).refresh(), getAssetHistory(a.id).refresh()]),
			...[...profiles.values()].map((key) => getProductAccessoryProfile(key).refresh()),
			...[...new Set(moving.map((a) => a.bundleId).filter((id) => id !== null))].map((id) =>
				getBundle(id as string).refresh()
			)
		]);
		if (moving.some((a) => a.bundleId)) {
			await getBundleTemplates().refresh();
			await Promise.all(orgIds.map((id) => getBundleTemplates(id).refresh()));
		}

		return {
			movedAssets: moving.length,
			inheritedImage: 'imagePath' in inherited
		};
	}
);

// ── Per-org product pricing ──────────────────────────────────────────────────
// See OrgProductPrice in the schema: the catalog is shared, the price is not.

export const getOrgProductPrices = query(v.string(), async (organizationId: string) => {
	const user = await requireAuth();
	await scopedOrgIds(user.id, organizationId);
	// A DEVICE_VIEWER belongs to the org and sees its equipment, but a price is
	// the business. Null rather than an empty list, so the page leaves the price
	// out instead of saying none is set.
	if (!(await readsOrgRecords(user.id, organizationId))) return null;
	return prisma.orgProductPrice.findMany({
		where: { organizationId },
		select: { productId: true, netPurchasePrice: true }
	});
});

const setOrgProductPriceSchema = v.object({
	organizationId: v.string(),
	productId: v.string(),
	/** Null clears the org's price for this product. */
	netPurchasePrice: v.nullable(v.pipe(v.number(), v.minValue(0)))
});

export const setOrgProductPrice = command(
	setOrgProductPriceSchema,
	async ({ organizationId, productId, netPurchasePrice }) => {
		const user = await requireAuth();
		await requireOrgInventory(organizationId, 'rates_forbidden');
		await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { id: true } });

		const previous = await prisma.orgProductPrice.findUnique({
			where: { organizationId_productId: { organizationId, productId } },
			select: { netPurchasePrice: true }
		});
		if (netPurchasePrice === null) {
			await prisma.orgProductPrice.deleteMany({ where: { organizationId, productId } });
		} else {
			await prisma.orgProductPrice.upsert({
				where: { organizationId_productId: { organizationId, productId } },
				create: { organizationId, productId, netPurchasePrice },
				update: { netPurchasePrice }
			});
		}

		const from = previous ? Number(previous.netPurchasePrice) : null;
		if (from !== netPurchasePrice) {
			await logCatalogChange({
				userId: user.id,
				action: 'PRODUCT_PRICE_SET',
				productId,
				organizationId,
				data: { changes: [{ field: 'netPurchasePrice', from, to: netPurchasePrice }] }
			});
		}

		await Promise.all([
			getOrgProductPrices(organizationId).refresh(),
			getProductCatalog().refresh(),
			getProductCatalog(organizationId).refresh()
		]);
	}
);

// The catalog audit trail, newest first — system-admin only, because it spans
// every org's activity.
export const getCatalogTransactions = query(async () => {
	await requireSystemAdmin();
	const entries = await prisma.catalogTransaction.findMany({
		orderBy: { createdAt: 'desc' },
		take: 200,
		include: { user: { select: { name: true, email: true } } }
	});
	// The log's references are soft — resolve what still exists so the page can
	// show names instead of ids, and fall back to the id for merged-away rows.
	const [products, manufacturers, categories, organizations] = await Promise.all([
		prisma.product.findMany({
			where: {
				id: { in: [...new Set(entries.map((e) => e.productId).filter((id): id is string => !!id))] }
			},
			select: { id: true, name: true, manufacturer: { select: { name: true } } }
		}),
		prisma.manufacturer.findMany({
			where: {
				id: {
					in: [...new Set(entries.map((e) => e.manufacturerId).filter((id): id is string => !!id))]
				}
			},
			select: { id: true, name: true }
		}),
		prisma.category.findMany({
			where: {
				id: {
					in: [...new Set(entries.map((e) => e.categoryId).filter((id): id is string => !!id))]
				}
			},
			select: { id: true, name: true, nameDe: true }
		}),
		prisma.organization.findMany({
			where: {
				id: {
					in: [...new Set(entries.map((e) => e.organizationId).filter((id): id is string => !!id))]
				}
			},
			select: { id: true, name: true, shortName: true }
		})
	]);
	return {
		entries,
		products: Object.fromEntries(
			products.map((p) => [p.id, `${p.manufacturer.name} ${p.name}`] as const)
		),
		manufacturers: Object.fromEntries(manufacturers.map((m) => [m.id, m.name] as const)),
		categories: Object.fromEntries(categories.map((c) => [c.id, c.nameDe || c.name] as const)),
		organizations: Object.fromEntries(
			organizations.map((o) => [o.id, o.shortName || o.name] as const)
		)
	};
});

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
	'isLicense'
] as const;
type RevertibleProductField = (typeof REVERTIBLE_PRODUCT_FIELDS)[number];

/**
 * Put a product back the way one log entry found it.
 *
 * Field by field, and only where the product still holds the value that entry
 * wrote: a field somebody has edited again since is theirs now, and rolling it
 * back would undo a change this entry knows nothing about. The revert is itself
 * logged as an update (`revertOf` names the entry), so it can be undone the
 * same way and the log never has to be rewritten.
 */
export const revertCatalogChange = command(v.string(), async (entryId: string) => {
	const user = await requireSystemAdmin();
	const entry = await prisma.catalogTransaction.findUniqueOrThrow({ where: { id: entryId } });
	const logged = (entry.data as { changes?: FieldChange[] } | null)?.changes ?? [];
	if (entry.action !== 'PRODUCT_UPDATED' || !entry.productId || logged.length === 0) {
		appError(409, 'catalog_revert_unavailable');
	}

	const product = await prisma.product.findUnique({ where: { id: entry.productId } });
	if (!product) appError(409, 'catalog_revert_unavailable');

	const data: Partial<Record<RevertibleProductField, string | number | boolean | null>> = {};
	for (const change of logged) {
		const field = REVERTIBLE_PRODUCT_FIELDS.find((f) => f === change.field);
		if (!field) continue;
		if (String(product[field] ?? null) !== String(change.to ?? null)) continue;
		data[field] = (change.from ?? null) as string | number | boolean | null;
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
	if (Object.keys(data).length === 0 && !portsRevert && !waysRevert) {
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
	if (Object.keys(data).length === 0 && !portsRevert && !waysRevert) {
		appError(409, 'catalog_revert_stale');
	}

	const updated =
		Object.keys(data).length > 0
			? await prisma.product.update({
					where: { id: product.id },
					data: data as Prisma.ProductUncheckedUpdateInput
				})
			: product;
	const changes = fieldChanges(product, data);
	if (waysRevert) {
		await writeWays(product.id, waysRevert);
		changes.push({ field: 'ways', from: waysBefore, to: await waySnapshot(product.id) });
	}
	if (portsRevert) {
		await writePorts(product.id, portsRevert);
		changes.push({ field: 'ports', from: portsBefore, to: await portSnapshot(product.id) });
	}
	await logCatalogChange({
		userId: user.id,
		action: 'PRODUCT_UPDATED',
		productId: updated.id,
		manufacturerId: updated.manufacturerId,
		data: { changes, revertOf: entry.id }
	});

	const cableTouched =
		!!waysRevert ||
		(['cableType', 'connectorA', 'connectorB', 'lengthCm'] as const).some((field) => field in data);
	await refreshProductViews(updated, product.manufacturerId, {
		cable: cableTouched
			? [
					updated.connectorA,
					updated.connectorB,
					...(waysRevert ?? []).flatMap((w) => [w.connectorA, w.connectorB])
				]
			: null
	});
	if (portsRevert) await getConnectorUsage().refresh();
	await getCatalogTransactions().refresh();
});

// ── Bundle templates ─────────────────────────────────────────────────────────

export const getBundleTemplates = query(v.optional(v.string()), async (organizationId?: string) => {
	const user = await requireAuth();
	const queryOrgIds = await scopedOrgIds(user.id, organizationId);

	const templates = await prisma.bundleTemplate.findMany({
		where: { organizationId: { in: queryOrgIds } },
		include: {
			organization: true,
			category: true,
			featuredProducts: FEATURED_PRODUCTS_SELECT,
			instances: {
				include: {
					location: true,
					assets: {
						include: {
							product: {
								include: {
									manufacturer: true,
									category: true,
									ways: { orderBy: { sortOrder: 'asc' } }
								}
							},
							location: true
						},
						orderBy: ASSET_ORDER_BY
					}
				},
				// Two instances of one bundle type are told apart by their tag and
				// nothing else, so that is the order they are listed in.
				orderBy: [{ tag: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]
			}
		},
		orderBy: { name: 'asc' }
	});
	await Promise.all(
		templates.flatMap((template) =>
			template.instances.map(async (bundle) => {
				// The instances are nested under their template here rather than
				// carrying one, so the marked products are handed over explicitly.
				bundle.imagePath = await ensureBundleImageWithoutBreakingRead({ ...bundle, template });
			})
		)
	);
	const priceOrgIds = await priceVisibleOrgIds(user.id, queryOrgIds);
	return templates.map((template) => ({
		...template,
		instances: template.instances.map((bundle) =>
			maskBundlePrice(bundle, template.organizationId, priceOrgIds)
		)
	}));
});

/**
 * What a bundle type holds — one line per product, with how many of it.
 *
 * Read off the cases that exist rather than stored, so it is always the kit as
 * it actually is. Both pickers use it to offer only what still fits, and the
 * bundle page to say what a case is short of.
 */
export const getBundleTypeSpec = query(v.string(), async (templateId: string) => {
	const user = await requireAuth();
	const template = await prisma.bundleTemplate.findUniqueOrThrow({
		where: { id: templateId },
		select: { organizationId: true }
	});
	const orgIds = await userOrgIds(user.id);
	if (!orgIds.includes(template.organizationId) && !(await isSystemAdmin(user.id))) {
		appError(403, 'unauthorized');
	}
	return bundleTypeSpec(templateId);
});

// ── Bundles (instances) ──────────────────────────────────────────────────────

export const getBundles = query(v.optional(v.string()), async (organizationId?: string) => {
	const user = await requireAuth();
	const queryOrgIds = await scopedOrgIds(user.id, organizationId);

	const bundles = await prisma.assetBundle.findMany({
		where: { template: { organizationId: { in: queryOrgIds } } },
		include: {
			template: {
				include: { organization: true, category: true, featuredProducts: FEATURED_PRODUCTS_SELECT }
			},
			location: true,
			assets: {
				include: {
					product: {
						include: { manufacturer: true, category: true, ways: { orderBy: { sortOrder: 'asc' } } }
					},
					location: true
				},
				orderBy: ASSET_ORDER_BY
			}
		},
		orderBy: [{ template: { name: 'asc' } }, { tag: { sort: 'asc', nulls: 'last' } }]
	});
	await Promise.all(bundles.map((bundle) => ensureBundleImageWithoutBreakingRead(bundle)));
	const priceOrgIds = await priceVisibleOrgIds(user.id, queryOrgIds);
	return bundles.map((bundle) =>
		maskBundlePrice(bundle, bundle.template.organizationId, priceOrgIds)
	);
});

export const getBundle = query(v.string(), async (id: string) => {
	const user = await requireAuth();
	const bundle = await prisma.assetBundle.findUniqueOrThrow({
		where: { id },
		include: {
			template: {
				include: { organization: true, category: true, featuredProducts: FEATURED_PRODUCTS_SELECT }
			},
			location: true,
			assets: {
				include: {
					product: {
						include: { manufacturer: true, category: true, ways: { orderBy: { sortOrder: 'asc' } } }
					},
					organization: true,
					location: true
				},
				orderBy: ASSET_ORDER_BY
			}
		}
	});

	const orgIds = await userOrgIds(user.id);
	if (!orgIds.includes(bundle.template.organizationId) && !(await isSystemAdmin(user.id))) {
		appError(403, 'unauthorized');
	}

	await ensureBundleImageWithoutBreakingRead(bundle);
	// The page says "Not set" for a bundle without a price, so it has to be told
	// apart from one whose price this user may not see.
	const pricesVisible = await readsOrgRecords(user.id, bundle.template.organizationId);
	return { ...(pricesVisible ? bundle : { ...bundle, netPurchasePrice: null }), pricesVisible };
});

export const regenerateBundleImage = command(v.string(), async (bundleId) => {
	const bundle = await prisma.assetBundle.findUniqueOrThrow({
		where: { id: bundleId },
		include: {
			template: { include: { category: true, featuredProducts: FEATURED_PRODUCTS_SELECT } },
			assets: { include: { product: true } }
		}
	});
	await requireOrgWrite(bundle.template.organizationId);

	const imagePath = await ensureBundleImage(bundle, true);
	await Promise.all([
		getBundle(bundleId).refresh(),
		getBundles(bundle.template.organizationId).refresh(),
		getBundleTemplates(bundle.template.organizationId).refresh(),
		getBundleTemplates().refresh()
	]);
	return { imagePath };
});

// AssetBundle.tag is globally unique like Asset.assetTag — check up front so the
// user gets a readable message instead of a raw constraint violation.
async function assertBundleTagAvailable(tag: string | null, exceptBundleId?: string) {
	if (!tag) return;
	const clash = await prisma.assetBundle.findUnique({
		where: { tag },
		select: { id: true }
	});
	if (clash && clash.id !== exceptBundleId) {
		appError(409, 'bundle_tag_taken', [tag]);
	}
}

const createBundleInstanceSchema = v.object({
	organizationId: v.string(),
	templateId: v.optional(v.string()),
	newTemplateName: v.optional(v.string()),
	description: v.optional(v.string()),
	categoryId: v.optional(v.string()),
	tag: v.optional(v.string()),
	// The units that go in, picked before the case exists. They are part of the
	// same call because a case of an existing type is only allowed to exist once
	// it holds the kit — created first and filled afterwards, it would spend the
	// time in between as a case that is not the kit, and a failure halfway
	// through would leave it that way for good.
	assetIds: v.optional(v.array(v.string()))
});

export const createBundleInstance = command(createBundleInstanceSchema, async (data) => {
	await requireOrgInventory(data.organizationId);

	// An existing template must belong to the org the caller was authorized for —
	// otherwise ADMIN in one org could hang instances off another org's template.
	if (data.templateId) {
		const existing = await prisma.bundleTemplate.findUniqueOrThrow({
			where: { id: data.templateId },
			select: { organizationId: true }
		});
		if (existing.organizationId !== data.organizationId) appError(403, 'unauthorized');
	}

	await assertBundleTagAvailable(data.tag?.trim() || null);

	let templateId = data.templateId;
	if (data.newTemplateName && !templateId) {
		if (!data.categoryId) appError(400, 'bundle_category_required');
		await prisma.category.findUniqueOrThrow({ where: { id: data.categoryId } });
		const template = await prisma.bundleTemplate.create({
			data: {
				name: data.newTemplateName,
				description: data.description?.trim() || undefined,
				organizationId: data.organizationId,
				categoryId: data.categoryId
			}
		});
		templateId = template.id;
		await getBundleTemplates(data.organizationId).refresh();
		await getBundleTemplates().refresh();
	}

	if (!templateId) appError(400, 'bundle_type_required');

	// Every case of a type holds the same gear, so a new one has to arrive as the
	// kit: the same products, in the same numbers, as the cases already on the
	// shelf. A brand-new type has nothing to match and takes whatever it is given.
	const assetIds = data.assetIds ?? [];
	if (assetIds.length > 0 || !data.newTemplateName) {
		const picked = await prisma.asset.findMany({
			where: { id: { in: assetIds } },
			select: { productId: true }
		});
		if (picked.length !== assetIds.length) appError(404, 'assets_not_found');
		await assertNewInstanceMatchesType(
			templateId,
			picked.map((asset) => asset.productId)
		);
	}

	const bundle = await prisma.$transaction(async (tx) => {
		const created = await tx.assetBundle.create({
			data: {
				templateId,
				tag: data.tag?.trim() || undefined
			},
			include: { template: { include: { organization: true, category: true } }, assets: true }
		});
		for (const assetId of assetIds) await moveAssetIntoBundle(tx, created, assetId);
		return created;
	});
	await getBundleTypeSpec(templateId).refresh();
	await getBundleTemplates(data.organizationId).refresh();
	await getBundleTemplates().refresh();
	await getBundles(data.organizationId).refresh();
	await getBundles().refresh();
	if (assetIds.length > 0) {
		await getAssets(data.organizationId).refresh();
		await getAssets().refresh();
	}
	return bundle;
});

const updateBundleTemplateSchema = v.object({
	templateId: v.string(),
	name: v.optional(v.string()),
	description: v.optional(v.string()),
	categoryId: v.optional(v.string())
});

export const updateBundleTemplate = command(updateBundleTemplateSchema, async (input) => {
	const template = await prisma.bundleTemplate.findUniqueOrThrow({
		where: { id: input.templateId }
	});
	await requireOrgInventory(template.organizationId);

	const data: { name?: string; description?: string | null; categoryId?: string } = {};
	if (input.name !== undefined) data.name = input.name.trim();
	if ('description' in input) data.description = input.description?.trim() || null;
	if (input.categoryId !== undefined) data.categoryId = input.categoryId;

	const updated = await prisma.bundleTemplate.update({
		where: { id: input.templateId },
		data,
		include: { organization: true, category: true }
	});

	await getBundleTemplates(template.organizationId).refresh();
	await getBundleTemplates().refresh();
	await getBundles(template.organizationId).refresh();
	return updated;
});

const setBundleFeaturedProductsSchema = v.object({
	templateId: v.string(),
	productIds: v.array(v.string())
});

/**
 * Which products this bundle type is built around — the distro in a power kit,
 * the hazer in a haze kit.
 *
 * It sits on the template, so it holds for every case built to that spec, and
 * the only thing that reads it is the generated preview: the marked products are
 * drawn large and everything else shares the strip underneath. Marking nothing
 * leaves the old rule in place (loose units large, accessories small), which is
 * why this is a plain set and not a flag per member.
 */
export const setBundleFeaturedProducts = command(
	setBundleFeaturedProductsSchema,
	async ({ templateId, productIds }) => {
		const template = await prisma.bundleTemplate.findUniqueOrThrow({
			where: { id: templateId },
			include: { instances: { select: { id: true } } }
		});
		await requireOrgInventory(template.organizationId);

		// A product nothing in the kit is an instance of would mark a device that
		// never appears in the picture — always a mistake, never a preference.
		const wanted = [...new Set(productIds)];
		if (wanted.length > 0) {
			const held = await prisma.asset.groupBy({
				by: ['productId'],
				where: { bundle: { templateId }, productId: { in: wanted } }
			});
			const heldIds = new Set(held.map((row) => row.productId));
			if (wanted.some((id) => !heldIds.has(id))) appError(400, 'bundle_featured_not_member');
		}

		await prisma.bundleTemplate.update({
			where: { id: templateId },
			data: { featuredProducts: { set: wanted.map((id) => ({ id })) } }
		});

		// Redraw now rather than on the next read: the person who just moved the
		// mark is looking at the picture it changes.
		const instances = await prisma.assetBundle.findMany({
			where: { templateId },
			include: {
				template: { select: { featuredProducts: FEATURED_PRODUCTS_SELECT } },
				assets: { include: { product: true } }
			}
		});
		await Promise.all(instances.map((bundle) => ensureBundleImageWithoutBreakingRead(bundle)));

		await Promise.all([
			...instances.map((bundle) => getBundle(bundle.id).refresh()),
			getBundles(template.organizationId).refresh(),
			getBundles().refresh(),
			getBundleTemplates(template.organizationId).refresh(),
			getBundleTemplates().refresh()
		]);
		return { featuredProductIds: wanted };
	}
);

const updateBundleSchema = v.object({
	bundleId: v.string(),
	tag: v.optional(v.nullable(v.string())),
	locationId: v.optional(v.nullable(v.string())),
	netPurchasePrice: v.optional(v.nullable(v.number()))
});

export const updateBundle = command(updateBundleSchema, async (input) => {
	const bundle = await prisma.assetBundle.findUniqueOrThrow({
		where: { id: input.bundleId },
		include: { template: true, assets: { select: { id: true } } }
	});
	await requireOrgInventory(bundle.template.organizationId);

	const data: {
		tag?: string | null;
		locationId?: string | null;
		netPurchasePrice?: number | null;
	} = {};
	if ('tag' in input) {
		data.tag = input.tag?.trim() || null;
		await assertBundleTagAvailable(data.tag, input.bundleId);
	}
	if ('locationId' in input) data.locationId = input.locationId ?? null;
	if ('netPurchasePrice' in input) data.netPurchasePrice = input.netPurchasePrice ?? null;

	const updated = await prisma.$transaction(async (tx) => {
		const result = await tx.assetBundle.update({
			where: { id: input.bundleId },
			data,
			include: { template: { include: { organization: true, category: true } }, location: true }
		});
		if (input.locationId) {
			// `parent.bundleId` catches accessories whose own bundleId hasn't been
			// mirrored yet — an accessory is wherever its parent is either way.
			await tx.asset.updateMany({
				where: { OR: [{ bundleId: input.bundleId }, { parent: { bundleId: input.bundleId } }] },
				data: { locationId: input.locationId }
			});
		}
		return result;
	});

	await getBundles(bundle.template.organizationId).refresh();
	await getBundles().refresh();
	await getBundle(input.bundleId).refresh();
	await getAssets(bundle.template.organizationId).refresh();
	await getAssets().refresh();
	return updated;
});

const bundleAssetSchema = v.object({ bundleId: v.string(), assetId: v.string() });

const addAssetToBundleSchema = v.object({
	bundleId: v.string(),
	assetId: v.string(),
	// Set only after the user has been told what it means: the unit does not fit
	// what this bundle type holds, and putting it in changes the type for every
	// case of it. See `assertAdditionsFitType`.
	allowTypeChange: v.optional(v.boolean())
});

/** The guards a unit has to pass to join a kit, and the move itself. */
async function moveAssetIntoBundle(
	tx: AssetTx,
	bundle: { id: string; locationId: string | null },
	assetId: string
) {
	const asset = await tx.asset.findUniqueOrThrow({
		where: { id: assetId },
		select: {
			status: true,
			bundleId: true,
			parentAssetId: true,
			bundle: { select: { template: true } }
		}
	});
	if (isRetiredStatus(asset.status)) {
		appError(409, 'asset_retired_no_bundle');
	}
	if (!isBookableStatus(asset.status)) {
		appError(409, 'asset_unavailable_no_bundle');
	}
	// An accessory is in whatever kit its parent is in and no other. Both
	// pickers leave accessories out, so this is a stale page.
	if (asset.parentAssetId) {
		appError(409, 'bundle_accessory_member');
	}
	// A unit belongs to one kit at a time. Both pickers already leave bundled
	// assets out, so reaching here means a stale page — moving it silently would
	// take it out of the other bundle without anyone seeing.
	if (asset.bundleId && asset.bundleId !== bundle.id) {
		appError(409, 'asset_in_other_bundle', [asset.bundle?.template.name ?? '']);
	}
	const updateData: { bundleId: string; locationId?: string } = { bundleId: bundle.id };
	if (bundle.locationId) updateData.locationId = bundle.locationId;
	await tx.asset.update({ where: { id: assetId }, data: updateData });
	// Whatever is attached to it comes along — the kit ships as one thing.
	await syncAccessories(tx, assetId, updateData);
}

export const addAssetToBundle = command(
	addAssetToBundleSchema,
	async ({ bundleId, assetId, allowTypeChange }) => {
		const bundle = await prisma.assetBundle.findUniqueOrThrow({
			where: { id: bundleId },
			include: { template: true }
		});
		await requireOrgInventory(bundle.template.organizationId);
		const { productId } = await prisma.asset.findUniqueOrThrow({
			where: { id: assetId },
			select: { productId: true }
		});
		await assertAdditionsFitType({
			templateId: bundle.templateId,
			bundleId,
			productIds: [productId],
			allowTypeChange
		});
		await prisma.$transaction((tx) => moveAssetIntoBundle(tx, bundle, assetId));
		await getBundleTypeSpec(bundle.templateId).refresh();
		await getBundleTemplates(bundle.template.organizationId).refresh();
		await getBundleTemplates().refresh();
		await getBundles(bundle.template.organizationId).refresh();
		await getBundles().refresh();
		await getBundle(bundleId).refresh();
		// Both variants: the bundle page and the unfiltered Devices list read the
		// argument-less one, and it stayed stale after a bundle was put together.
		await getAssets(bundle.template.organizationId).refresh();
		await getAssets().refresh();
		return { bundleId, assetId };
	}
);

export const removeAssetFromBundle = command(bundleAssetSchema, async ({ bundleId, assetId }) => {
	const bundle = await prisma.assetBundle.findUniqueOrThrow({
		where: { id: bundleId },
		include: { template: true }
	});
	await requireOrgInventory(bundle.template.organizationId);
	await prisma.$transaction(async (tx) => {
		await tx.asset.update({ where: { id: assetId }, data: { bundleId: null } });
		await syncAccessories(tx, assetId, { bundleId: null });
	});
	// The kit is now short of it — which is what the type's spec is read against,
	// and why what it holds may have shrunk as well.
	await getBundleTypeSpec(bundle.templateId).refresh();
	await getBundleTemplates(bundle.template.organizationId).refresh();
	await getBundleTemplates().refresh();
	await getBundles(bundle.template.organizationId).refresh();
	await getBundles().refresh();
	await getBundle(bundleId).refresh();
	// Both variants: the bundle page and the unfiltered Devices list read the
	// argument-less one, and it stayed stale after a bundle was put together.
	await getAssets(bundle.template.organizationId).refresh();
	await getAssets().refresh();
	return { bundleId, assetId };
});

// ── Duplicating a bundle ─────────────────────────────────────────────────────
// A second identical case is an ordinary thing to need, and building it by hand
// means registering every unit and adding it one at a time. What a copy copies
// is the *composition*, not the units: a fixture is in one case at a time, so
// the copy's members have to be other physical units — either ones already on
// the shelf or newly registered ones. That is the same question the accessory
// fan-out asks, and it is asked the same way.

/** Enough of a source member to build its counterpart from. */
const BUNDLE_COPY_ASSET_SELECT = {
	id: true,
	productId: true,
	assetTag: true,
	parentAssetId: true,
	locationId: true,
	product: { select: { name: true, manufacturer: { select: { name: true } } } }
} satisfies Prisma.AssetSelect;

type BundleCopyAsset = Prisma.AssetGetPayload<{ select: typeof BUNDLE_COPY_ASSET_SELECT }>;

/** One unit the copy needs, described by the one it mirrors. */
type BundleCopySlot = {
	productId: string;
	name: string;
	manufacturerName: string;
	/** A tagged original begets a tagged copy. */
	tagged: boolean;
};

type BundleCopyMember = BundleCopySlot & {
	/** Where the original lives, as the last fallback for its counterpart. */
	locationId: string;
	/** What hangs off the original, and therefore has to hang off the copy. */
	accessories: (BundleCopySlot & { count: number })[];
};

/**
 * What the copy has to contain. Accessories are folded into the member they
 * hang off rather than listed beside it: `assets` carries both, because an
 * accessory mirrors its parent's `bundleId`.
 */
function bundleCopyMembers(assets: BundleCopyAsset[]): BundleCopyMember[] {
	const byParent = new Map<string, BundleCopyAsset[]>();
	for (const asset of assets) {
		if (!asset.parentAssetId) continue;
		const list = byParent.get(asset.parentAssetId);
		if (list) list.push(asset);
		else byParent.set(asset.parentAssetId, [asset]);
	}

	const slotOf = (asset: BundleCopyAsset): BundleCopySlot => ({
		productId: asset.productId,
		name: asset.product.name,
		manufacturerName: asset.product.manufacturer.name,
		tagged: asset.assetTag !== null
	});

	return assets
		.filter((asset) => asset.parentAssetId === null)
		.map((asset) => {
			const tally = new Map<string, BundleCopySlot & { count: number }>();
			for (const accessory of byParent.get(asset.id) ?? []) {
				const line = tally.get(accessory.productId);
				if (line) {
					line.count++;
					// Tagged if any of the originals is: a fleet whose cables carry
					// tags is one where somebody decided they should.
					line.tagged = line.tagged || accessory.assetTag !== null;
				} else {
					tally.set(accessory.productId, { ...slotOf(accessory), count: 1 });
				}
			}
			return {
				...slotOf(asset),
				locationId: asset.locationId,
				accessories: [...tally.values()]
			};
		});
}

type BundleCopyAllocation = {
	member: BundleCopyMember;
	/** Comes off the shelf, or null when one has to be registered. */
	take: StockUnit | null;
	/** What is still missing once whatever `take` arrived carrying is counted. */
	accessories: (BundleCopySlot & { take: StockUnit | null })[];
}[];

/**
 * Decide, for every unit every copy needs, whether it comes off the shelf or
 * has to be registered. Run by the dialog against the live pool to say what it
 * would do, and again inside the command's transaction to do it — one function,
 * so what somebody agreed to is what they get.
 *
 * All the copies are allocated in one go because they draw on one shelf: asking
 * for five copies where the pool covers two means two off the shelf and three
 * built, not five of whichever answer the first copy happened to get.
 */
async function allocateBundleCopy(
	client: Pick<typeof prisma, 'asset'>,
	args: {
		organizationId: string;
		members: BundleCopyMember[];
		copies: number;
		locationId: string;
		reuse: boolean;
	}
): Promise<BundleCopyAllocation[]> {
	const empty = () => new Map<string, StockUnit[]>();
	const copies = Array.from({ length: args.copies }, () => args.members);

	// Members are served before accessories, and across every copy, because the
	// two draw on one shelf: a cable that is a member of the kit in its own right
	// is not also available to be bolted onto a fixture.
	const memberPool = args.reuse
		? await stockPool(client, {
				organizationId: args.organizationId,
				productIds: args.members.map((member) => member.productId),
				locationId: args.locationId,
				bundleId: null
			})
		: empty();

	const taken = copies.map((members) =>
		members.map((member) => ({
			member,
			take: memberPool.get(member.productId)?.shift() ?? null
		}))
	);

	// A unit that comes off the shelf already dressed keeps what it has; only
	// the difference is made up.
	const missing = taken.map((copy) =>
		copy.map(({ member, take }) => {
			const already = new Map<string, number>();
			for (const accessory of take?.accessories ?? []) {
				already.set(accessory.productId, (already.get(accessory.productId) ?? 0) + 1);
			}
			return member.accessories.flatMap((line) => {
				const short = line.count - (already.get(line.productId) ?? 0);
				return Array.from({ length: Math.max(0, short) }, () => line as BundleCopySlot);
			});
		})
	);

	const accessoryPool = args.reuse
		? await stockPool(client, {
				organizationId: args.organizationId,
				productIds: missing.flat(2).map((slot) => slot.productId),
				locationId: args.locationId,
				bundleId: null,
				bare: true,
				// Not the ones the members were just promised: when the dialog asks,
				// the write that would have excluded them hasn't happened.
				excludeIds: taken.flat().flatMap(({ take }) => (take ? [take.id] : []))
			})
		: empty();

	return taken.map((copy, copyIndex) =>
		copy.map(({ member, take }, index) => ({
			member,
			take,
			accessories: missing[copyIndex][index].map((slot) => ({
				...slot,
				take: accessoryPool.get(slot.productId)?.shift() ?? null
			}))
		}))
	);
}

/** Per product, how many the copies need and how many of those the shelf covers. */
function bundleCopySummary(allocations: BundleCopyAllocation[]) {
	const lines = new Map<
		string,
		{ productId: string; name: string; manufacturerName: string; needed: number; fromStock: number }
	>();
	const count = (slot: BundleCopySlot, fromStock: boolean) => {
		const line = lines.get(slot.productId) ?? {
			productId: slot.productId,
			name: slot.name,
			manufacturerName: slot.manufacturerName,
			needed: 0,
			fromStock: 0
		};
		line.needed++;
		if (fromStock) line.fromStock++;
		lines.set(slot.productId, line);
	};

	for (const allocation of allocations) {
		for (const entry of allocation) {
			count(entry.member, entry.take !== null);
			for (const slot of entry.accessories) count(slot, slot.take !== null);
		}
	}

	const all = [...lines.values()].sort(
		(a, b) => b.needed - a.needed || a.name.localeCompare(b.name)
	);
	return {
		needed: all.reduce((sum, line) => sum + line.needed, 0),
		fromStock: all.reduce((sum, line) => sum + line.fromStock, 0),
		lines: all
	};
}

/**
 * At most this many copies in one go. The ceiling is the transaction: every
 * unit is its own insert, because an accessory needs its parent's id and a tag
 * comes from a running allocator, so twenty copies of a thirty-piece kit is six
 * hundred round trips holding one transaction open. That is what
 * `BUNDLE_COPY_TIMEOUT_MS` is for, and this is what keeps it reachable.
 */
const MAX_BUNDLE_COPIES = 20;

/**
 * Prisma's default interactive-transaction budget is five seconds, which a kit
 * of any size blows through against a database that isn't on localhost.
 */
const BUNDLE_COPY_TIMEOUT_MS = 60_000;

const bundleCopyPlanSchema = v.object({
	bundleId: v.string(),
	copies: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_BUNDLE_COPIES))
});

/**
 * What the copy dialog puts in front of someone: what the new kits would
 * contain, and how much of it the pool can cover without registering anything.
 * Asked when the dialog opens, and again whenever the number of copies moves,
 * because it is a question about right now.
 */
export const getBundleCopyPlan = query(bundleCopyPlanSchema, async ({ bundleId, copies }) => {
	const user = await requireAuth();
	const bundle = await prisma.assetBundle.findUniqueOrThrow({
		where: { id: bundleId },
		select: {
			locationId: true,
			template: { select: { organizationId: true } },
			assets: {
				where: ACTIVE_ASSET_WHERE,
				select: BUNDLE_COPY_ASSET_SELECT,
				orderBy: ASSET_ORDER_BY
			}
		}
	});

	const orgIds = await userOrgIds(user.id);
	if (!orgIds.includes(bundle.template.organizationId) && !(await isSystemAdmin(user.id))) {
		appError(403, 'unauthorized');
	}

	const members = bundleCopyMembers(bundle.assets);
	return bundleCopySummary(
		await allocateBundleCopy(prisma, {
			organizationId: bundle.template.organizationId,
			members,
			copies,
			locationId: bundle.locationId ?? members[0]?.locationId ?? '',
			reuse: true
		})
	);
});

/**
 * Move a unit off the shelf into a kit, reporting whether it worked. Same
 * guard as `attachStockUnit` and for the same reason: the pool was read before
 * the write, so whoever put this unit in a case in the meantime wins, and the
 * caller registers a new one rather than emptying their case.
 */
async function claimIntoBundle(
	tx: AssetTx,
	unitId: string,
	bundleId: string,
	locationId: string
): Promise<boolean> {
	const { count } = await tx.asset.updateMany({
		where: { id: unitId, bundleId: null, parentAssetId: null },
		data: { bundleId, locationId }
	});
	if (count !== 1) return false;
	// Whatever is bolted to it comes along — the kit ships as one thing.
	await syncAccessories(tx, unitId, { bundleId, locationId });
	return true;
}

const duplicateBundleSchema = v.object({
	bundleId: v.string(),
	/** How many copies to build. They are allocated together — see `allocateBundleCopy`. */
	copies: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_BUNDLE_COPIES))),
	/**
	 * The copy's own tag, and only meaningful for a single one: a tag names one
	 * physical case, so there is nothing sensible to do with it when five are
	 * being built. Same rule `createAssets` follows for a serial number.
	 */
	tag: v.optional(v.string()),
	locationId: v.optional(v.string()),
	/**
	 * Fill the copy from loose stock as far as it goes, registering only what is
	 * left over. Opt-in, so a caller that says nothing never empties a shelf by
	 * accident; the dialog does pre-select it, because a second case is usually
	 * assembled from gear that is already here.
	 */
	reuseExistingAssets: v.optional(v.boolean())
});

/**
 * Build further instances of a bundle type with the same contents. Each new kit
 * is an `AssetBundle` on the same `BundleTemplate` — name, description and
 * category are the type's and stay shared — carrying its own units.
 */
export const duplicateBundle = command(duplicateBundleSchema, async (data) => {
	const user = await requireAuth();
	const source = await prisma.assetBundle.findUniqueOrThrow({
		where: { id: data.bundleId },
		select: {
			templateId: true,
			locationId: true,
			netPurchasePrice: true,
			template: { select: { organizationId: true } },
			assets: {
				where: ACTIVE_ASSET_WHERE,
				select: BUNDLE_COPY_ASSET_SELECT,
				orderBy: ASSET_ORDER_BY
			}
		}
	});
	const organizationId = source.template.organizationId;
	await requireOrgInventory(organizationId);

	const copies = data.copies ?? 1;
	const tag = data.tag?.trim() || null;
	// Reachable from a stale page, so it says what to do rather than dropping the
	// tag on the floor or hanging it on an arbitrary one of the copies.
	if (tag && copies > 1) appError(400, 'bundle_copy_tag_single');
	await assertBundleTagAvailable(tag);

	if (data.locationId) {
		const location = await prisma.location.findUniqueOrThrow({ where: { id: data.locationId } });
		if (location.organizationId !== organizationId) appError(400, 'location_invalid');
	}

	const members = bundleCopyMembers(source.assets);
	// A kit with no location of its own leaves each unit where its counterpart is.
	const bundleLocationId = data.locationId ?? source.locationId ?? null;

	const result = await prisma.$transaction(
		async (tx) => {
			const { assetIdPrefix: prefix, defaultInspectionIntervalMonths } =
				await tx.organization.findUniqueOrThrow({
					where: { id: organizationId },
					select: { assetIdPrefix: true, defaultInspectionIntervalMonths: true }
				});
			const now = new Date();
			const nextInspectionDue = defaultInspectionIntervalMonths
				? new Date(
						now.getFullYear(),
						now.getMonth() + defaultInspectionIntervalMonths,
						now.getDate()
					)
				: null;
			const nextTag = await tagAllocator(tx, prefix);

			// Every copy is allocated before any of it is written, so the shelf is
			// divided up once rather than raided copy by copy.
			const allocations = await allocateBundleCopy(tx, {
				organizationId,
				members,
				copies,
				locationId: bundleLocationId ?? members[0]?.locationId ?? '',
				reuse: data.reuseExistingAssets === true
			});

			let reused = 0;
			let created = 0;
			const bundleIds: string[] = [];
			const touched: string[] = [];

			for (const allocation of allocations) {
				const copy = await tx.assetBundle.create({
					data: {
						templateId: source.templateId,
						tag,
						locationId: bundleLocationId,
						// The instance's own price, which is what bills it as one line.
						netPurchasePrice: source.netPurchasePrice
					},
					select: { id: true }
				});
				bundleIds.push(copy.id);

				for (const entry of allocation) {
					const locationId = bundleLocationId ?? entry.take?.locationId ?? entry.member.locationId;
					let parent: AccessoryParent;

					if (entry.take && (await claimIntoBundle(tx, entry.take.id, copy.id, locationId))) {
						reused++;
						touched.push(entry.take.id);
						parent = { ...entry.take, locationId, bundleId: copy.id };
					} else {
						const unit = await tx.asset.create({
							data: {
								organizationId,
								productId: entry.member.productId,
								locationId,
								assetTag: entry.member.tagged ? nextTag() : null,
								status: 'AVAILABLE',
								bundleId: copy.id,
								inspectionIntervalMonths: defaultInspectionIntervalMonths,
								nextInspectionDue,
								transactions: {
									create: [{ userId: user.id, action: 'CREATED', data: { type: 'CREATED' } }]
								}
							},
							select: {
								id: true,
								assetTag: true,
								product: { select: { name: true, manufacturer: { select: { name: true } } } }
							}
						});
						created++;
						parent = { ...unit, locationId, bundleId: copy.id };
					}

					for (const slot of entry.accessories) {
						if (slot.take && (await attachStockUnit(tx, user.id, slot.take.id, parent))) {
							reused++;
							touched.push(slot.take.id);
							continue;
						}
						await createAccessoryRecord(tx, {
							userId: user.id,
							organizationId,
							productId: slot.productId,
							assetTag: slot.tagged ? nextTag() : null,
							inspectionIntervalMonths: defaultInspectionIntervalMonths,
							nextInspectionDue,
							parent
						});
						created++;
					}
				}
			}

			return { bundleIds, reused, created, touched };
		},
		{ timeout: BUNDLE_COPY_TIMEOUT_MS, maxWait: 15_000 }
	);

	await Promise.all([
		getBundles(organizationId).refresh(),
		getBundles().refresh(),
		getBundleTemplates(organizationId).refresh(),
		getBundleTemplates().refresh(),
		// A second case is what turns the type's composition into a spec the next
		// one has to match.
		getBundleTypeSpec(source.templateId).refresh(),
		getBundle(data.bundleId).refresh(),
		// The dialog counted the shelf and it has just been spent. Only the two
		// counts anyone lands on again are refreshed — it reopens at one, and a
		// refresh re-runs the query on the server, so sweeping every possible
		// count would cost more than the copy did.
		...[...new Set([1, copies])].map((n) =>
			getBundleCopyPlan({ bundleId: data.bundleId, copies: n }).refresh()
		),
		getAssets(organizationId).refresh(),
		getAssets().refresh(),
		getInventorySummary(organizationId).refresh(),
		getInventorySummary().refresh(),
		// Units that came off the shelf changed kit and possibly shelf, and the
		// products involved have less loose stock than they did.
		...result.touched.flatMap((id) => [getAsset(id).refresh(), getAssetHistory(id).refresh()]),
		...[...new Set(members.map((member) => member.productId))].map((productId) =>
			getProductAccessoryProfile({ productId, organizationId }).refresh()
		)
	]);

	return { bundleIds: result.bundleIds, reused: result.reused, created: result.created };
});

const convertBundleToAccessoriesSchema = v.object({
	bundleId: v.string(),
	mainAssetId: v.string()
});

/** Replace one physical bundle with a main device and its attached accessories. */
export const convertBundleToAccessories = command(
	convertBundleToAccessoriesSchema,
	async ({ bundleId, mainAssetId }) => {
		const user = await requireAuth();
		const bundle = await prisma.assetBundle.findUniqueOrThrow({
			where: { id: bundleId },
			include: {
				template: true,
				productionItems: { select: { productionId: true } },
				assets: {
					include: {
						product: { select: { name: true, manufacturer: { select: { name: true } } } }
					}
				}
			}
		});

		await requireOrgInventory(bundle.template.organizationId);

		if (bundle.assets.length < 2) {
			appError(409, 'bundle_too_small');
		}
		const main = bundle.assets.find((asset) => asset.id === mainAssetId);
		if (!main) appError(409, 'bundle_main_not_member');
		if (main.parentAssetId) {
			appError(409, 'bundle_main_is_accessory');
		}
		if (bundle.assets.some((asset) => asset.organizationId !== main.organizationId)) {
			appError(409, 'bundle_members_org_mismatch');
		}

		const newlyAttached = bundle.assets.filter(
			(asset) => asset.id !== main.id && asset.parentAssetId !== main.id
		);
		// The bundle may be lent to a production this user cannot open, and that
		// one keeps its booking but is not refreshed — see `visibleProductionIds`.
		const productionIds = await visibleProductionIds(user.id, [
			...new Set(bundle.productionItems.map((item) => item.productionId))
		]);
		await prisma.$transaction(async (tx) => {
			// Existing nested groups are deliberately flattened: after conversion the
			// selected device is the only parent and every other member follows it.
			await tx.asset.updateMany({
				where: { bundleId, id: { not: main.id } },
				data: { parentAssetId: main.id, bundleId: null, locationId: main.locationId }
			});
			await tx.asset.update({ where: { id: main.id }, data: { bundleId: null } });
			// A production booking remains intact, but it no longer points at a bundle
			// that will cease to exist.
			await tx.productionItem.updateMany({
				where: { sourceBundleId: bundleId },
				data: { sourceBundleId: null }
			});
			for (const accessory of newlyAttached) {
				await tx.assetTransaction.create({
					data: {
						assetId: accessory.id,
						userId: user.id,
						action: 'ACCESSORY_ATTACHED',
						data: {
							type: 'ACCESSORY_ATTACHED',
							parentAssetId: main.id,
							parentLabel: assetLabel(main),
							convertedFromBundleId: bundleId
						}
					}
				});
			}
			await tx.assetBundle.delete({ where: { id: bundleId } });
			const remainingInstances = await tx.assetBundle.count({
				where: { templateId: bundle.templateId }
			});
			if (remainingInstances === 0) {
				await tx.bundleTemplate.delete({ where: { id: bundle.templateId } });
			}
		});

		await Promise.all([
			getAsset(main.id).refresh(),
			getAssetHistory(main.id).refresh(),
			getAssets(main.organizationId).refresh(),
			getAssets().refresh(),
			getBundles(main.organizationId).refresh(),
			getBundles().refresh(),
			getBundleTemplates(main.organizationId).refresh(),
			getBundleTemplates().refresh(),
			getProductAccessoryProfile({
				productId: main.productId,
				organizationId: main.organizationId
			}).refresh(),
			...newlyAttached.flatMap((asset) => [
				getAsset(asset.id).refresh(),
				getAssetHistory(asset.id).refresh()
			]),
			...productionIds.map((productionId) => getProduction(productionId).refresh())
		]);

		return { assetId: main.id, accessories: bundle.assets.length - 1 };
	}
);

// ── Accessories ───────────────────────────────────────────────────────────────

// An accessory is an Asset attached to one parent Asset — see
// src/lib/server/services/accessories.ts. It stays a full asset because a power
// cable is DGUV equipment with its own inspection record; what follows the
// parent is where it lives, what kit it is in, and what it is booked onto.

/** Everything an attach or detach invalidates, on both ends of the relation. */
async function refreshAccessoryPair(
	organizationId: string,
	childId: string,
	parentId: string,
	parentProductId: string,
	bundleIds: (string | null)[]
) {
	await Promise.all([
		getAsset(childId).refresh(),
		getAsset(parentId).refresh(),
		getAssetHistory(childId).refresh(),
		getAssetHistory(parentId).refresh(),
		getAssets(organizationId).refresh(),
		getAssets().refresh(),
		// What the parent's product carries changed for the whole fleet's worth of
		// it, which is what the "add to every unit" offer is computed from.
		getProductAccessoryProfile({ productId: parentProductId, organizationId }).refresh(),
		...[...new Set(bundleIds.filter((id) => id !== null))].flatMap((id) => [
			getBundle(id as string).refresh(),
			getBundles(organizationId).refresh()
		])
	]);
}

function assetLabel(asset: {
	assetTag: string | null;
	product: { name: string; manufacturer: { name: string } };
}) {
	const name = `${asset.product.manufacturer.name} ${asset.product.name}`;
	return asset.assetTag ? `${name} (${asset.assetTag})` : name;
}

/**
 * What the org's units of one product carry, as a single answer for the product
 * rather than for any one unit. There is no table for this: an accessory hangs
 * off an individual asset, so a product-level profile can only be derived from
 * what the fleet actually looks like right now.
 *
 * Two surfaces need it. The asset detail page uses it to say that a unit's
 * siblings exist and can be given the same thing in one go; `createAssets` uses
 * it to give a newly registered unit what the others already have.
 */
async function productAccessoryProfile(productId: string, organizationId: string) {
	const units = await prisma.asset.findMany({
		where: { productId, organizationId, parentAssetId: null, ...ACTIVE_ASSET_WHERE },
		select: {
			id: true,
			accessories: {
				where: ACTIVE_ASSET_WHERE,
				select: {
					productId: true,
					assetTag: true,
					product: { select: { name: true, manufacturer: { select: { name: true } } } }
				}
			}
		}
	});

	type Tally = {
		productId: string;
		name: string;
		manufacturerName: string;
		unitsWith: number;
		tagged: number;
		total: number;
		/** How many units carry exactly N of this accessory. */
		countsPerUnit: Map<number, number>;
	};
	const byProduct = new Map<string, Tally>();

	for (const unit of units) {
		const here = new Map<string, number>();
		for (const acc of unit.accessories) {
			here.set(acc.productId, (here.get(acc.productId) ?? 0) + 1);
			let tally = byProduct.get(acc.productId);
			if (!tally) {
				tally = {
					productId: acc.productId,
					name: acc.product.name,
					manufacturerName: acc.product.manufacturer.name,
					unitsWith: 0,
					tagged: 0,
					total: 0,
					countsPerUnit: new Map()
				};
				byProduct.set(acc.productId, tally);
			}
			tally.total++;
			if (acc.assetTag) tally.tagged++;
		}
		for (const [accProductId, n] of here) {
			const tally = byProduct.get(accProductId)!;
			tally.unitsWith++;
			tally.countsPerUnit.set(n, (tally.countsPerUnit.get(n) ?? 0) + 1);
		}
	}

	// How many of each of these the pool is holding loose right now: unattached,
	// carrying nothing of their own, not spoken for by a job, not in a case. It
	// is the number the create flow can offer to take instead of registering new
	// ones, and it belongs here because the surfaces that ask what the fleet
	// carries are exactly the ones that then have to decide where the next copy
	// comes from.
	const accessoryProductIds = [...byProduct.keys()];
	const freeStock = new Map<string, number>();
	if (accessoryProductIds.length > 0) {
		const rows = await prisma.asset.groupBy({
			by: ['productId'],
			where: {
				productId: { in: accessoryProductIds },
				organizationId,
				parentAssetId: null,
				bundleId: null,
				accessories: { none: {} },
				productionItems: { none: { status: { in: COMMITTED_ITEM_STATUSES } } },
				...BOOKABLE_ASSET_WHERE
			},
			_count: { _all: true }
		});
		for (const row of rows) freeStock.set(row.productId, row._count._all);
	}

	return {
		unitCount: units.length,
		accessories: [...byProduct.values()]
			.map((tally) => ({
				productId: tally.productId,
				freeStock: freeStock.get(tally.productId) ?? 0,
				name: tally.name,
				manufacturerName: tally.manufacturerName,
				unitsWith: tally.unitsWith,
				// The mode, not the mean. "Every unit has two power cables" is a fact
				// about a kit; an average of 1.6 of them is a fact about nothing, and
				// it is the number a copy has to be made from.
				perUnit: [...tally.countsPerUnit.entries()].sort(
					(a, b) => b[1] - a[1] || b[0] - a[0]
				)[0][0],
				// The whole spread, because `unitsWith` only answers "has one at
				// all". A unit carrying two brackets where the rest carry one is not
				// a fleet that already agrees, and saying it is would be a lie the
				// user can see out of the corner of their eye.
				distribution: [...tally.countsPerUnit.entries()]
					.map(([perUnit, units]) => ({ perUnit, units }))
					.sort((a, b) => a.perUnit - b.perUnit),
				// A copy is tagged if the ones already out there are. A fleet whose
				// cables carry tags is one where somebody decided they should.
				tagged: tally.tagged * 2 >= tally.total
			}))
			.sort((a, b) => b.unitsWith - a.unitsWith || a.name.localeCompare(b.name))
	};
}

export type ProductAccessoryProfile = Awaited<ReturnType<typeof productAccessoryProfile>>;

export const getProductAccessoryProfile = query(
	v.object({ productId: v.string(), organizationId: v.string() }),
	async ({ productId, organizationId }) => {
		const user = await requireAuth();
		const orgIds = await userOrgIds(user.id);
		if (!orgIds.includes(organizationId) && !(await isSystemAdmin(user.id))) {
			appError(403, 'unauthorized');
		}
		return await productAccessoryProfile(productId, organizationId);
	}
);

/** What `createAccessoryRecord` needs to know about the unit it is attaching to. */
type AccessoryParent = {
	id: string;
	locationId: string;
	bundleId: string | null;
	assetTag: string | null;
	product: { name: string; manufacturer: { name: string } };
};

/**
 * One accessory, created already attached — the shape both fan-out paths need.
 * It inherits its parent's location and kit for the same reason `attachAccessory`
 * writes them: those two columns are the parent's to decide.
 */
function createAccessoryRecord(
	tx: AssetTx,
	args: {
		userId: string;
		organizationId: string;
		productId: string;
		assetTag: string | null;
		inspectionIntervalMonths: number | null;
		nextInspectionDue: Date | null;
		parent: AccessoryParent;
	}
) {
	return tx.asset.create({
		data: {
			organizationId: args.organizationId,
			productId: args.productId,
			locationId: args.parent.locationId,
			assetTag: args.assetTag,
			status: 'AVAILABLE',
			parentAssetId: args.parent.id,
			bundleId: args.parent.bundleId,
			inspectionIntervalMonths: args.inspectionIntervalMonths,
			nextInspectionDue: args.nextInspectionDue,
			transactions: {
				create: [
					{ userId: args.userId, action: 'CREATED', data: { type: 'CREATED' } },
					{
						userId: args.userId,
						action: 'ACCESSORY_ATTACHED',
						data: {
							type: 'ACCESSORY_ATTACHED',
							parentAssetId: args.parent.id,
							parentLabel: assetLabel(args.parent)
						}
					}
				]
			}
		},
		select: { id: true }
	});
}

// ── Giving every unit of a product the same accessory ────────────────────────
// Adding a power cable to each of twenty fixtures one unit at a time is forty
// clicks and a list to keep in your head of which ones you have done. The
// fan-out below does it in one, and the interesting question it has to answer
// is where the copies come from.
//
// Each unit gets its *own* accessory assets rather than a shared one — that is
// what an accessory is here, a full asset with its own tag and its own DGUV
// record, and a cable in the case of fixture 12 is not the cable in the case of
// fixture 13. But "its own" does not mean "newly invented": a pool that already
// holds twenty brackets on a shelf should end up with those twenty brackets
// bolted onto the fixtures, not with forty brackets on the books. Which of the
// two it is, is the user's call — `reuseExisting` — because only they know
// whether the shelf stock is the same physical thing they are describing.

/** A production still has a claim on the unit; a returned line is done with it. */
const COMMITTED_ITEM_STATUSES = ['PENDING', 'APPROVED', 'CHECKED_OUT'];

/** What a unit has to say about itself to be attached, or attached to. */
const STOCK_UNIT_SELECT = {
	id: true,
	productId: true,
	locationId: true,
	bundleId: true,
	assetTag: true,
	product: { select: { name: true, manufacturer: { select: { name: true } } } },
	// What it already carries, so a unit that comes off the shelf dressed is
	// only topped up to what is wanted rather than dressed twice.
	accessories: { where: ACTIVE_ASSET_WHERE, select: { productId: true } }
} satisfies Prisma.AssetSelect;

type StockUnit = Prisma.AssetGetPayload<{ select: typeof STOCK_UNIT_SELECT }>;

/**
 * Loose stock of these products, grouped by product and ordered the way it
 * should be spent. Same shelf first: taking a unit relocates it, which is right
 * for a cable on the same shelf and merely optimistic for one in another
 * warehouse.
 *
 * Not limited to what is needed, because the premise of taking stock at all is
 * that there is a modest pile of it — and a limit would have to be applied per
 * product, in SQL, before the ordering this does in memory.
 */
async function stockPool(
	client: Pick<typeof prisma, 'asset'>,
	args: {
		organizationId: string;
		productIds: string[];
		/** Where the units are headed, for the same-shelf preference. */
		locationId: string;
		/** The kit they are joining, if any: a candidate already in it is fine. */
		bundleId?: string | null;
		/** Candidates must carry nothing of their own — an accessory has none. */
		bare?: boolean;
		/** Promised to something else earlier in this same run. */
		excludeIds?: string[];
	}
): Promise<Map<string, StockUnit[]>> {
	const byProduct = new Map<string, StockUnit[]>();
	if (args.productIds.length === 0) return byProduct;

	const units = await client.asset.findMany({
		where: {
			productId: { in: args.productIds },
			organizationId: args.organizationId,
			parentAssetId: null,
			productionItems: { none: { status: { in: COMMITTED_ITEM_STATUSES } } },
			// Loose, or already in the kit it would be joining — anything else
			// would have to be pulled out of somebody else's case.
			OR: [{ bundleId: null }, ...(args.bundleId ? [{ bundleId: args.bundleId }] : [])],
			...(args.bare ? { accessories: { none: {} } } : {}),
			...(args.excludeIds?.length ? { id: { notIn: args.excludeIds } } : {}),
			...BOOKABLE_ASSET_WHERE
		},
		select: STOCK_UNIT_SELECT,
		orderBy: ASSET_ORDER_BY
	});

	for (const unit of units) {
		const list = byProduct.get(unit.productId);
		if (list) list.push(unit);
		else byProduct.set(unit.productId, [unit]);
	}
	for (const list of byProduct.values()) {
		list.sort(
			(a, b) => Number(b.locationId === args.locationId) - Number(a.locationId === args.locationId)
		);
	}
	return byProduct;
}

/**
 * Bolt a unit that already exists onto a parent, reporting whether it worked.
 *
 * The pool it came from was read before the write, so `parentAssetId` is in the
 * where clause rather than trusted: somebody attaching the same cable by hand
 * in the meantime must win, and the caller makes a new one instead of quietly
 * undoing their work.
 */
async function attachStockUnit(
	tx: AssetTx,
	userId: string,
	unitId: string,
	parent: AccessoryParent
): Promise<boolean> {
	const { count } = await tx.asset.updateMany({
		where: { id: unitId, parentAssetId: null },
		data: { parentAssetId: parent.id, locationId: parent.locationId, bundleId: parent.bundleId }
	});
	if (count !== 1) return false;

	await tx.assetTransaction.create({
		data: {
			assetId: unitId,
			userId,
			action: 'ACCESSORY_ATTACHED',
			data: {
				type: 'ACCESSORY_ATTACHED',
				parentAssetId: parent.id,
				parentLabel: assetLabel(parent)
			}
		}
	});
	return true;
}

/**
 * What one run of the fan-out would do, worked out before anything is written:
 * which units are short, by how many, and which free units of the accessory
 * product could cover it.
 *
 * Shared by the command and the query the dialog asks, so the count offered to
 * the user is produced by the same rule that will spend it.
 */
async function accessoryFanoutPlan(args: {
	organizationId: string;
	parentProductId: string;
	accessoryProductId: string;
	perUnit: number;
}) {
	// Only units that can hold an accessory: active, and not accessories
	// themselves. `accessories` is narrowed to the one product so its length is
	// the count this run is topping up.
	const units = await prisma.asset.findMany({
		where: {
			productId: args.parentProductId,
			organizationId: args.organizationId,
			parentAssetId: null,
			...ACTIVE_ASSET_WHERE
		},
		select: {
			...STOCK_UNIT_SELECT,
			accessories: {
				where: { productId: args.accessoryProductId, ...ACTIVE_ASSET_WHERE },
				select: { id: true }
			}
		},
		orderBy: ASSET_ORDER_BY
	});

	const todo = units
		.map((unit) => ({ unit, missing: args.perUnit - unit.accessories.length }))
		.filter(({ missing }) => missing > 0);
	const missing = todo.reduce((sum, t) => sum + t.missing, 0);

	// Stock that could be bolted on instead of bought twice. Bookable rather than
	// merely active: `UNAVAILABLE` means the unit isn't actually here — lent out,
	// missing — and pretending it is now part of a fixture's kit would put it on
	// a packing list. One already booked on a job is spoken for too, and would
	// otherwise travel twice, once as itself and once as somebody's accessory.
	const kits = [...new Set(todo.map(({ unit }) => unit.bundleId).filter((id) => id !== null))];
	const pool =
		missing === 0
			? []
			: await prisma.asset.findMany({
					where: {
						productId: args.accessoryProductId,
						organizationId: args.organizationId,
						parentAssetId: null,
						accessories: { none: {} },
						productionItems: { none: { status: { in: COMMITTED_ITEM_STATUSES } } },
						// Loose, or already in a kit one of the targets is in — see
						// `claimReusable` for why anything else is somebody else's decision.
						OR: [{ bundleId: null }, { bundleId: { in: kits as string[] } }],
						...BOOKABLE_ASSET_WHERE
					},
					select: STOCK_UNIT_SELECT,
					orderBy: ASSET_ORDER_BY
				});

	return { units, todo, missing, pool };
}

/**
 * Take the free unit that best fits this target, or nothing. Mutates `pool`:
 * a bracket handed to fixture 12 is not available to fixture 13.
 *
 * A candidate already in a kit can only go to a unit in that same kit — an
 * accessory takes its parent's kit, so moving it anywhere else is a decision
 * about the kit's contents and not one to make on somebody's behalf. Location
 * is a preference rather than a rule: attaching relocates the unit, which is
 * right when the bracket is on the same shelf and merely optimistic when it is
 * in another warehouse, so same-location stock goes first.
 */
function claimReusable(
	pool: StockUnit[],
	unit: { locationId: string; bundleId: string | null }
): StockUnit | null {
	let fallback = -1;
	for (let i = 0; i < pool.length; i++) {
		const candidate = pool[i];
		if (candidate.bundleId !== null && candidate.bundleId !== unit.bundleId) continue;
		if (candidate.locationId === unit.locationId) return pool.splice(i, 1)[0];
		if (fallback < 0) fallback = i;
	}
	return fallback < 0 ? null : pool.splice(fallback, 1)[0];
}

const accessoryFanoutQuerySchema = v.object({
	organizationId: v.string(),
	parentProductId: v.string(),
	productId: v.string(),
	perUnit: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20))
});

/**
 * The numbers the fan-out dialog puts in front of someone: how much is missing
 * across the fleet, and how much of it the pool could cover from stock. Asked
 * for only when the dialog opens, because it is a question about right now —
 * the shelf empties while a page is left open.
 */
export const getAccessoryFanoutPlan = query(accessoryFanoutQuerySchema, async (input) => {
	const user = await requireAuth();
	const orgIds = await userOrgIds(user.id);
	if (!orgIds.includes(input.organizationId) && !(await isSystemAdmin(user.id))) {
		appError(403, 'unauthorized');
	}
	if (input.productId === input.parentProductId) appError(409, 'product_accessory_self');

	const plan = await accessoryFanoutPlan({
		organizationId: input.organizationId,
		parentProductId: input.parentProductId,
		accessoryProductId: input.productId,
		perUnit: input.perUnit
	});

	// Counted the way the command will spend it, kit rule and all, so the dialog
	// can't promise a bracket that turns out to be locked into another case.
	const pool = [...plan.pool];
	let reusable = 0;
	for (const { unit, missing } of plan.todo) {
		for (let n = 0; n < missing; n++) {
			if (!claimReusable(pool, unit)) break;
			reusable++;
		}
	}

	return {
		unitCount: plan.units.length,
		unitsTouched: plan.todo.length,
		missing: plan.missing,
		reusable
	};
});

const addProductAccessoriesSchema = v.object({
	organizationId: v.string(),
	/** The product whose every unit is getting one — not the accessory's own. */
	parentProductId: v.string(),
	...productRefSchema,
	perUnit: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20)),
	noAssetTag: v.optional(v.boolean()),
	/**
	 * Attach free units the pool already holds before registering any new ones.
	 * Off by default, and asked rather than assumed: whether the brackets on the
	 * shelf are the brackets that belong on these fixtures is a fact about the
	 * warehouse that no query can settle.
	 */
	reuseExisting: v.optional(v.boolean())
});

/**
 * Give every unit of a product the same accessory — see the note above for
 * where the copies come from.
 *
 * It tops up rather than adding blindly: `perUnit` is the number each unit
 * should end with, so running it twice does nothing the second time and a unit
 * that already has one of two gets the one it is missing.
 */
export const addProductAccessories = command(addProductAccessoriesSchema, async (data) => {
	const user = await requireAuth();
	await requireOrgInventory(data.organizationId);

	const accessoryProductId = await resolveProductRef(data, data.organizationId, user.id);
	if (accessoryProductId === data.parentProductId) {
		appError(409, 'product_accessory_self');
	}

	const plan = await accessoryFanoutPlan({
		organizationId: data.organizationId,
		parentProductId: data.parentProductId,
		accessoryProductId,
		perUnit: data.perUnit
	});
	if (plan.units.length === 0) appError(409, 'product_no_units_in_org');

	const { todo } = plan;
	const pool = data.reuseExisting ? [...plan.pool] : [];

	const { createdIds, reusedIds } = await prisma.$transaction(async (tx) => {
		const { assetIdPrefix: prefix, defaultInspectionIntervalMonths } =
			await tx.organization.findUniqueOrThrow({
				where: { id: data.organizationId },
				select: { assetIdPrefix: true, defaultInspectionIntervalMonths: true }
			});

		const now = new Date();
		const nextInspectionDue = defaultInspectionIntervalMonths
			? new Date(now.getFullYear(), now.getMonth() + defaultInspectionIntervalMonths, now.getDate())
			: null;
		const nextTag = await tagAllocator(tx, prefix);

		const created: string[] = [];
		const reused: string[] = [];
		for (const { unit, missing } of todo) {
			for (let n = 0; n < missing; n++) {
				const claimed = claimReusable(pool, unit);
				if (claimed && (await attachStockUnit(tx, user.id, claimed.id, unit))) {
					reused.push(claimed.id);
					continue;
				}
				const record = await createAccessoryRecord(tx, {
					userId: user.id,
					organizationId: data.organizationId,
					productId: accessoryProductId,
					assetTag: data.noAssetTag ? null : nextTag(),
					inspectionIntervalMonths: defaultInspectionIntervalMonths,
					nextInspectionDue,
					parent: unit
				});
				created.push(record.id);
			}
		}
		return { createdIds: created, reusedIds: reused };
	});

	await Promise.all([
		getAssets(data.organizationId).refresh(),
		getAssets().refresh(),
		getInventorySummary(data.organizationId).refresh(),
		getInventorySummary().refresh(),
		getProductAccessoryProfile({
			productId: data.parentProductId,
			organizationId: data.organizationId
		}).refresh(),
		// The dialog that asked for this counted the shelf; it has just been spent.
		getAccessoryFanoutPlan({
			organizationId: data.organizationId,
			parentProductId: data.parentProductId,
			productId: accessoryProductId,
			perUnit: data.perUnit
		}).refresh(),
		...todo.flatMap(({ unit }) => [
			getAsset(unit.id).refresh(),
			getAssetHistory(unit.id).refresh()
		]),
		// A reused unit has its own page, and it has just changed parent, kit and
		// possibly shelf on all of them.
		...reusedIds.flatMap((id) => [getAsset(id).refresh(), getAssetHistory(id).refresh()]),
		...[...new Set(todo.map(({ unit }) => unit.bundleId).filter((id) => id !== null))].map((id) =>
			getBundle(id as string).refresh()
		)
	]);
	if (todo.some(({ unit }) => unit.bundleId)) {
		await getBundles(data.organizationId).refresh();
		await getBundleTemplates(data.organizationId).refresh();
		await getBundleTemplates().refresh();
	}

	return {
		created: createdIds.length,
		reused: reusedIds.length,
		unitsTouched: todo.length,
		unitsSkipped: plan.units.length - todo.length
	};
});

const accessoryLinkSchema = v.object({ parentId: v.string(), assetId: v.string() });

export const attachAccessory = command(accessoryLinkSchema, async ({ parentId, assetId }) => {
	const user = await requireAuth();

	if (parentId === assetId) appError(400, 'accessory_self');

	const labelInclude = {
		assetTag: true,
		productId: true,
		product: { select: { name: true, manufacturer: { select: { name: true } } } }
	};

	const [parent, asset] = await Promise.all([
		prisma.asset.findUniqueOrThrow({
			where: { id: parentId },
			select: {
				id: true,
				status: true,
				organizationId: true,
				locationId: true,
				bundleId: true,
				parentAssetId: true,
				...labelInclude
			}
		}),
		prisma.asset.findUniqueOrThrow({
			where: { id: assetId },
			select: {
				id: true,
				status: true,
				organizationId: true,
				bundleId: true,
				parentAssetId: true,
				accessories: { select: { id: true }, take: 1 },
				bundle: { select: { template: { select: { name: true } } } },
				...labelInclude
			}
		})
	]);

	await requireOrgInventory(parent.organizationId);

	// Rule 1 of the feature, guard by guard. Every one of these is reachable
	// from a stale page, so each says what to do rather than just refusing.
	if (isRetiredStatus(parent.status) || isRetiredStatus(asset.status)) {
		appError(409, 'asset_retired_no_attach');
	}
	if (parent.organizationId !== asset.organizationId) {
		appError(409, 'accessory_org_mismatch');
	}
	if (parent.parentAssetId) {
		appError(409, 'accessory_nested');
	}
	if (asset.accessories.length > 0) {
		appError(409, 'accessory_has_accessories');
	}
	if (asset.parentAssetId && asset.parentAssetId !== parentId) {
		appError(409, 'accessory_already_attached');
	}
	// It follows the parent into a kit; it can't arrive carrying a different one.
	if (asset.bundleId && asset.bundleId !== parent.bundleId) {
		appError(409, 'accessory_in_bundle', [asset.bundle?.template.name ?? '']);
	}

	await prisma.asset.update({
		where: { id: assetId },
		data: {
			parentAssetId: parentId,
			locationId: parent.locationId,
			bundleId: parent.bundleId
		}
	});

	await prisma.assetTransaction.create({
		data: {
			assetId,
			userId: user.id,
			action: 'ACCESSORY_ATTACHED',
			data: {
				type: 'ACCESSORY_ATTACHED',
				parentAssetId: parentId,
				parentLabel: assetLabel(parent)
			}
		}
	});

	await refreshAccessoryPair(parent.organizationId, assetId, parentId, parent.productId, [
		parent.bundleId,
		asset.bundleId
	]);
	return { parentId, assetId };
});

export const detachAccessory = command(v.string(), async (assetId: string) => {
	const user = await requireAuth();

	const asset = await prisma.asset.findUniqueOrThrow({
		where: { id: assetId },
		select: {
			id: true,
			organizationId: true,
			bundleId: true,
			parentAssetId: true,
			parent: {
				select: {
					assetTag: true,
					productId: true,
					product: { select: { name: true, manufacturer: { select: { name: true } } } }
				}
			}
		}
	});
	if (!asset.parentAssetId || !asset.parent) appError(409, 'not_an_accessory');

	await requireOrgInventory(asset.organizationId);

	// It was only ever in that kit through the parent, so it leaves with the
	// relation. Its location stays: detaching a cable doesn't move it.
	await prisma.asset.update({
		where: { id: assetId },
		data: { parentAssetId: null, bundleId: null }
	});

	await prisma.assetTransaction.create({
		data: {
			assetId,
			userId: user.id,
			action: 'ACCESSORY_DETACHED',
			data: {
				type: 'ACCESSORY_DETACHED',
				parentAssetId: asset.parentAssetId,
				parentLabel: assetLabel(asset.parent)
			}
		}
	});

	await refreshAccessoryPair(
		asset.organizationId,
		assetId,
		asset.parentAssetId,
		asset.parent.productId,
		[asset.bundleId]
	);
	return { assetId };
});

// ── CSV Import ────────────────────────────────────────────────────────────────

const importRowSchema = v.object({
	manufacturerName: v.string(),
	productName: v.string(),
	categoryId: v.optional(v.string()),
	serialNumber: v.optional(v.string()),
	assetTag: v.optional(v.string())
});

const importAssetsSchema = v.object({
	organizationId: v.string(),
	locationId: v.string(),
	rows: v.array(importRowSchema)
});

export type ImportResult = {
	created: number;
	skipped: number;
	errors: { rowIndex: number; message: string }[];
};

export const importAssets = command(importAssetsSchema, async (data): Promise<ImportResult> => {
	const user = await requireAuth();
	await requireOrgInventory(data.organizationId, 'asset_create_forbidden');

	const location = await prisma.location.findUniqueOrThrow({ where: { id: data.locationId } });
	if (location.organizationId !== data.organizationId) appError(400, 'location_invalid');

	const org = await prisma.organization.findUniqueOrThrow({
		where: { id: data.organizationId },
		select: { assetIdPrefix: true }
	});
	const prefix = org.assetIdPrefix;

	// Determine next auto-tag number for this org's prefix
	const lastByPrefix = await prisma.asset.findFirst({
		where: { assetTag: { startsWith: prefix } },
		orderBy: { assetTag: 'desc' },
		select: { assetTag: true }
	});
	let nextIdNum = 1;
	if (lastByPrefix?.assetTag) {
		const parsed = parseInt(lastByPrefix.assetTag.slice(prefix.length), 10);
		if (!isNaN(parsed)) nextIdNum = parsed + 1;
	}

	// Upsert manufacturers (case-insensitive)
	const manufacturerCache = new Map<string, string>();
	for (const row of data.rows) {
		const key = row.manufacturerName.trim().toLowerCase();
		if (!key || manufacturerCache.has(key)) continue;
		let m = await prisma.manufacturer.findFirst({
			where: { name: { equals: row.manufacturerName.trim(), mode: 'insensitive' } }
		});
		if (!m) m = await prisma.manufacturer.create({ data: { name: row.manufacturerName.trim() } });
		manufacturerCache.set(key, m.id);
	}

	// Upsert products (case-insensitive, keyed by name+manufacturerId)
	const productCache = new Map<string, string>();
	const seenProducts = new Set<string>();
	for (const row of data.rows) {
		const mfKey = row.manufacturerName.trim().toLowerCase();
		const manufacturerId = manufacturerCache.get(mfKey);
		if (!manufacturerId) continue;
		const prodKey = `${row.productName.trim().toLowerCase()}::${manufacturerId}`;
		if (seenProducts.has(prodKey)) continue;
		seenProducts.add(prodKey);
		let p = await prisma.product.findFirst({
			where: { name: { equals: row.productName.trim(), mode: 'insensitive' }, manufacturerId }
		});
		if (!p) {
			if (!row.categoryId) continue;
			p = await prisma.product.create({
				data: {
					name: row.productName.trim(),
					manufacturerId,
					categoryId: row.categoryId,
					createdById: user.id
				}
			});
		}
		productCache.set(prodKey, p.id);
	}

	let created = 0;
	const skipped = 0;
	const errors: { rowIndex: number; message: string }[] = [];

	for (let i = 0; i < data.rows.length; i++) {
		const row = data.rows[i];
		try {
			const mfKey = row.manufacturerName.trim().toLowerCase();
			const manufacturerId = manufacturerCache.get(mfKey);
			if (!manufacturerId) {
				errors.push({ rowIndex: i, message: `Manufacturer "${row.manufacturerName}" not found` });
				continue;
			}
			const prodKey = `${row.productName.trim().toLowerCase()}::${manufacturerId}`;
			const productId = productCache.get(prodKey);
			if (!productId) {
				errors.push({
					rowIndex: i,
					message: row.categoryId
						? `Product "${row.productName}" could not be created`
						: `Product "${row.productName}" not found — no category provided to create it`
				});
				continue;
			}

			// Resolve asset tag (serves as unique ID)
			const rowTag = row.assetTag?.trim() || null;
			let resolvedTag: string;
			if (rowTag) {
				if (!rowTag.startsWith(prefix)) {
					errors.push({
						rowIndex: i,
						message: `Asset tag "${rowTag}" must start with org prefix "${prefix}"`
					});
					continue;
				}
				const existing = await prisma.asset.findUnique({ where: { assetTag: rowTag } });
				if (existing) {
					errors.push({ rowIndex: i, message: `Asset tag "${rowTag}" already exists` });
					continue;
				}
				resolvedTag = rowTag;
			} else {
				resolvedTag = `${prefix}${String(nextIdNum++).padStart(5, '0')}`;
			}
			await prisma.asset.create({
				data: {
					organizationId: data.organizationId,
					productId,
					locationId: data.locationId,
					serialNumber: row.serialNumber?.trim() || null,
					assetTag: resolvedTag,
					status: 'AVAILABLE',
					transactions: {
						create: { userId: user.id, action: 'CREATED', data: { type: 'CREATED' } }
					}
				}
			});
			created++;
		} catch (err) {
			errors.push({ rowIndex: i, message: (err as Error).message });
		}
	}

	if (created > 0) {
		await refreshAfterUnitsCreated(data.organizationId, [...productCache.values()]);
		await getManufacturers().refresh();
		await getProducts().refresh();
	}

	return { created, skipped, errors };
});

// ── Generated previews: instance-wide regeneration ───────────────────────────
//
// `ensureBundleImage`/`ensureAssetImage` only redraw when a bundle's contents
// changed, which is right: a preview costs an object-store round trip per photo.
// So a change to how they are *drawn* leaves every stored image stale until
// something else happens to touch it. Bumping the fingerprint's version string
// invalidates them, but only lazily, one page view at a time.
//
// This pair is the eager version, for an admin who wants the whole estate
// redrawn now. It is deliberately split into a list and a per-item command
// rather than one long-running call: the work is entirely I/O against the
// object store, a few hundred bundles take minutes, and a single request would
// give the browser nothing to show and a proxy something to time out. The
// client walks the list and knows exactly how far along it is.

export const listGeneratedPreviews = query(async () => {
	await requireSystemAdmin();
	const [bundles, assets] = await Promise.all([
		prisma.assetBundle.findMany({ select: { id: true }, orderBy: { id: 'asc' } }),
		// Only units that have accessories have a preview at all — for anything
		// else `ensureAssetImage` returns null and there is nothing to redraw.
		prisma.asset.findMany({
			where: { accessories: { some: {} } },
			select: { id: true },
			orderBy: { id: 'asc' }
		})
	]);
	return [
		...bundles.map((bundle) => ({ kind: 'bundle' as const, id: bundle.id })),
		...assets.map((asset) => ({ kind: 'asset' as const, id: asset.id }))
	];
});

export const regenerateGeneratedPreview = command(
	v.object({ kind: v.picklist(['bundle', 'asset']), id: v.string() }),
	async ({ kind, id }) => {
		await requireSystemAdmin();
		if (kind === 'bundle') {
			const bundle = await prisma.assetBundle.findUniqueOrThrow({
				where: { id },
				include: {
					template: { select: { featuredProducts: FEATURED_PRODUCTS_SELECT } },
					assets: { include: { product: true } }
				}
			});
			await ensureBundleImage(bundle, true);
			return;
		}
		const asset = await prisma.asset.findUniqueOrThrow({
			where: { id },
			include: { product: true, accessories: { include: { product: true } } }
		});
		await ensureAssetImage(asset, true);
	}
);

/**
 * Which other units already carry this serial number, for the warning the asset
 * forms show while it is being typed. Scanning resolves a serial only when it
 * belongs to exactly one unit (see `resolveScannedCode`), so a duplicate is
 * worth saying out loud — but it is a warning, not a refusal: two devices
 * really do sometimes arrive with the same number on the label, and the asset
 * tag is what the system identifies a unit by regardless.
 */
export const getSerialNumberUse = query(
	v.object({
		serialNumber: v.string(),
		/** The unit being edited, which is not a duplicate of itself. */
		excludeAssetId: v.optional(v.string())
	}),
	async ({ serialNumber, excludeAssetId }) => {
		const user = await requireAuth();
		return await assetsWithSerial(user.id, serialNumber, { excludeAssetId, take: 5 });
	}
);
