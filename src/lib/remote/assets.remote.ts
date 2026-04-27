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

	const assets = await Promise.all(
		data.items.map((item) =>
			prisma.asset.create({
				data: {
					organizationId: data.organizationId,
					productId: productId!,
					serialNumber: item.serialNumber || null,
					assetTag: item.assetTag || null,
					status: 'AVAILABLE',
					transactions: {
						create: { userId: user.id, action: 'CREATED', notes: 'Asset initialized' }
					}
				},
				include: { product: { include: { manufacturer: true } } }
			})
		)
	);

	getAssets(data.organizationId).refresh();
	getInventorySummary(data.organizationId).refresh();
	getInventorySummary().refresh();

	return assets;
});

export const getAssetHistory = query(v.string(), async (assetId: string) => {
	await requireAuth();
	return await prisma.assetTransaction.findMany({
		where: { assetId },
		include: {
			user: { select: { name: true, email: true } },
			production: { select: { name: true } }
		},
		orderBy: { createdAt: 'desc' }
	});
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
