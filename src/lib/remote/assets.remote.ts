import { query, command, getRequestEvent } from '$app/server';
import { prisma } from '$lib/server/auth';
import * as v from 'valibot';
import type { FieldChange } from '$lib/types/asset-transaction';

async function requireAuth() {
	const event = await getRequestEvent();
	if (!event?.locals.user) {
		throw new Error('Unauthorized');
	}
	return event.locals.user;
}

async function userOrgIds(userId: string) {
	const memberships = await prisma.orgMembership.findMany({
		where: { userId },
		select: { organizationId: true }
	});
	return memberships.map((m) => m.organizationId);
}

async function isSystemAdmin(userId: string) {
	const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
	return user?.isAdmin ?? false;
}

export const getAssets = query(v.optional(v.string()), async (organizationId?: string) => {
	const user = await requireAuth();
	const orgIds = await userOrgIds(user.id);
	const queryOrgIds = organizationId ? [organizationId] : orgIds;

	return await prisma.asset.findMany({
		where: { organizationId: { in: queryOrgIds } },
		include: {
			product: { include: { manufacturer: true, category: true } },
			location: true,
			organization: true,
			bundle: { select: { id: true, name: true } }
		},
		orderBy: [{ product: { name: 'asc' } }]
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
			bundle: { select: { id: true, name: true, organizationId: true } }
		}
	});

	if (!systemAdmin && !orgIds.includes(asset.organizationId)) {
		throw new Error('Unauthorized');
	}

	return asset;
});

