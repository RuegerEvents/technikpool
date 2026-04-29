import { query, command, getRequestEvent } from '$app/server';
import { prisma } from '$lib/server/auth';
import * as v from 'valibot';

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
			product: { include: { manufacturer: true } },
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
			product: { include: { manufacturer: true } },
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
		include: { address: true },
		orderBy: { name: 'asc' }
	});
});

const addressInputSchema = v.object({
	line1: v.optional(v.string()),
	line2: v.optional(v.string()),
	postalCode: v.optional(v.string()),
	city: v.optional(v.string()),
	region: v.optional(v.string()),
	country: v.optional(v.string())
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
				line1: input.address.line1?.trim() || null,
				line2: input.address.line2?.trim() || null,
				postalCode: input.address.postalCode?.trim() || null,
				city: input.address.city?.trim() || null,
				region: input.address.region?.trim() || null,
				country: input.address.country?.trim() || null
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

	getLocations(input.organizationId).refresh();
	getLocations().refresh();
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
					line1: input.address.line1?.trim() || null,
					line2: input.address.line2?.trim() || null,
					postalCode: input.address.postalCode?.trim() || null,
					city: input.address.city?.trim() || null,
					region: input.address.region?.trim() || null,
					country: input.address.country?.trim() || null
				}
			});
		}

		return await tx.location.update({
			where: { id: input.locationId },
			data: input.name ? { name: input.name.trim() } : {},
			include: { address: true }
		});
	});

	getLocations(location.organizationId).refresh();
	getLocations().refresh();
	return updated;
});

export const getProducts = query(v.optional(v.string()), async (manufacturerId?: string) => {
	await requireAuth();
	return await prisma.product.findMany({
		where: manufacturerId ? { manufacturerId } : undefined,
		orderBy: { name: 'asc' },
		include: { manufacturer: true }
	});
});

const createAssetsSchema = v.object({
	organizationId: v.string(),
	locationId: v.string(),
	productId: v.optional(v.string()),
	newProductName: v.optional(v.string()),
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
		getManufacturers().refresh();
		getProducts().refresh();
	}

	let productId = data.productId;
	if (data.newProductName && !productId && manufacturerId) {
		const p = await prisma.product.create({
			data: { name: data.newProductName, manufacturerId }
		});
		productId = p.id;
		getProducts(manufacturerId).refresh();
	}

	if (!productId) throw new Error('Product is required');

	const location = await prisma.location.findUniqueOrThrow({ where: { id: data.locationId } });
	if (location.organizationId !== data.organizationId) throw new Error('Invalid location');

	const assets = await Promise.all(
		data.items.map((item) =>
			prisma.asset.create({
				data: {
					organizationId: data.organizationId,
					productId: productId!,
					locationId: location.id,
					serialNumber: item.serialNumber || null,
					assetTag: item.assetTag || null,
					status: 'AVAILABLE',
					transactions: {
						create: { userId: user.id, action: 'CREATED', notes: 'Asset initialized' }
					}
				},
				include: { product: { include: { manufacturer: true } }, location: true }
			})
		)
	);

	getAssets(data.organizationId).refresh();
	getInventorySummary(data.organizationId).refresh();
	getInventorySummary().refresh();

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
	imageUrl: v.optional(v.string()),
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

	let nextLocationId: string | undefined = undefined;
	if ('locationId' in input) {
		if (input.locationId) {
			const location = await prisma.location.findUniqueOrThrow({
				where: { id: input.locationId }
			});
			if (location.organizationId !== asset.organizationId) {
				throw new Error('Invalid location');
			}
			nextLocationId = location.id;
		} else {
			throw new Error('Location is required');
		}
	}

	const updateData: {
		serialNumber?: string | null;
		assetTag?: string | null;
		status?: string;
		imageUrl?: string | null;
		locationId?: string;
	} = {};

	const changes: string[] = [];
	if ('serialNumber' in input) {
		const serialNumber = input.serialNumber?.trim() || null;
		updateData.serialNumber = serialNumber;
		if (serialNumber !== asset.serialNumber)
			changes.push(`serialNumber: ${asset.serialNumber ?? '—'} → ${serialNumber ?? '—'}`);
	}
	if ('assetTag' in input) {
		const assetTag = input.assetTag?.trim() || null;
		updateData.assetTag = assetTag;
		if (assetTag !== asset.assetTag)
			changes.push(`assetTag: ${asset.assetTag ?? '—'} → ${assetTag ?? '—'}`);
	}
	if ('status' in input && input.status) {
		updateData.status = input.status;
		if (input.status !== asset.status) changes.push(`status: ${asset.status} → ${input.status}`);
	}
	if ('imageUrl' in input) {
		const imageUrl = input.imageUrl?.trim() || null;
		updateData.imageUrl = imageUrl;
		if (imageUrl !== asset.imageUrl)
			changes.push(`imageUrl: ${asset.imageUrl ?? '—'} → ${imageUrl ?? '—'}`);
	}
	if ('locationId' in input && nextLocationId !== undefined) {
		updateData.locationId = nextLocationId;
		if (nextLocationId !== asset.locationId)
			changes.push(`location: ${asset.location?.name ?? '—'} → ${nextLocationId ? 'set' : '—'}`);
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
				notes: changes.join('\n')
			}
		});
	}

	getAsset(input.assetId).refresh();
	getAssetHistory(input.assetId).refresh();
	getAssets(asset.organizationId).refresh();
	getInventorySummary(asset.organizationId).refresh();
	getInventorySummary().refresh();
	getLocations(asset.organizationId).refresh();

	return updated;
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
			assets: {
				include: { product: { include: { manufacturer: true } } }
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
			assets: {
				include: {
					product: { include: { manufacturer: true } },
					organization: true
				}
			}
		}
	});
});

const createBundleSchema = v.object({
	name: v.string(),
	description: v.optional(v.string()),
	organizationId: v.string()
});

export const createBundle = command(createBundleSchema, async (data) => {
	const user = await requireAuth();
	const membership = await prisma.orgMembership.findUnique({
		where: { userId_organizationId: { userId: user.id, organizationId: data.organizationId } }
	});
	if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
		throw new Error('Unauthorized');
	}
	const bundle = await prisma.assetBundle.create({
		data: { name: data.name, description: data.description, organizationId: data.organizationId },
		include: { organization: true, assets: true }
	});
	getBundles(data.organizationId).refresh();
	getBundles().refresh();
	return bundle;
});

const bundleAssetSchema = v.object({ bundleId: v.string(), assetId: v.string() });

export const addAssetToBundle = command(bundleAssetSchema, async ({ bundleId, assetId }) => {
	await requireAuth();
	const bundle = await prisma.assetBundle.findUniqueOrThrow({ where: { id: bundleId } });
	await prisma.asset.update({ where: { id: assetId }, data: { bundleId } });
	getBundles(bundle.organizationId).refresh();
	getBundle(bundleId).refresh();
	getAssets(bundle.organizationId).refresh();
	return { bundleId, assetId };
});

export const removeAssetFromBundle = command(bundleAssetSchema, async ({ bundleId, assetId }) => {
	await requireAuth();
	const bundle = await prisma.assetBundle.findUniqueOrThrow({ where: { id: bundleId } });
	await prisma.asset.update({ where: { id: assetId }, data: { bundleId: null } });
	getBundles(bundle.organizationId).refresh();
	getBundle(bundleId).refresh();
	getAssets(bundle.organizationId).refresh();
	return { bundleId, assetId };
});
