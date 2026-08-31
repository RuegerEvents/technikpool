import { query, command } from '$app/server';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/auth';
import type { Prisma } from '$lib/prisma/client';
import * as v from 'valibot';
import type { FieldChange } from '$lib/types/asset-transaction';
import { isSystemAdmin, requireAuth, scopedOrgIds, userOrgIds } from '$lib/server/services/access';
import {
	ACTIVE_ASSET_WHERE,
	ASSET_STATUSES,
	RETIRED_ASSET_WHERE,
	isRetiredStatus
} from '$lib/asset-status';
import { syncAccessories } from '$lib/server/services/accessories';
import { ensureAssetImage, ensureBundleImage } from '$lib/server/services/bundle-image';
import { getProduction } from '$lib/remote/productions.remote';

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

const ACCESSORIES_INCLUDE = {
	where: ACTIVE_ASSET_WHERE,
	include: { product: { include: { manufacturer: true, category: true } } },
	orderBy: ASSET_ORDER_BY
} as const;

export const getAssets = query(v.optional(v.string()), async (organizationId?: string) => {
	const user = await requireAuth();
	const queryOrgIds = await scopedOrgIds(user.id, organizationId);

	const assets = await prisma.asset.findMany({
		where: { organizationId: { in: queryOrgIds }, ...ACTIVE_ASSET_WHERE },
		include: {
			product: { include: { manufacturer: true, category: true } },
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
			product: { include: { manufacturer: true, category: true } },
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
			product: { include: { manufacturer: true, category: true } },
			location: true,
			organization: true,
			bundle: { select: { id: true, template: { select: { name: true } } } },
			parent: PARENT_SELECT,
			accessories: ACCESSORIES_INCLUDE
		}
	});

	if (!systemAdmin && !orgIds.includes(asset.organizationId)) {
		throw new Error('Unauthorized');
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
				maintenance: p.assets.filter((a) => a.status === 'MAINTENANCE').length,
				broken: p.assets.filter((a) => a.status === 'BROKEN').length
			}));
	}
);

export const getManufacturers = query(async () => {
	await requireAuth();
	return await prisma.manufacturer.findMany({ orderBy: { name: 'asc' } });
});

export const getCategories = query(async () => {
	await requireAuth();
	return await prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
});

const updateCategorySchema = v.object({
	categoryId: v.string(),
	name: v.optional(v.string()),
	nameDe: v.optional(v.nullable(v.string())),
	color: v.optional(v.string()),
	sortOrder: v.optional(v.number())
});

/**
 * Categories are global, not per-org — one org renaming "Light" would rename it
 * on every other org's assets — so editing them is a system-admin action.
 * `name` stays the English source name; `nameDe` is what the German UI and a
 * German billing document show.
 */
export const updateCategory = command(updateCategorySchema, async (input) => {
	const user = await requireAuth();
	if (!(await isSystemAdmin(user.id))) error(403, 'Admin access required');

	const data: { name?: string; nameDe?: string | null; color?: string; sortOrder?: number } = {};
	if ('name' in input) {
		const name = input.name?.trim();
		if (!name) error(400, 'A category needs an English name');
		const clash = await prisma.category.findFirst({
			where: { name, id: { not: input.categoryId } },
			select: { id: true }
		});
		if (clash) error(409, `Another category is already called "${name}"`);
		data.name = name;
	}
	if ('nameDe' in input) data.nameDe = input.nameDe?.trim() || null;
	if ('color' in input) data.color = input.color;
	if ('sortOrder' in input) data.sortOrder = input.sortOrder;

	const updated = await prisma.category.update({ where: { id: input.categoryId }, data });
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
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);

	if (!systemAdmin) {
		const membership = await prisma.orgMembership.findUnique({
			where: {
				userId_organizationId: { userId: user.id, organizationId: input.organizationId }
			}
		});
		if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
			throw new Error('Unauthorized');
		}
	}

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
	return location;
});

const updateLocationSchema = v.object({
	locationId: v.string(),
	name: v.optional(v.string()),
	address: v.optional(addressInputSchema)
});

export const updateLocation = command(updateLocationSchema, async (input) => {
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);

	const location = await prisma.location.findUniqueOrThrow({
		where: { id: input.locationId },
		select: { id: true, organizationId: true, addressId: true }
	});

	if (!systemAdmin) {
		const membership = await prisma.orgMembership.findUnique({
			where: {
				userId_organizationId: { userId: user.id, organizationId: location.organizationId }
			}
		});
		if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
			throw new Error('Unauthorized');
		}
	}

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
	return updated;
});

export const getProducts = query(v.optional(v.string()), async (manufacturerId?: string) => {
	await requireAuth();
	return await prisma.product.findMany({
		where: manufacturerId ? { manufacturerId } : undefined,
		orderBy: { name: 'asc' },
		include: { manufacturer: true, category: true }
	});
});