export const getInventorySummary = query(
	v.optional(v.string()),
	async (organizationId?: string) => {
		const user = await requireAuth();
		const orgIds = await userOrgIds(user.id);
		const queryOrgIds = organizationId ? [organizationId] : orgIds;

		const products = await prisma.product.findMany({
			include: {
				manufacturer: true,
				assets: {
					where: { organizationId: { in: queryOrgIds } },
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

export const getLocations = query(v.optional(v.string()), async (organizationId?: string) => {
	const user = await requireAuth();
	const orgIds = await userOrgIds(user.id);
	const queryOrgIds = organizationId ? [organizationId] : orgIds;
	const systemAdmin = await isSystemAdmin(user.id);

	if (!systemAdmin && organizationId && !orgIds.includes(organizationId)) {
		throw new Error('Unauthorized');
	}

	return await prisma.location.findMany({
		where: { organizationId: { in: queryOrgIds } },
		include: { address: true, organization: { select: { name: true } } },
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

const createAssetsSchema = v.object({
	organizationId: v.string(),
	locationId: v.string(),
	productId: v.optional(v.string()),
	newProductName: v.optional(v.string()),
	newProductImageUrl: v.optional(v.string()),
	categoryId: v.optional(v.string()),
	manufacturerId: v.optional(v.string()),
	newManufacturerName: v.optional(v.string()),
	items: v.array(
		v.object({
			serialNumber: v.optional(v.string()),
			assetTag: v.optional(v.string())
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

	let manufacturerId = data.manufacturerId;
	if (data.newManufacturerName && !manufacturerId) {
		const m = await prisma.manufacturer.create({ data: { name: data.newManufacturerName } });
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
				imageUrl: data.newProductImageUrl?.trim() || null
			}
		});
		productId = p.id;
		await getProducts(manufacturerId).refresh();
	}

	if (!productId) throw new Error('Product is required');

	const location = await prisma.location.findUniqueOrThrow({ where: { id: data.locationId } });
	if (location.organizationId !== data.organizationId) throw new Error('Invalid location');

	const assets = await prisma.$transaction(async (tx) => {
		const { assetIdPrefix: prefix } = await tx.organization.findUniqueOrThrow({
			where: { id: data.organizationId },
			select: { assetIdPrefix: true }
		});

		const last = await tx.asset.findFirst({
			where: { assetTag: { startsWith: prefix } },
			orderBy: { assetTag: 'desc' },
			select: { assetTag: true }
		});
		let nextNum = 1;
		if (last?.assetTag) {
			const parsed = parseInt(last.assetTag.slice(prefix.length), 10);
			if (!isNaN(parsed)) nextNum = parsed + 1;
		}

		return Promise.all(
			data.items.map((item, idx) => {
				let resolvedTag: string;
				if (item.assetTag?.trim()) {
					const tag = item.assetTag.trim();
					if (!tag.startsWith(prefix))
						throw new Error(`Asset tag "${tag}" must start with org prefix "${prefix}"`);
					resolvedTag = tag;
				} else {
					resolvedTag = `${prefix}${String(nextNum + idx).padStart(5, '0')}`;
				}

				return tx.asset.create({
					data: {
						organizationId: data.organizationId,
						productId: productId!,
						locationId: location.id,
						serialNumber: item.serialNumber || null,
						assetTag: resolvedTag,
						status: 'AVAILABLE',
						transactions: {
							create: { userId: user.id, action: 'CREATED', data: { type: 'CREATED' } }
						}
					},
					include: { product: { include: { manufacturer: true, category: true } }, location: true }
				});
			})
		);
	});

	await getAssets(data.organizationId).refresh();
	await getInventorySummary(data.organizationId).refresh();
	await getInventorySummary().refresh();

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
	status: v.optional(v.picklist(['AVAILABLE', 'MAINTENANCE', 'BROKEN'])),
	locationId: v.optional(v.string())
});

export const updateAsset = command(updateAssetSchema, async (input) => {
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);

	const asset = await prisma.asset.findUniqueOrThrow({
		where: { id: input.assetId },
		include: { location: true, product: true }
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
	} = {};

	const changes: FieldChange[] = [];
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
	if ('status' in input && input.status) {
		updateData.status = input.status;
		if (input.status !== asset.status)
			changes.push({ field: 'status', from: asset.status, to: input.status });
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

	const updated = await prisma.asset.update({
		where: { id: input.assetId },
		data: updateData,
		include: {
			product: { include: { manufacturer: true } },
			location: true,
			organization: true,
			bundle: { select: { id: true, name: true, organizationId: true } }
		}
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
	await getAssets(asset.organizationId).refresh();
	await getInventorySummary(asset.organizationId).refresh();
	await getInventorySummary().refresh();
	await getLocations(asset.organizationId).refresh();

	return updated;
});

const updateProductSchema = v.object({
	productId: v.string(),
	name: v.optional(v.string()),
	categoryId: v.optional(v.string()),
	imageUrl: v.optional(v.string())
});

export const updateProduct = command(updateProductSchema, async (input) => {
	const user = await requireAuth();
	const systemAdmin = await isSystemAdmin(user.id);
	if (!systemAdmin) {
		const memberships = await prisma.orgMembership.findMany({
			where: { userId: user.id, role: { in: ['ADMIN', 'OWNER'] } }
		});
		if (memberships.length === 0) throw new Error('Unauthorized');
	}

	const product = await prisma.product.update({
		where: { id: input.productId },
		data: {
			...(input.name ? { name: input.name.trim() } : {}),
			...(input.categoryId ? { categoryId: input.categoryId } : {}),
			imageUrl: input.imageUrl !== undefined ? input.imageUrl?.trim() || null : undefined
		},
		include: { manufacturer: true, category: true }
	});

	await getProducts(product.manufacturerId).refresh();
	await getProducts().refresh();

	const affectedAssets = await prisma.asset.findMany({
		where: { productId: product.id },
		select: { id: true }
	});
	await Promise.all(affectedAssets.map((a) => getAsset(a.id).refresh()));

	return product;
});

// ── Bundles ───────────────────────────────────────────────────────────────────

export const getBundles = query(v.optional(v.string()), async (organizationId?: string) => {
	const user = await requireAuth();
	const orgIds = await userOrgIds(user.id);
	const queryOrgIds = organizationId ? [organizationId] : orgIds;

	return await prisma.assetBundle.findMany({
		where: { organizationId: { in: queryOrgIds } },
		include: {
			organization: true,
			category: true,
			location: true,
			assets: {
				include: { product: { include: { manufacturer: true, category: true } }, location: true }
			}
		},
		orderBy: { name: 'asc' }
	});
});

export const getBundle = query(v.string(), async (id: string) => {
	await requireAuth();
	return await prisma.assetBundle.findUniqueOrThrow({
		where: { id },
		include: {
			organization: true,
			category: true,
			location: true,
			assets: {
				include: {
					product: { include: { manufacturer: true, category: true } },
					organization: true,
					location: true
				}
			}
		}
	});
});

const createBundleSchema = v.object({
	name: v.string(),
	description: v.optional(v.string()),
	organizationId: v.string(),
	categoryId: v.string()
});

export const createBundle = command(createBundleSchema, async (data) => {
	const user = await requireAuth();
	const membership = await prisma.orgMembership.findUnique({
		where: { userId_organizationId: { userId: user.id, organizationId: data.organizationId } }
	});
	if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
		throw new Error('Unauthorized');
	}
	await prisma.category.findUniqueOrThrow({ where: { id: data.categoryId } });
	const bundle = await prisma.assetBundle.create({
		data: {
			name: data.name,
			description: data.description,
			organizationId: data.organizationId,
			categoryId: data.categoryId
		},
		include: { organization: true, assets: true, category: true }
	});
	await getBundles(data.organizationId).refresh();
	await getBundles().refresh();
	return bundle;
});

const updateBundleSchema = v.object({
	bundleId: v.string(),
	name: v.optional(v.string()),
	description: v.optional(v.string()),
	categoryId: v.optional(v.string()),
	locationId: v.optional(v.nullable(v.string()))
});

export const updateBundle = command(updateBundleSchema, async (input) => {
	const user = await requireAuth();
	const bundle = await prisma.assetBundle.findUniqueOrThrow({
		where: { id: input.bundleId },
		include: { assets: { select: { id: true } } }
	});
	const membership = await prisma.orgMembership.findUnique({
		where: { userId_organizationId: { userId: user.id, organizationId: bundle.organizationId } }
	});
	if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
		throw new Error('Unauthorized');
	}

	const data: {
		name?: string;
		description?: string | null;
		categoryId?: string;
		locationId?: string | null;
	} = {};
	if (input.name !== undefined) data.name = input.name.trim();
	if ('description' in input) data.description = input.description?.trim() || null;
	if (input.categoryId !== undefined) data.categoryId = input.categoryId;
	if ('locationId' in input) data.locationId = input.locationId ?? null;

	const updated = await prisma.$transaction(async (tx) => {
		const result = await tx.assetBundle.update({
			where: { id: input.bundleId },
			data,
			include: { organization: true, category: true, location: true }
		});
		if (input.locationId) {
			await tx.asset.updateMany({
				where: { bundleId: input.bundleId },
				data: { locationId: input.locationId }
			});
		}
		return result;
	});

	await getBundles(bundle.organizationId).refresh();
	await getBundle(input.bundleId).refresh();
	await getAssets(bundle.organizationId).refresh();
	return updated;
});

const bundleAssetSchema = v.object({ bundleId: v.string(), assetId: v.string() });

export const addAssetToBundle = command(bundleAssetSchema, async ({ bundleId, assetId }) => {
	await requireAuth();
	const bundle = await prisma.assetBundle.findUniqueOrThrow({ where: { id: bundleId } });
	const updateData: { bundleId: string; locationId?: string } = { bundleId };
	if (bundle.locationId) updateData.locationId = bundle.locationId;
	await prisma.asset.update({ where: { id: assetId }, data: updateData });
	await getBundles(bundle.organizationId).refresh();
	await getBundle(bundleId).refresh();
	await getAssets(bundle.organizationId).refresh();
	return { bundleId, assetId };
});

export const removeAssetFromBundle = command(bundleAssetSchema, async ({ bundleId, assetId }) => {
	await requireAuth();
	const bundle = await prisma.assetBundle.findUniqueOrThrow({ where: { id: bundleId } });
	await prisma.asset.update({ where: { id: assetId }, data: { bundleId: null } });
	await getBundles(bundle.organizationId).refresh();
	await getBundle(bundleId).refresh();
	await getAssets(bundle.organizationId).refresh();
	return { bundleId, assetId };
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