/**
 * The complete product catalogue. Counts remain scoped to the selected
 * organization(s), but products with no matching units must stay visible: this
 * is also the place where abandoned catalogue rows are cleaned up.
 */
export const getProductCatalog = query(v.optional(v.string()), async (organizationId?: string) => {
	const user = await requireAuth();
	const queryOrgIds = await scopedOrgIds(user.id, organizationId);

	const assetScope = { organizationId: { in: queryOrgIds }, ...ACTIVE_ASSET_WHERE };

	const products = await prisma.product.findMany({
		include: {
			manufacturer: true,
			category: true,
			assets: { select: { id: true }, take: 1 },
			_count: { select: { assets: { where: assetScope } } }
		},
		orderBy: [{ manufacturer: { name: 'asc' } }, { name: 'asc' }]
	});

	return products.map(({ _count, assets, ...product }) => ({
		...product,
		assetCount: _count.assets,
		hasAssets: assets.length > 0
	}));
});

/** The manufacturer/product half of a create form, which two commands now ask for. */
const productRefSchema = {
	productId: v.optional(v.string()),
	newProductName: v.optional(v.string()),
	newProductImagePath: v.optional(v.string()),
	newProductNetPurchasePrice: v.optional(v.nullable(v.pipe(v.number(), v.minValue(0)))),
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
async function resolveProductRef(data: ProductRef): Promise<string> {
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

	let productId = data.productId;
	if (data.newProductName && !productId && manufacturerId) {
		if (!data.categoryId) throw new Error('Category is required when creating a new product');
		await prisma.category.findUniqueOrThrow({ where: { id: data.categoryId } });
		const p = await prisma.product.create({
			data: {
				name: data.newProductName,
				manufacturerId,
				categoryId: data.categoryId,
				imagePath: data.newProductImagePath?.trim() || null,
				netPurchasePrice: data.newProductNetPurchasePrice ?? null
			}
		});
		productId = p.id;
		await getProducts(manufacturerId).refresh();
	}

	if (!productId) throw new Error('Product is required');
	return productId;
}

/** The subset of a Prisma client these helpers need — the real one or a `$transaction` handle. */
type AssetTx = Pick<typeof prisma, 'asset' | 'organization'>;

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

	const membership = await prisma.orgMembership.findUnique({
		where: { userId_organizationId: { userId: user.id, organizationId: data.organizationId } }
	});
	if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
		throw new Error('Unauthorized to create assets in this org');
	}

	const productId = await resolveProductRef(data);

	// An accessory is wherever its parent is and in whatever kit its parent is
	// in, so the parent decides both — the caller's locationId is ignored. The
	// parent-side guards are the ones from `attachAccessory`; the child-side ones
	// can't fail for a unit that is being created here and now.
	if (data.parentAssetId && data.bundleId) {
		error(400, 'An accessory is in whatever kit its parent is in — pass one or the other');
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
			error(409, 'An accessory has to belong to the same organisation as what it is attached to');
		}
		if (isRetiredStatus(parent.status)) {
			error(409, 'A sold or decommissioned unit cannot have accessories attached to it');
		}
		if (parent.parentAssetId) {
			error(409, 'That unit is itself an accessory — accessories are one level deep');
		}
	}

	// A kit's own location wins over the caller's for the same reason a parent's
	// does — `addAssetToBundle` applies it to anything joining an existing
	// bundle. A bundle with no location of its own leaves the choice open.
	const bundle = data.bundleId
		? await prisma.assetBundle.findUniqueOrThrow({
				where: { id: data.bundleId },
				select: { id: true, locationId: true, template: { select: { organizationId: true } } }
			})
		: null;
	if (bundle && bundle.template.organizationId !== data.organizationId) {
		error(409, 'That bundle belongs to a different organisation');
	}

	const locationId = parent?.locationId ?? bundle?.locationId ?? data.locationId;
	const location = await prisma.location.findUniqueOrThrow({ where: { id: locationId } });
	if (location.organizationId !== data.organizationId) throw new Error('Invalid location');

	// What the org's other units of this product already carry. Read before the
	// transaction opens, so it describes the fleet as it was — the units being
	// created here are not in it. An accessory gets none of its own: one level
	// deep, and a power cable has no brackets.
	const accessoryProfile =
		data.copyProductAccessories && !data.parentAssetId
			? await productAccessoryProfile(productId, data.organizationId)
			: null;

	const assets = await prisma.$transaction(async (tx) => {
		const { assetIdPrefix: prefix, defaultInspectionIntervalMonths } =
			await tx.organization.findUniqueOrThrow({
				where: { id: data.organizationId },
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

		const created = await Promise.all(
			data.items.map((item) => {
				let resolvedTag: string | null;
				if (item.noAssetTag) {
					resolvedTag = null;
				} else if (item.assetTag?.trim()) {
					const tag = item.assetTag.trim();
					if (!tag.startsWith(prefix))
						throw new Error(`Asset tag "${tag}" must start with org prefix "${prefix}"`);
					resolvedTag = tag;
				} else {
					resolvedTag = nextTag();
				}

				return tx.asset.create({
					data: {
						organizationId: data.organizationId,
						productId: productId!,
						locationId: location.id,
						serialNumber: item.serialNumber || null,
						assetTag: resolvedTag,
						status: 'AVAILABLE',
						parentAssetId: parent?.id ?? null,
						bundleId: parent?.bundleId ?? bundle?.id ?? null,
						// Snapshot, not a live reference — see Organization.defaultInspectionIntervalMonths.
						inspectionIntervalMonths: defaultInspectionIntervalMonths,
						nextInspectionDue,
						transactions: {
							create: [
								{ userId: user.id, action: 'CREATED', data: { type: 'CREATED' } },
								// Two entries rather than one: the unit was created, and it was
								// attached. Detaching it later leaves the first one true.
								...(parent
									? [
											{
												userId: user.id,
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
					include: { product: { include: { manufacturer: true, category: true } }, location: true }
				});
			})
		);

		// In the same transaction as the units themselves: a fixture that reaches
		// the pool without the brackets every other one of its kind has is worse
		// than one that was never created — nothing about it looks wrong later.
		if (accessoryProfile) {
			for (const unit of created) {
				for (const acc of accessoryProfile.accessories) {
					for (let n = 0; n < acc.perUnit; n++) {
						await createAccessoryRecord(tx, {
							userId: user.id,
							organizationId: data.organizationId,
							productId: acc.productId,
							assetTag: acc.tagged ? nextTag() : null,
							inspectionIntervalMonths: defaultInspectionIntervalMonths,
							nextInspectionDue,
							parent: {
								id: unit.id,
								locationId: unit.locationId,
								bundleId: unit.bundleId,
								assetTag: unit.assetTag,
								product: unit.product
							}
						});
					}
				}
			}
		}

		return created;
	});

	await getAssets(data.organizationId).refresh();
	await getAssets().refresh();
	await getInventorySummary(data.organizationId).refresh();
	await getInventorySummary().refresh();
	if (accessoryProfile) {
		await Promise.all(assets.map((a) => getAsset(a.id).refresh()));
	}
	// Both ends move: the product just gained a unit, and if these were
	// accessories the parent's product now carries one more of them.
	await getProductAccessoryProfile({
		productId,
		organizationId: data.organizationId
	}).refresh();
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
		await getBundle(touchedBundleId).refresh();
		await getBundles(data.organizationId).refresh();
		await getBundleTemplates(data.organizationId).refresh();
		await getBundleTemplates().refresh();
	}

	return assets;
});

export const getAssetHistory = query(v.string(), async (assetId: string) => {
	const user = await requireAuth();
	const orgIds = await userOrgIds(user.id);
	const systemAdmin = await isSystemAdmin(user.id);

	const asset = await prisma.asset.findUniqueOrThrow({
		where: { id: assetId },
		select: { organizationId: true }
	});
	if (!systemAdmin && !orgIds.includes(asset.organizationId)) {
		throw new Error('Unauthorized');
	}

	return await prisma.assetTransaction.findMany({
		where: { assetId },
		include: {
			user: { select: { name: true, email: true } },
			production: { select: { name: true } }
		},
		orderBy: { createdAt: 'desc' }
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
	const systemAdmin = await isSystemAdmin(user.id);

	const asset = await prisma.asset.findUniqueOrThrow({
		where: { id: input.assetId },
		include: {
			location: true,
			product: true,
			bundle: { include: { template: true } },
			accessories: { select: { id: true } }
		}
	});

	if (!systemAdmin) {
		const membership = await prisma.orgMembership.findUnique({
			where: {
				userId_organizationId: { userId: user.id, organizationId: asset.organizationId }
			}
		});
		if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
			throw new Error('Unauthorized');
		}
	}

	// A sold or decommissioned unit is a historical record. Its status stays
	// editable so a mis-click can be undone; everything else is frozen.
	const nextStatus = input.status;
	const editedFields = Object.keys(input).filter((k) => k !== 'assetId' && k !== 'status');
	if (isRetiredStatus(asset.status) && editedFields.length > 0) {
		throw new Error('This asset is sold or decommissioned — only its status can be changed');
	}

	const retiring = !!nextStatus && isRetiredStatus(nextStatus) && !isRetiredStatus(asset.status);
	if (retiring) {
		const openItem = await prisma.productionItem.findFirst({
			where: { assetId: asset.id, status: { in: ['PENDING', 'APPROVED', 'CHECKED_OUT'] } },
			include: { production: { select: { name: true } } }
		});
		if (openItem) {
			throw new Error(
				`Asset is still booked for "${openItem.production.name}" — remove it there first`
			);
		}
	}

	let nextLocation: { id: string; name: string } | undefined = undefined;
	if ('locationId' in input) {
		if (input.locationId) {
			const loc = await prisma.location.findUniqueOrThrow({ where: { id: input.locationId } });
			if (loc.organizationId !== asset.organizationId) throw new Error('Invalid location');
			nextLocation = loc;
		} else {
			throw new Error('Location is required');
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
	if (assets.length === 0) error(404, 'No assets found');

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
		if (organizationIds.some((id) => !allowed.has(id))) error(403, 'Unauthorized');
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
			include: { production: { select: { name: true } } }
		});
		if (openItems.length > 0) {
			const blocked = new Set(openItems.map((i) => i.assetId)).size;
			const names = [...new Set(openItems.map((i) => i.production.name))];
			const shown = names
				.slice(0, 3)
				.map((n) => `"${n}"`)
				.join(', ');
			const list = names.length > 3 ? `${shown}, …` : shown;
			error(
				409,
				blocked === 1
					? `One asset is still booked for ${list} — remove it there first`
					: `${blocked} assets are still booked (${list}) — remove them there first`
			);
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
// mis-scan, or a row created to try something out. Anything that moved has an
// audit trail, a place in a production's history, or a billing line pointing at
// it, and those records exist precisely so they can't be quietly rewritten. The
// honest way out of a real unit is retiring it — see RETIRED_ASSET_STATUSES.
//
// Every check below is the reason this isn't left to the database. Prisma
// cascades ProductionItem, AssetTransaction and Inspection, so the delete would
// succeed and take the history with it. OfferItem and InvoiceItem are worse:
// they reference an asset by id with no foreign key at all, so nothing but this
// would stop a delete from orphaning a line on an issued invoice.

// The guards below use SvelteKit's `error()` rather than `throw new Error()`
// like the rest of this file. A plain Error from a remote function never
// reaches the browser — SvelteKit replaces it with "Internal Error" — and here
// the message *is* the feature: it names which kind of history is in the way
// and points at decommissioning instead.

/** Actions an asset accumulates without ever leaving the shelf. */
const UNUSED_ASSET_ACTIONS = ['CREATED', 'UPDATED'];

export const deleteAsset = command(v.string(), async (assetId: string) => {
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);

	const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });

	if (!systemAdmin) {
		const membership = await prisma.orgMembership.findUnique({
			where: {
				userId_organizationId: { userId: user.id, organizationId: asset.organizationId }
			}
		});
		if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
			error(403, 'Unauthorized');
		}
	}

	const booked = await prisma.productionItem.findFirst({
		where: { assetId },
		include: { production: { select: { name: true } } }
	});
	if (booked) {
		error(
			409,
			`Asset has been booked for "${booked.production.name}" — decommission it instead of deleting it`
		);
	}

	const moved = await prisma.assetTransaction.findFirst({
		where: { assetId, action: { notIn: UNUSED_ASSET_ACTIONS } }
	});
	if (moved) {
		error(409, 'Asset has been scanned or checked out — decommission it instead of deleting it');
	}

	const inspected = await prisma.inspection.findFirst({ where: { assetId } });
	if (inspected) {
		error(409, 'Asset has an inspection on record — decommission it instead of deleting it');
	}

	// The FK is ON DELETE SET NULL, so this would succeed and quietly leave the
	// cables loose. Detaching is a deliberate act, and the person deleting a
	// parent should be the one to decide where its accessories go.
	const attached = await prisma.asset.findFirst({ where: { parentAssetId: assetId } });
	if (attached) {
		error(409, 'Other assets are attached to this one as accessories — detach them first');
	}

	const [offerLine, invoiceLine] = await Promise.all([
		prisma.offerItem.findFirst({ where: { assetId } }),
		prisma.invoiceItem.findFirst({ where: { assetId } })
	]);
	if (offerLine || invoiceLine) {
		error(409, 'Asset appears on an offer or invoice — decommission it instead of deleting it');
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
	netPurchasePrice: v.optional(v.nullable(v.pipe(v.number(), v.minValue(0))))
});

export const updateProduct = command(updateProductSchema, async (input) => {
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);
	if (!systemAdmin) {
		const memberships = await prisma.orgMembership.findMany({
			where: { userId: user.id, role: { in: ['ADMIN', 'OWNER'] } }
		});
		// The message matters here: the product wizard is reachable by any member,
		// and "Internal Error" would look like a broken save rather than a missing
		// right.
		if (memberships.length === 0) {
			error(403, 'You need admin rights in one of your organisations to edit products');
		}
	}

	const previousProduct = await prisma.product.findUniqueOrThrow({
		where: { id: input.productId },
		select: { manufacturerId: true }
	});

	const product = await prisma.product.update({
		where: { id: input.productId },
		data: {
			...(input.name ? { name: input.name.trim() } : {}),
			...(input.manufacturerId ? { manufacturerId: input.manufacturerId } : {}),
			...(input.categoryId ? { categoryId: input.categoryId } : {}),
			imagePath: input.imagePath !== undefined ? input.imagePath?.trim() || null : undefined,
			// Explicit null clears it; leaving the field out keeps what's stored,
			// so a form that doesn't show the price can't wipe it.
			...('netPurchasePrice' in input ? { netPurchasePrice: input.netPurchasePrice } : {})
		},
		include: { manufacturer: true, category: true }
	});

	await getProducts(product.manufacturerId).refresh();
	if (previousProduct.manufacturerId !== product.manufacturerId) {
		await getProducts(previousProduct.manufacturerId).refresh();
	}
	await getProducts().refresh();

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

	return product;
});

/** Delete a catalogue row only when no unit, including a retired one, refers to it. */
export const deleteProduct = command(v.string(), async (productId: string) => {
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);
	if (!systemAdmin) {
		const membership = await prisma.orgMembership.findFirst({
			where: { userId: user.id, role: { in: ['ADMIN', 'OWNER'] } },
			select: { id: true }
		});
		if (!membership) {
			error(403, 'You need admin rights in one of your organisations to delete products');
		}
	}

	const product = await prisma.product.findUniqueOrThrow({
		where: { id: productId },
		include: { manufacturer: true, _count: { select: { assets: true } } }
	});
	if (product._count.assets > 0) {
		error(409, 'This product still has units. Merge it into the correct product instead.');
	}

	await prisma.product.delete({ where: { id: productId } });
	const orgIds = await userOrgIds(user.id);
	await Promise.all([
		getProducts().refresh(),
		getProducts(product.manufacturerId).refresh(),
		getProductCatalog().refresh(),
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
		if (targetProductId === sourceProductId) error(409, 'A product cannot be merged into itself');

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
			const managed = await prisma.orgMembership.findMany({
				where: { userId: user.id, role: { in: ['ADMIN', 'OWNER'] } },
				select: { organizationId: true }
			});
			if (managed.length === 0) {
				error(403, 'You need admin rights in one of your organisations to merge products');
			}
			// The catalogue is global — any org admin can already rename any product
			// — but a merge moves *units*, and those belong to someone. The check is
			// on the source alone because it is the only side that loses records:
			// the target's units are not touched. A duplicate nobody owns has no
			// owning orgs and passes freely, which is the common cleanup case.
			const managedIds = managed.map((m) => m.organizationId);
			const foreign = [...new Set(moving.map((a) => a.organizationId))].filter(
				(id) => !managedIds.includes(id)
			);
			if (foreign.length > 0) {
				const orgs = await prisma.organization.findMany({
					where: { id: { in: foreign } },
					select: { name: true }
				});
				error(
					403,
					`Units of "${source.name}" belong to ${orgs.map((o) => o.name).join(', ')}. Only a system admin can move another organisation's inventory.`
				);
			}
		}

		// The two identities the merge picks between. Name, manufacturer and
		// category are the target's, always — that is what choosing a target
		// means. An image and a price are not identity, they are work someone did,
		// so an empty one on the target takes the source's rather than throwing it
		// away over which card the merge happened to be started from.
		const inherited = {
			...(!target.imagePath && source.imagePath ? { imagePath: source.imagePath } : {}),
			...(target.netPurchasePrice === null && source.netPurchasePrice !== null
				? { netPurchasePrice: source.netPurchasePrice }
				: {})
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
			await tx.product.delete({ where: { id: sourceProductId } });
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
			inheritedImage: 'imagePath' in inherited,
			inheritedPrice: 'netPurchasePrice' in inherited
		};
	}
);

// ── Bundle templates ─────────────────────────────────────────────────────────

export const getBundleTemplates = query(v.optional(v.string()), async (organizationId?: string) => {
	const user = await requireAuth();
	const queryOrgIds = await scopedOrgIds(user.id, organizationId);

	const templates = await prisma.bundleTemplate.findMany({
		where: { organizationId: { in: queryOrgIds } },
		include: {
			organization: true,
			category: true,
			instances: {
				include: {
					location: true,
					assets: {
						include: {
							product: { include: { manufacturer: true, category: true } },
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
				bundle.imagePath = await ensureBundleImageWithoutBreakingRead(bundle);
			})
		)
	);
	return templates;
});

// ── Bundles (instances) ──────────────────────────────────────────────────────

export const getBundles = query(v.optional(v.string()), async (organizationId?: string) => {
	const user = await requireAuth();
	const queryOrgIds = await scopedOrgIds(user.id, organizationId);

	const bundles = await prisma.assetBundle.findMany({
		where: { template: { organizationId: { in: queryOrgIds } } },
		include: {
			template: { include: { organization: true, category: true } },
			location: true,
			assets: {
				include: { product: { include: { manufacturer: true, category: true } }, location: true },
				orderBy: ASSET_ORDER_BY
			}
		},
		orderBy: [{ template: { name: 'asc' } }, { tag: { sort: 'asc', nulls: 'last' } }]
	});
	await Promise.all(bundles.map((bundle) => ensureBundleImageWithoutBreakingRead(bundle)));
	return bundles;
});

export const getBundle = query(v.string(), async (id: string) => {
	const user = await requireAuth();
	const bundle = await prisma.assetBundle.findUniqueOrThrow({
		where: { id },
		include: {
			template: { include: { organization: true, category: true } },
			location: true,
			assets: {
				include: {
					product: { include: { manufacturer: true, category: true } },
					organization: true,
					location: true
				},
				orderBy: ASSET_ORDER_BY
			}
		}
	});

	const orgIds = await userOrgIds(user.id);
	if (!orgIds.includes(bundle.template.organizationId) && !(await isSystemAdmin(user.id))) {
		throw new Error('Unauthorized');
	}

	await ensureBundleImageWithoutBreakingRead(bundle);
	return bundle;
});

export const regenerateBundleImage = command(v.string(), async (bundleId) => {
	const user = await requireAuth();
	const bundle = await prisma.assetBundle.findUniqueOrThrow({
		where: { id: bundleId },
		include: {
			template: { include: { category: true } },
			assets: { include: { product: true } }
		}
	});
	const membership = await prisma.orgMembership.findUnique({
		where: {
			userId_organizationId: {
				userId: user.id,
				organizationId: bundle.template.organizationId
			}
		}
	});
	if (!(await isSystemAdmin(user.id)) && !membership) error(403, 'Unauthorized');

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
		throw new Error(`Tag "${tag}" is already used by another bundle`);
	}
}

const createBundleInstanceSchema = v.object({
	organizationId: v.string(),
	templateId: v.optional(v.string()),
	newTemplateName: v.optional(v.string()),
	description: v.optional(v.string()),
	categoryId: v.optional(v.string()),
	tag: v.optional(v.string())
});

export const createBundleInstance = command(createBundleInstanceSchema, async (data) => {
	const user = await requireAuth();
	const membership = await prisma.orgMembership.findUnique({
		where: { userId_organizationId: { userId: user.id, organizationId: data.organizationId } }
	});
	if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
		throw new Error('Unauthorized');
	}

	// An existing template must belong to the org the caller was authorized for —
	// otherwise ADMIN in one org could hang instances off another org's template.
	if (data.templateId) {
		const existing = await prisma.bundleTemplate.findUniqueOrThrow({
			where: { id: data.templateId },
			select: { organizationId: true }
		});
		if (existing.organizationId !== data.organizationId) throw new Error('Unauthorized');
	}

	await assertBundleTagAvailable(data.tag?.trim() || null);

	let templateId = data.templateId;
	if (data.newTemplateName && !templateId) {
		if (!data.categoryId) throw new Error('Category is required when creating a new bundle type');
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

	if (!templateId) throw new Error('Bundle type is required');

	const bundle = await prisma.assetBundle.create({
		data: {
			templateId,
			tag: data.tag?.trim() || undefined
		},
		include: { template: { include: { organization: true, category: true } }, assets: true }
	});
	await getBundleTemplates(data.organizationId).refresh();
	await getBundleTemplates().refresh();
	await getBundles(data.organizationId).refresh();
	await getBundles().refresh();
	return bundle;
});

const updateBundleTemplateSchema = v.object({
	templateId: v.string(),
	name: v.optional(v.string()),
	description: v.optional(v.string()),
	categoryId: v.optional(v.string())
});

export const updateBundleTemplate = command(updateBundleTemplateSchema, async (input) => {
	const user = await requireAuth();
	const template = await prisma.bundleTemplate.findUniqueOrThrow({
		where: { id: input.templateId }
	});
	const membership = await prisma.orgMembership.findUnique({
		where: {
			userId_organizationId: { userId: user.id, organizationId: template.organizationId }
		}
	});
	if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
		throw new Error('Unauthorized');
	}

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

const updateBundleSchema = v.object({
	bundleId: v.string(),
	tag: v.optional(v.nullable(v.string())),
	locationId: v.optional(v.nullable(v.string())),
	netPurchasePrice: v.optional(v.nullable(v.number()))
});

export const updateBundle = command(updateBundleSchema, async (input) => {
	const user = await requireAuth();
	const bundle = await prisma.assetBundle.findUniqueOrThrow({
		where: { id: input.bundleId },
		include: { template: true, assets: { select: { id: true } } }
	});
	const membership = await prisma.orgMembership.findUnique({
		where: {
			userId_organizationId: { userId: user.id, organizationId: bundle.template.organizationId }
		}
	});
	if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
		throw new Error('Unauthorized');
	}

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
	await getBundle(input.bundleId).refresh();
	await getAssets(bundle.template.organizationId).refresh();
	return updated;
});

const bundleAssetSchema = v.object({ bundleId: v.string(), assetId: v.string() });

export const addAssetToBundle = command(bundleAssetSchema, async ({ bundleId, assetId }) => {
	await requireAuth();
	const bundle = await prisma.assetBundle.findUniqueOrThrow({
		where: { id: bundleId },
		include: { template: true }
	});
	const asset = await prisma.asset.findUniqueOrThrow({
		where: { id: assetId },
		select: {
			status: true,
			bundleId: true,
			parentAssetId: true,
			bundle: { select: { template: true } }
		}
	});
	if (isRetiredStatus(asset.status)) {
		throw new Error('This asset is sold or decommissioned and cannot be added to a bundle');
	}
	// An accessory is in whatever kit its parent is in and no other. Both
	// pickers leave accessories out, so this is a stale page.
	if (asset.parentAssetId) {
		throw new Error(
			'This asset is an accessory — put the unit it is attached to in the bundle instead'
		);
	}
	// A unit belongs to one kit at a time. Both pickers already leave bundled
	// assets out, so reaching here means a stale page — moving it silently would
	// take it out of the other bundle without anyone seeing.
	if (asset.bundleId && asset.bundleId !== bundleId) {
		throw new Error(
			`This asset is already in the bundle "${asset.bundle?.template.name}" — remove it there first`
		);
	}
	const updateData: { bundleId: string; locationId?: string } = { bundleId };
	if (bundle.locationId) updateData.locationId = bundle.locationId;
	await prisma.$transaction(async (tx) => {
		await tx.asset.update({ where: { id: assetId }, data: updateData });
		// Whatever is attached to it comes along — the kit ships as one thing.
		await syncAccessories(tx, assetId, updateData);
	});
	await getBundleTemplates(bundle.template.organizationId).refresh();
	await getBundles(bundle.template.organizationId).refresh();
	await getBundle(bundleId).refresh();
	await getAssets(bundle.template.organizationId).refresh();
	return { bundleId, assetId };
});

export const removeAssetFromBundle = command(bundleAssetSchema, async ({ bundleId, assetId }) => {
	await requireAuth();
	const bundle = await prisma.assetBundle.findUniqueOrThrow({
		where: { id: bundleId },
		include: { template: true }
	});
	await prisma.$transaction(async (tx) => {
		await tx.asset.update({ where: { id: assetId }, data: { bundleId: null } });
		await syncAccessories(tx, assetId, { bundleId: null });
	});
	await getBundleTemplates(bundle.template.organizationId).refresh();
	await getBundles(bundle.template.organizationId).refresh();
	await getBundle(bundleId).refresh();
	await getAssets(bundle.template.organizationId).refresh();
	return { bundleId, assetId };
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
		const systemAdmin = await isSystemAdmin(user.id);
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

		if (!systemAdmin) {
			const membership = await prisma.orgMembership.findUnique({
				where: {
					userId_organizationId: {
						userId: user.id,
						organizationId: bundle.template.organizationId
					}
				}
			});
			if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
				error(403, 'Unauthorized');
			}
		}

		if (bundle.assets.length < 2) {
			error(409, 'A bundle needs at least two devices to be converted');
		}
		const main = bundle.assets.find((asset) => asset.id === mainAssetId);
		if (!main) error(409, 'The selected main device is not in this bundle');
		if (main.parentAssetId) {
			error(409, 'The main device cannot itself be an accessory');
		}
		if (bundle.assets.some((asset) => asset.organizationId !== main.organizationId)) {
			error(409, 'All bundle members must belong to the same organisation');
		}

		const newlyAttached = bundle.assets.filter(
			(asset) => asset.id !== main.id && asset.parentAssetId !== main.id
		);
		const productionIds = [...new Set(bundle.productionItems.map((item) => item.productionId))];
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

	return {
		unitCount: units.length,
		accessories: [...byProduct.values()]
			.map((tally) => ({
				productId: tally.productId,
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
			throw new Error('Unauthorized');
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

const addProductAccessoriesSchema = v.object({
	organizationId: v.string(),
	/** The product whose every unit is getting one — not the accessory's own. */
	parentProductId: v.string(),
	...productRefSchema,
	perUnit: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20)),
	noAssetTag: v.optional(v.boolean())
});

/**
 * Give every unit of a product its own copy of the same accessory. Adding a
 * power cable to each of twenty fixtures one unit at a time is forty clicks and
 * a list to keep in your head of which ones you have done.
 *
 * Each unit gets its *own* accessory assets rather than a shared one — that is
 * what an accessory is here, a full asset with its own tag and its own DGUV
 * record, and a cable in the case of fixture 12 is not the cable in the case of
 * fixture 13.
 *
 * It tops up rather than adding blindly: `perUnit` is the number each unit
 * should end with, so running it twice does nothing the second time and a unit
 * that already has one of two gets the one it is missing.
 */
export const addProductAccessories = command(addProductAccessoriesSchema, async (data) => {
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);
	if (!systemAdmin) {
		const membership = await prisma.orgMembership.findUnique({
			where: {
				userId_organizationId: { userId: user.id, organizationId: data.organizationId }
			}
		});
		if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
			error(403, 'Unauthorized');
		}
	}

	const accessoryProductId = await resolveProductRef(data);
	if (accessoryProductId === data.parentProductId) {
		error(409, 'A product cannot be an accessory of itself');
	}

	// Only units that can hold an accessory: active, and not accessories
	// themselves. `accessories` is narrowed to the one product so its length is
	// the count this run is topping up.
	const units = await prisma.asset.findMany({
		where: {
			productId: data.parentProductId,
			organizationId: data.organizationId,
			parentAssetId: null,
			...ACTIVE_ASSET_WHERE
		},
		select: {
			id: true,
			locationId: true,
			bundleId: true,
			assetTag: true,
			product: { select: { name: true, manufacturer: { select: { name: true } } } },
			accessories: {
				where: { productId: accessoryProductId, ...ACTIVE_ASSET_WHERE },
				select: { id: true }
			}
		},
		orderBy: ASSET_ORDER_BY
	});
	if (units.length === 0) error(409, 'This organisation has no units of that product');

	const todo = units
		.map((unit) => ({ unit, missing: data.perUnit - unit.accessories.length }))
		.filter(({ missing }) => missing > 0);

	const createdIds = await prisma.$transaction(async (tx) => {
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

		const ids: string[] = [];
		for (const { unit, missing } of todo) {
			for (let n = 0; n < missing; n++) {
				const created = await createAccessoryRecord(tx, {
					userId: user.id,
					organizationId: data.organizationId,
					productId: accessoryProductId,
					assetTag: data.noAssetTag ? null : nextTag(),
					inspectionIntervalMonths: defaultInspectionIntervalMonths,
					nextInspectionDue,
					parent: unit
				});
				ids.push(created.id);
			}
		}
		return ids;
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
		...todo.flatMap(({ unit }) => [
			getAsset(unit.id).refresh(),
			getAssetHistory(unit.id).refresh()
		]),
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
		unitsTouched: todo.length,
		unitsSkipped: units.length - todo.length
	};
});

const accessoryLinkSchema = v.object({ parentId: v.string(), assetId: v.string() });

export const attachAccessory = command(accessoryLinkSchema, async ({ parentId, assetId }) => {
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);

	if (parentId === assetId) error(400, 'An asset cannot be its own accessory');

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

	if (!systemAdmin) {
		const membership = await prisma.orgMembership.findUnique({
			where: {
				userId_organizationId: { userId: user.id, organizationId: parent.organizationId }
			}
		});
		if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
			error(403, 'Unauthorized');
		}
	}

	// Rule 1 of the feature, guard by guard. Every one of these is reachable
	// from a stale page, so each says what to do rather than just refusing.
	if (isRetiredStatus(parent.status) || isRetiredStatus(asset.status)) {
		error(409, 'A sold or decommissioned unit cannot be attached to anything');
	}
	if (parent.organizationId !== asset.organizationId) {
		error(409, 'An accessory has to belong to the same organisation as what it is attached to');
	}
	if (parent.parentAssetId) {
		error(409, 'That unit is itself an accessory — accessories are one level deep');
	}
	if (asset.accessories.length > 0) {
		error(409, 'That unit has accessories of its own — detach those first');
	}
	if (asset.parentAssetId && asset.parentAssetId !== parentId) {
		error(409, 'That unit is already attached to another asset — detach it there first');
	}
	// It follows the parent into a kit; it can't arrive carrying a different one.
	if (asset.bundleId && asset.bundleId !== parent.bundleId) {
		error(
			409,
			`That unit is in the bundle "${asset.bundle?.template.name}" — remove it there first`
		);
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
	const systemAdmin = await isSystemAdmin(user.id);

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
	if (!asset.parentAssetId || !asset.parent) error(409, 'That asset is not an accessory');

	if (!systemAdmin) {
		const membership = await prisma.orgMembership.findUnique({
			where: {
				userId_organizationId: { userId: user.id, organizationId: asset.organizationId }
			}
		});
		if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
			error(403, 'Unauthorized');
		}
	}

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

	const membership = await prisma.orgMembership.findUnique({
		where: { userId_organizationId: { userId: user.id, organizationId: data.organizationId } }
	});
	if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
		throw new Error('Unauthorized to create assets in this organization');
	}

	const location = await prisma.location.findUniqueOrThrow({ where: { id: data.locationId } });
	if (location.organizationId !== data.organizationId) throw new Error('Invalid location');

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
				data: { name: row.productName.trim(), manufacturerId, categoryId: row.categoryId }
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
		await getAssets(data.organizationId).refresh();
		await getInventorySummary(data.organizationId).refresh();
		await getInventorySummary().refresh();
		await getManufacturers().refresh();
		await getProducts().refresh();
	}

	return { created, skipped, errors };
});
